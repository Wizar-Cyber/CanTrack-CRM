/**
 * Migración: añade campos de dirección y teléfono a la tabla companies.
 * Segura de ejecutar múltiples veces (IF NOT EXISTS / idempotente).
 */
import pkg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const { Pool } = pkg;
const pool = new Pool({ connectionString: envVars.DATABASE_URL });

const migrations = [
  { name: 'phone column',     sql: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT` },
  { name: 'hq_province col',  sql: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_province TEXT` },
  // exact_address ya existe, pero aseguramos por si acaso
  { name: 'exact_address col',sql: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS exact_address TEXT` },
];

console.log('🔧 Migrando tabla companies...\n');
for (const m of migrations) {
  try {
    await pool.query(m.sql);
    console.log(`  ✅ ${m.name}`);
  } catch (e) {
    console.log(`  ⚠️  ${m.name}: ${e.message}`);
  }
}

await pool.end();
console.log('\n🎉 Migración de campos de dirección completada.');
