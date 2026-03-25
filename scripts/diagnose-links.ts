import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1. Companies sin ningún job activo
const sinJobsActivos = await pool.query(`
  SELECT COUNT(*) n FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.is_active = true)
`);

// 2. Companies sin ningún job del todo
const sinJobsTodos = await pool.query(`
  SELECT COUNT(*) n FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id)
`);

// 3. Companies con jobs activos pero industry null
const conJobsPeroVacias = await pool.query(`
  SELECT c.name, c.enrichment_status, c.industry, c.hq_city, COUNT(j.id) vacantes_activas
  FROM companies c
  JOIN jobs j ON j.company_id = c.id AND j.is_active = true
  WHERE (c.industry IS NULL OR c.industry = '')
  GROUP BY c.id
  ORDER BY vacantes_activas DESC
  LIMIT 15
`);

// 4. Estado actual de enriquecimiento
const estadoEnriquecimiento = await pool.query(`
  SELECT enrichment_status, COUNT(*) n,
    SUM(CASE WHEN industry IS NULL THEN 1 ELSE 0 END) sin_industry
  FROM companies GROUP BY enrichment_status ORDER BY n DESC
`);

// 5. Jobs activos con company sin datos
const muestra = await pool.query(`
  SELECT c.name, c.enrichment_status, c.industry, j.title
  FROM companies c JOIN jobs j ON j.company_id = c.id
  WHERE j.is_active = true AND (c.industry IS NULL OR c.industry = '')
  LIMIT 5
`);

console.log('Companies sin jobs ACTIVOS:', sinJobsActivos.rows[0].n);
console.log('Companies sin jobs del todo:', sinJobsTodos.rows[0].n);
console.log('\nEstado de enriquecimiento:');
console.table(estadoEnriquecimiento.rows);
console.log('\nCompanies con jobs activos pero sin industry (top 15):');
console.table(conJobsPeroVacias.rows);
console.log('\nMuestra jobs cuya company no tiene datos:');
console.table(muestra.rows);

await pool.end();


