/**
 * Pausa el enriquecimiento marcando todas las empresas pending/processing como 'scraped'.
 * Para reanudar: node scripts/fix-empty-enrichment.mjs --fix
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

const r = await pool.query(`
  UPDATE companies
  SET enrichment_status = 'scraped', updated_at = CURRENT_TIMESTAMP
  WHERE enrichment_status IN ('pending', 'processing')
  RETURNING id
`);
console.log(`⏸️  Enriquecimiento pausado. ${r.rowCount} empresas detenidas.`);
console.log(`\nPara reanudar más tarde:`);
console.log(`  node scripts/fix-empty-enrichment.mjs --fix\n`);
await pool.end();
