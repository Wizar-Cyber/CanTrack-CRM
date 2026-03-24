import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log('🔄 Migrando scraped_jobs → companies + jobs...\n');

// 1. Crear empresas únicas desde scraped_jobs
const companiesResult = await pool.query(`
  INSERT INTO companies (name, slug, enrichment_status)
  SELECT DISTINCT
    empresa AS name,
    lower(regexp_replace(translate(empresa,
      'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
      'aeiouAEIOUaeiouAEIOUaeiouAEIOUnncc'
    ), '[^a-z0-9]+', '-', 'g')) AS slug,
    'pending'::enrichment_status_enum AS enrichment_status
  FROM scraped_jobs
  WHERE empresa IS NOT NULL AND empresa <> ''
  ON CONFLICT (slug) DO NOTHING
`);
console.log(`✅ Empresas insertadas: ${companiesResult.rowCount}`);

// 2. Importar las vacantes del scraper como jobs del CRM
const jobsResult = await pool.query(`
  INSERT INTO jobs (company_id, title, source, url, created_at)
  SELECT
    c.id,
    sj.titulo,
    CASE
      WHEN lower(sj.fuente) = 'linkedin'  THEN 'linkedin'::job_source_enum
      WHEN lower(sj.fuente) = 'indeed'    THEN 'indeed'::job_source_enum
      WHEN lower(sj.fuente) = 'glassdoor' THEN 'glassdoor'::job_source_enum
      ELSE 'other'::job_source_enum
    END,
    sj.url_postulacion,
    COALESCE(sj.fecha_creacion, NOW())
  FROM scraped_jobs sj
  JOIN companies c ON c.slug = lower(regexp_replace(translate(sj.empresa,
    'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
    'aeiouAEIOUaeiouAEIOUaeiouAEIOUnncc'
  ), '[^a-z0-9]+', '-', 'g'))
  WHERE sj.titulo IS NOT NULL
    AND sj.url_postulacion IS NOT NULL
  ON CONFLICT DO NOTHING
`);
console.log(`✅ Vacantes insertadas: ${jobsResult.rowCount}`);

// 3. Verificación final
const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM companies)::int AS companies,
    (SELECT COUNT(*) FROM jobs)::int AS jobs,
    (SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending')::int AS pending_enrichment
`);
const r = counts.rows[0];
console.log(`\n📊 Estado final:`);
console.log(`   Companies: ${r.companies}`);
console.log(`   Jobs:      ${r.jobs}`);
console.log(`   Pending enrichment: ${r.pending_enrichment}`);

await pool.end();
console.log('\n🎉 Migración completada');
