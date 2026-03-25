/**
 * Marca las primeras N empresas como 'pending' (sin borrar sus datos)
 * y luego las re-enriquece con la cadena de IA.
 *
 * Uso: npx tsx scripts/requeue-top.ts [--limit 20] [--delay 1500]
 */
import 'dotenv/config';
import pg from 'pg';
import { EnrichmentService } from '../server/services/enrichment.service.js';

const { Pool } = pg;
const args     = process.argv.slice(2);
const getArg   = (f: string, d: number) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? parseInt(args[i+1],10) : d; };
const LIMIT = getArg('--limit', 20);
const DELAY = getArg('--delay', 1500);

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no configurado'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ALLOWED = new Set(['industry','company_size','hq_city','hq_province','hq_country',
  'exact_address','phone','contact_email','website','description','known_ats_portal','enrichment_status']);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // 1. Cambiar status a 'pending' (sin tocar ningún otro campo)
  const updated = await pool.query(
    `UPDATE companies SET enrichment_status = 'pending', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM companies ORDER BY created_at ASC LIMIT $1
     ) RETURNING id, name`,
    [LIMIT]
  );
  console.log(`\n🔄  ${updated.rowCount} empresas marcadas como 'pending':`)
  updated.rows.forEach((r,i) => console.log(`    ${i+1}. ${r.name}`));
  console.log('');

  // 2. Procesar cada una
  let done = 0, skipped = 0, failed = 0;
  for (let i = 0; i < (updated.rowCount ?? 0); i++) {
    const { id, name } = updated.rows[i];
    process.stdout.write(`[${i+1}/${updated.rowCount}] ${name} … `);

    try {
      const data = await EnrichmentService.enrichCompany(name);
      const hasData = !!(data.industry || (data.description && data.website));
      const newStatus = hasData ? 'scraped' : 'failed';

      const payload: Record<string,any> = { enrichment_status: newStatus };
      if (data.industry)      payload.industry      = data.industry;
      if (data.company_size)  payload.company_size  = data.company_size;
      if (data.hq_city)       payload.hq_city       = data.hq_city;
      if (data.hq_province)   payload.hq_province   = data.hq_province;
      if (data.hq_country)    payload.hq_country    = data.hq_country;
      if (data.exact_address) payload.exact_address = data.exact_address;
      if (data.phone)         payload.phone         = data.phone;
      if (data.contact_email) payload.contact_email = data.contact_email;
      if (data.website)       payload.website       = data.website;
      if (data.description)   payload.description   = data.description;

      const keys   = Object.keys(payload).filter(k => ALLOWED.has(k));
      const setSQL = keys.map((k, j) => `"${k}" = $${j+2}`).join(', ');
      await pool.query(
        `UPDATE companies SET ${setSQL}, updated_at = NOW(), enriched_at = NOW() WHERE id = $1`,
        [id, ...keys.map(k => payload[k])]
      );

      if (hasData) {
        console.log(`✅  ${newStatus}  [${data._provider}]  ${[data.hq_city, data.hq_province].filter(Boolean).join(', ')}`);
        done++;
      } else {
        console.log(`⚠️   sin datos`);
        failed++;
      }
    } catch (err: any) {
      await pool.query(`UPDATE companies SET enrichment_status = 'scraped' WHERE id = $1 AND enrichment_status = 'pending'`, [id]).catch(()=>{});
      console.log(`❌  error: ${err.message}`);
      failed++;
    }

    if (i < (updated.rowCount ?? 0) - 1) await sleep(DELAY);
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`✅ Enriquecidas: ${done}  |  ⚠️ Sin datos: ${failed}`);
  console.log(`────────────────────────────────────\n`);
  await pool.end();
}

run().catch(async e => { console.error(e); await pool.end(); process.exit(1); });
