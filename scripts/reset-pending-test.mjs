import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: 'postgresql://casaos:casaos@127.0.0.1:5434/casaos' });
const r = await pool.query(
  `UPDATE companies SET enrichment_status='pending'
   WHERE id IN (SELECT id FROM companies ORDER BY id LIMIT 5)
   RETURNING id, name`
);
console.log('Empresas reseteadas a pending:');
console.table(r.rows);
await pool.end();
