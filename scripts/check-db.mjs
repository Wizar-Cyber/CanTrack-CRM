import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const tables = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`);

for (const { table_name } of tables.rows) {
  try {
    const c = await pool.query(`SELECT COUNT(*) FROM "${table_name}"`);
    console.log(`${table_name}: ${c.rows[0].count}`);
  } catch { console.log(`${table_name}: error`); }
}

// Muestra los primeros registros de scraped_jobs si existe
try {
  const sj = await pool.query('SELECT * FROM scraped_jobs LIMIT 5');
  if (sj.rows.length > 0) {
    console.log('\n--- scraped_jobs muestra ---');
    console.log(JSON.stringify(sj.rows, null, 2));
  }
} catch {}

await pool.end();
