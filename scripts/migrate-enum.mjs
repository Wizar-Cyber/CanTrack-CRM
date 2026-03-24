import pkg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'processing'`);
  console.log('✅ Valor "processing" agregado al enum');
} catch (e) {
  console.log('  processing ya existe o error:', e.message);
}

try {
  await pool.query(`ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'db_matched'`);
  console.log('✅ Valor "db_matched" agregado al enum');
} catch (e) {
  console.log('  db_matched ya existe o error:', e.message);
}

// Liberar locks huérfanos (si el servidor crasheó con empresas en "processing")
const { rowCount } = await pool.query(
  `UPDATE companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`
);
console.log(`✅ ${rowCount} empresas liberadas de estado "processing"`);

await pool.end();
console.log('🎉 Migración completada');
