/**
 * Script standalone: limpia de la DB las vacantes (y opcionalmente empresas)
 * que NO pertenezcan a la región configurada en REGION_FILTER (ej: QC).
 *
 * Uso:
 *   npx tsx scripts/cleanup-non-region-jobs.ts              → dry-run (solo reporta)
 *   npx tsx scripts/cleanup-non-region-jobs.ts --apply      → soft-delete (is_active=false)
 *   npx tsx scripts/cleanup-non-region-jobs.ts --hard       → DELETE (apply + hard)
 *   npx tsx scripts/cleanup-non-region-jobs.ts --companies  → también purga empresas out-of-region
 *
 * El criterio de "fuera de región" es:
 *   • Para jobs sin company_id → location/country/title/raw_company_name no contienen el token
 *   • Para jobs con company_id → la empresa vinculada no cumple companyRegionClause
 */

import 'dotenv/config';
import pg from 'pg';
import {
  REGION_FILTER,
  isRegionFilterActive,
  companyRegionClause,
  isRegionMatch,
} from '../server/utils/region-filter.js';

const { Pool } = pg;

const args = process.argv.slice(2);
const APPLY      = args.includes('--apply') || args.includes('--hard');
const HARD       = args.includes('--hard');
const COMPANIES  = args.includes('--companies');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurado en .env');
  process.exit(1);
}
if (!isRegionFilterActive()) {
  console.error('❌ REGION_FILTER no está activo en .env — nada que limpiar.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log(`\n🧹 Cleanup region filter: ${REGION_FILTER}`);
  console.log(`   Modo: ${HARD ? 'HARD DELETE' : APPLY ? 'SOFT (is_active=false)' : 'DRY-RUN (no modifica nada)'}`);
  console.log(`   Empresas: ${COMPANIES ? 'SÍ incluidas' : 'NO (solo jobs)'}\n`);

  // ── 1. Jobs con company vinculada fuera de región ──────────────────────────
  const linkedOutRes = await pool.query(`
    SELECT j.id, j.title, j.raw_company_name, c.name AS company_name,
           c.hq_province, c.hq_region, c.exact_address
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    WHERE NOT ${companyRegionClause('c')}
  `);
  console.log(`🔗 Jobs vinculados a empresa out-of-region: ${linkedOutRes.rowCount}`);

  // ── 2. Jobs sin company cuya location/title no matchea ─────────────────────
  const unlinkedRes = await pool.query(`
    SELECT id, title, raw_company_name, location, country
    FROM jobs
    WHERE company_id IS NULL
  `);
  const unlinkedOut = unlinkedRes.rows.filter(r =>
    !isRegionMatch(r.location, r.country, r.title, r.raw_company_name)
  );
  console.log(`🔓 Jobs sin empresa y fuera de región (por texto): ${unlinkedOut.length}`);

  const idsToKill = [
    ...linkedOutRes.rows.map(r => r.id),
    ...unlinkedOut.map(r => r.id),
  ];
  console.log(`➜ Total jobs candidatos: ${idsToKill.length}\n`);

  if (idsToKill.length > 0 && !APPLY) {
    const preview = idsToKill.slice(0, 10);
    console.log(`🔍 Preview (primeros 10): ${preview.join(', ')}`);
  }

  if (idsToKill.length > 0 && APPLY) {
    const BATCH = 500;
    for (let i = 0; i < idsToKill.length; i += BATCH) {
      const chunk = idsToKill.slice(i, i + BATCH);
      if (HARD) {
        await pool.query(`DELETE FROM jobs WHERE id = ANY($1::uuid[])`, [chunk]);
      } else {
        await pool.query(
          `UPDATE jobs SET is_active=false, updated_at=NOW() WHERE id = ANY($1::uuid[])`,
          [chunk]
        );
      }
      process.stdout.write(`   ${Math.min(i + BATCH, idsToKill.length)}/${idsToKill.length} procesados\r`);
    }
    console.log(`\n✅ ${HARD ? 'Eliminados' : 'Desactivados'} ${idsToKill.length} jobs fuera de ${REGION_FILTER}.`);
  }

  // ── 3. Empresas fuera de región (opcional) ────────────────────────────────
  if (COMPANIES) {
    const outCompRes = await pool.query(`
      SELECT c.id, c.name, c.hq_province, c.hq_region, c.exact_address,
             (SELECT COUNT(*)::int FROM jobs j WHERE j.company_id = c.id) AS job_count
      FROM companies c
      WHERE NOT ${companyRegionClause('c')}
        AND c.enrichment_status IN ('enriched','db_matched','scraped','failed')
    `);
    console.log(`\n🏢 Empresas enriquecidas out-of-region: ${outCompRes.rowCount}`);

    if (outCompRes.rowCount && APPLY) {
      const compIds = outCompRes.rows.map(r => r.id);
      if (HARD) {
        // Primero borrar jobs vinculados (si quedaban vivos)
        await pool.query(`DELETE FROM jobs WHERE company_id = ANY($1::uuid[])`, [compIds]);
        await pool.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [compIds]);
        console.log(`✅ Eliminadas ${compIds.length} empresas (+ sus jobs).`);
      } else {
        await pool.query(
          `UPDATE companies SET enrichment_status='skipped', updated_at=NOW()
           WHERE id = ANY($1::uuid[])`,
          [compIds]
        );
        console.log(`✅ ${compIds.length} empresas marcadas como 'skipped'.`);
      }
    }
  }

  // ── 4. Resumen final ───────────────────────────────────────────────────────
  const summary = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM jobs WHERE is_active) AS jobs_activos,
      (SELECT COUNT(*)::int FROM jobs WHERE NOT is_active) AS jobs_inactivos,
      (SELECT COUNT(*)::int FROM companies) AS companies_total
  `);
  console.log(`\n📊 Estado actual: ${JSON.stringify(summary.rows[0])}`);

  if (!APPLY) {
    console.log(`\n💡 Para aplicar: agrega --apply (soft) o --hard (delete). Para incluir empresas: --companies.`);
  }

  await pool.end();
}

run().catch(async err => {
  console.error('❌ Error:', err);
  await pool.end();
  process.exit(1);
});
