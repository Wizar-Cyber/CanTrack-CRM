/**
 * One-shot: runs the full workflow cycle once (requeue + sync + enrich + province copy + sheets export).
 * Usage: node --experimental-vm-modules scripts/_run-workflow-once.mjs
 *        OR: npx tsx scripts/_run-workflow-once.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { runWorkflowCycle } from '../server/services/workflow.service.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurado en .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log('\n🚀 Iniciando ciclo de workflow manual…\n');

try {
  const result = await runWorkflowCycle(pool);
  console.log('\n══ RESULTADO ══════════════════════════════');
  for (const step of result.steps) {
    console.log(`  [${step.ok ? '✅' : '❌'}] ${step.step}: ${step.message}`);
  }
  console.log(`\n  ⏱  Duración: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`  🏢  Nuevas: ${result.totalNewCompanies} | Enriquecidas: ${result.totalEnriched} | Exportadas: ${result.totalExported}`);
  console.log('══════════════════════════════════════════\n');
} catch (err) {
  console.error('❌ Error en workflow:', err.message);
} finally {
  await pool.end();
}
