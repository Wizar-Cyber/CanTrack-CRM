import dotenv from 'dotenv';
dotenv.config();
import pkg from 'pg';
const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL });

const cols = await pool.query(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name IN ('jobs', 'scraped_jobs')
  ORDER BY table_name, ordinal_position
`);
console.log('=== COLUMNAS ===');
cols.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name}  (${r.data_type})  nullable=${r.is_nullable}`));

const sample = await pool.query('SELECT * FROM jobs LIMIT 3');
console.log('\n=== MUESTRA jobs (3 filas) ===');
console.log(JSON.stringify(sample.rows, null, 2));
await pool.end();
