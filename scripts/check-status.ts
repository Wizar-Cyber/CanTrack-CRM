import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`SELECT enrichment_status, COUNT(*)::int AS n FROM companies GROUP BY enrichment_status ORDER BY n DESC`);
console.log('\nEstados de enriquecimiento:');
console.table(r.rows);
const total = await pool.query(`SELECT COUNT(*)::int AS n FROM companies`);
console.log(`Total empresas: ${total.rows[0].n}\n`);
await pool.end();
