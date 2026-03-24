/**
 * Script de diagnóstico y reparación:
 * Resetea a 'pending' todas las empresas que tienen enrichment_status = 'scraped'
 * pero sin datos útiles (industry, description, website todos nulos).
 *
 * Uso:
 *   node scripts/fix-empty-enrichment.mjs           → solo muestra el diagnóstico
 *   node scripts/fix-empty-enrichment.mjs --fix      → aplica el reset
 */

import pkg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Leer DATABASE_URL del .env
const envPath = resolve(__dirname, '../.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const { Pool } = pkg;
const pool = new Pool({ connectionString: envVars.DATABASE_URL });

const doFix = process.argv.includes('--fix');

// ── Diagnóstico ───────────────────────────────────────────────────────────────
const stats = await pool.query(`
  SELECT enrichment_status, COUNT(*) AS total
  FROM companies
  GROUP BY enrichment_status
  ORDER BY total DESC
`);
console.log('\n📊 Estado actual de enriquecimiento:');
console.table(stats.rows);

const emptyScraped = await pool.query(`
  SELECT COUNT(*) AS total
  FROM companies
  WHERE (enrichment_status = 'scraped' OR enrichment_status = 'failed')
    AND industry  IS NULL
    AND description IS NULL
    AND website   IS NULL
`);
const emptyCount = parseInt(emptyScraped.rows[0].total);
console.log(`\n⚠️  Empresas marcadas como 'scraped' pero SIN datos: ${emptyCount}`);

const sample = await pool.query(`
  SELECT name, enrichment_status, industry, description, confidence_score
  FROM companies
  WHERE (enrichment_status = 'scraped' OR enrichment_status = 'failed')
    AND industry  IS NULL
    AND description IS NULL
    AND website   IS NULL
  LIMIT 5
`);
if (sample.rows.length > 0) {
  console.log('\n🔍 Muestra (5 empresas vacías):');
  console.table(sample.rows);
}

// ── Reparación ────────────────────────────────────────────────────────────────
if (!doFix) {
  console.log(`\n💡 Para resetear estas ${emptyCount} empresas a 'pending' (y re-enriquecer con Groq):`);
  console.log('   node scripts/fix-empty-enrichment.mjs --fix\n');
} else {
  if (emptyCount === 0) {
    console.log('\n✅ No hay empresas vacías. Nada que resetear.\n');
  } else {
    const result = await pool.query(`
      UPDATE companies
      SET enrichment_status = 'pending',
          updated_at = CURRENT_TIMESTAMP
      WHERE (enrichment_status = 'scraped' OR enrichment_status = 'failed')
        AND industry  IS NULL
        AND description IS NULL
        AND website   IS NULL
    `);
    console.log(`\n✅ ${result.rowCount} empresas reseteadas a 'pending'. El enriquecimiento automático con Groq comenzará en cuanto abras la app.\n`);
  }
}

await pool.end();
