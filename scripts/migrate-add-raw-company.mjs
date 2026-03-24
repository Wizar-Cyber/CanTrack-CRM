/**
 * Migración: agrega raw_company_name a jobs
 * y lo rellena retroactivamente desde companies.name para los jobs ya vinculados.
 */
import dotenv from 'dotenv';
dotenv.config();
import pkg from 'pg';
const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL });

console.log('🔄 Migrando tabla jobs: añadiendo raw_company_name...\n');

// 1. Agregar columna (idempotente)
await pool.query(`
  ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS raw_company_name VARCHAR(255)
`);
console.log('✅ Columna raw_company_name agregada (o ya existía).');

// 2. Backfill desde company ya vinculada
const fill = await pool.query(`
  UPDATE jobs j
  SET raw_company_name = c.name
  FROM companies c
  WHERE j.company_id = c.id
    AND j.raw_company_name IS NULL
`);
console.log(`✅ Backfill: ${fill.rowCount} vacantes actualizadas con raw_company_name.`);

// 3. Verificación
const stats = await pool.query(`
  SELECT
    COUNT(*)::int                                           AS total_jobs,
    COUNT(*) FILTER (WHERE raw_company_name IS NOT NULL)::int AS con_nombre,
    COUNT(*) FILTER (WHERE company_id IS NULL)::int        AS sin_company_id
  FROM jobs
`);
const r = stats.rows[0];
console.log(`\n📊 Estado:`);
console.log(`   Total vacantes   : ${r.total_jobs}`);
console.log(`   Con raw_company_name: ${r.con_nombre}`);
console.log(`   Sin company_id   : ${r.sin_company_id}  ← estas esperan ser vinculadas`);

await pool.end();
console.log('\n🎉 Migración completada.');
