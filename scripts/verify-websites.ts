/**
 * Script: verifica las URLs guardadas en la DB y elimina las que no responden.
 * Uso:
 *   npx tsx scripts/verify-websites.ts [--limit 50] [--dry-run]
 *
 * --limit N    → procesar solo N empresas (default: todas con website)
 * --dry-run    → muestra qué haría SIN modificar la DB
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const args     = process.argv.slice(2);
const hasFlag  = (f: string) => args.includes(f);
const getArg   = (flag: string, def: number) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : def;
};
const LIMIT   = getArg('--limit', 0);
const DRY_RUN = hasFlag('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurado en .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyUrl(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Protocolo inválido' };
    }

    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CanTrackBot/1.0)' },
    });

    // 405 = HEAD no permitido pero el servidor existe
    const ok = res.ok || res.status === 405 || (res.status >= 300 && res.status < 400);
    return { ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function run() {
  const query = LIMIT > 0
    ? `SELECT id, name, website FROM companies WHERE website IS NOT NULL AND website <> '' ORDER BY updated_at DESC LIMIT $1`
    : `SELECT id, name, website FROM companies WHERE website IS NOT NULL AND website <> '' ORDER BY updated_at DESC`;

  const { rows } = await pool.query(query, LIMIT > 0 ? [LIMIT] : []);

  console.log(`\n🔎 Verificando ${rows.length} websites${DRY_RUN ? ' (DRY RUN — sin cambios)' : ''}…\n`);

  let valid = 0, invalid = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, website } = rows[i];
    process.stdout.write(`[${i + 1}/${rows.length}] ${name.substring(0, 40).padEnd(40)} ${website} … `);

    const result = await verifyUrl(website);

    if (result.ok) {
      console.log(`✅ ${result.status ?? 'ok'}`);
      valid++;
    } else {
      const reason = result.status ? `HTTP ${result.status}` : result.error ?? 'sin respuesta';
      console.log(`❌ ${reason}`);
      invalid++;

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE companies SET website = NULL, updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }

    // Pequeña pausa para no saturar servidores
    if (i < rows.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Válidos: ${valid}  |  ❌ Inválidos/eliminados: ${invalid}  |  Total: ${rows.length}`);
  if (DRY_RUN) console.log('ℹ️  Modo dry-run: no se hicieron cambios en la DB.');

  await pool.end();
}

run().catch(err => {
  console.error('Error fatal:', err.message);
  pool.end();
  process.exit(1);
});
