/**
 * Script standalone: enriquece las empresas en estado 'pending' o 'failed' en la DB.
 * Uso:  npx tsx scripts/enrich-companies.ts [--limit 20] [--delay 1500] [--retry-failed] [--reset-all 20]
 *
 * --limit  N          → procesar solo N empresas (default: todas las pending)
 * --delay  ms         → pausa entre cada empresa en ms (default: 1200)
 * --retry-failed      → re-intentar empresas con status 'failed'
 * --reset-all N       → resetear las primeras N a 'pending' y procesarlas (0 = todas)
 * --fill-empty        → re-encolar TODAS las companies con industry=NULL (scraped incompleto)
 */

import 'dotenv/config';
import pg from 'pg';
import { EnrichmentService } from '../server/services/enrichment.service.js';

const { Pool } = pg;

// ── Argumentos CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, def: number) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : def;
};
const hasFlag  = (f: string) => args.includes(f);
const LIMIT        = getArg('--limit', 0);
const DELAY        = getArg('--delay', 1200);
const RETRY_FAILED = hasFlag('--retry-failed');
const RESET_ALL    = getArg('--reset-all', -1); // -1 = no activado
const FILL_EMPTY   = hasFlag('--fill-empty');   // re-encolar scraped con industry=NULL

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurado en .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ALLOWED_COLUMNS = new Set([
  'industry', 'company_size', 'hq_city', 'hq_province', 'hq_country',
  'exact_address', 'phone', 'contact_email', 'website', 'description',
  'known_ats_portal', 'enrichment_status',
]);

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  // ── Reset opcional ──────────────────────────────────────────────────────
  if (RESET_ALL >= 0) {
    console.log(`\n🔄 Reseteando${RESET_ALL > 0 ? ` las primeras ${RESET_ALL}` : ' TODAS las'} empresas a 'pending'…`);
    await pool.query(`UPDATE companies SET enrichment_status = 'skipped',
      industry=NULL, company_size=NULL, hq_city=NULL, hq_province=NULL,
      hq_country=NULL, exact_address=NULL, phone=NULL, contact_email=NULL,
      website=NULL, description=NULL, enriched_at=NULL, updated_at=NOW()`);
    if (RESET_ALL > 0) {
      await pool.query(
        `UPDATE companies SET enrichment_status = 'pending'
         WHERE id IN (SELECT id FROM companies ORDER BY created_at ASC LIMIT $1)`,
        [RESET_ALL]
      );
    } else {
      await pool.query(`UPDATE companies SET enrichment_status = 'pending'`);
    }
    console.log('✅ Reset completado.\n');
  }

  // ── Re-encolar scraped con campos vacíos ─────────────────────────────────
  if (FILL_EMPTY) {
    const requeue = await pool.query(
      `UPDATE companies SET enrichment_status = 'pending'
       WHERE (industry IS NULL OR industry = '')
       AND enrichment_status IN ('scraped', 'db_matched')
       RETURNING id`
    );
    console.log(`\n🔁 ${requeue.rowCount} companies con industry vacía re-encoladas como 'pending'.\n`);
  }

  // ── Re-intentar fallidas ─────────────────────────────────────────────────
  if (RETRY_FAILED) {
    const requeue = LIMIT > 0
      ? await pool.query(`UPDATE companies SET enrichment_status = 'pending' WHERE id IN (SELECT id FROM companies WHERE enrichment_status = 'failed' ORDER BY created_at ASC LIMIT $1) RETURNING id`, [LIMIT])
      : await pool.query(`UPDATE companies SET enrichment_status = 'pending' WHERE enrichment_status = 'failed' RETURNING id`);
    console.log(`\n🔁 Re-encoladas ${requeue.rowCount} empresas 'failed' como 'pending'.\n`);
  }

  // Contar pendientes
  const pendingQ  = await pool.query(`SELECT COUNT(*)::int AS n FROM companies WHERE enrichment_status = 'pending'`);
  const total     = pendingQ.rows[0].n as number;
  const toProcess = LIMIT > 0 && !RETRY_FAILED && RESET_ALL < 0 ? Math.min(LIMIT, total) : total;

  console.log(`🏢  Empresas pending: ${total}  |  a procesar: ${toProcess}  |  delay: ${DELAY}ms\n`);

  if (toProcess === 0) {
    console.log('✅ Nada que procesar.');
    await pool.end();
    return;
  }

  let done = 0;
  let failed = 0;

  while (done + failed < toProcess) {
    // Tomar y bloquear la siguiente empresa pending
    const lockRes = await pool.query(`
      UPDATE companies SET enrichment_status = 'processing'
      WHERE id = (
        SELECT id FROM companies WHERE enrichment_status = 'pending'
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      ) RETURNING id, name
    `);

    if (lockRes.rows.length === 0) break; // ya no hay más

    const { id, name } = lockRes.rows[0];
    const idx = done + failed + 1;
    process.stdout.write(`[${idx}/${toProcess}] ${name} … `);

    try {
      // Si ya tiene industry (campo clave), marcar como db_matched sin re-enriquecer
      const existing = await pool.query(
        'SELECT industry, website, description FROM companies WHERE id = $1', [id]
      );
      const row = existing.rows[0];
      if (row && row.industry) {
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = NOW() WHERE id = $1`, [id]
        );
        console.log('⚡ db_matched (ya tenía datos)');
        done++;
        continue;
      }

      // Llamar al chain de IA: Gemini → Groq → Ollama → WebSearch
      const data = await EnrichmentService.enrichCompany(name);
      const hasData = !!(data.industry || (data.description && data.website));
      const newStatus = hasData ? 'scraped' : 'failed';

      const payload: Record<string, any> = { enrichment_status: newStatus };
      if (data.industry)       payload.industry       = data.industry;
      if (data.company_size)   payload.company_size   = data.company_size;
      if (data.hq_city)        payload.hq_city        = data.hq_city;
      if (data.hq_province)    payload.hq_province    = data.hq_province;
      if (data.hq_country)     payload.hq_country     = data.hq_country;
      if (data.exact_address)  payload.exact_address  = data.exact_address;
      if (data.phone)          payload.phone          = data.phone;
      if (data.contact_email)  payload.contact_email  = data.contact_email;
      if (data.website)        payload.website        = data.website;
      if (data.description)    payload.description    = data.description;

      const keys   = Object.keys(payload).filter(k => ALLOWED_COLUMNS.has(k));
      const setSQL = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const vals   = keys.map(k => payload[k]);

      await pool.query(
        `UPDATE companies SET ${setSQL}, updated_at = NOW(), enriched_at = NOW() WHERE id = $1`,
        [id, ...vals]
      );

      if (hasData) {
        console.log(`✅ scraped  [${data._provider}]  ${data.hq_city ?? ''}${data.hq_province ? ', ' + data.hq_province : ''}`);
        done++;
      } else {
        console.log(`⚠️  failed  (sin datos de IA)`);
        failed++;
      }
    } catch (err: any) {
      // Liberar el bloqueo
      await pool.query(
        `UPDATE companies SET enrichment_status = 'pending' WHERE id = $1`, [id]
      ).catch(() => {});
      console.log(`❌ error: ${err.message}`);
      failed++;
    }

    if (done + failed < toProcess) await sleep(DELAY);
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`✅ Completadas: ${done}  |  ❌ Fallidas: ${failed}`);
  console.log(`────────────────────────────────────────\n`);

  await pool.end();
}

run().catch(err => {
  console.error('Error fatal:', err);
  pool.end();
  process.exit(1);
});
