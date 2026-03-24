/**
 * Migración: crea índices en la tabla jobs para optimizar las queries de sync y búsqueda.
 *
 * Uso:
 *   1. Túnel SSH activo: ssh -L 5434:127.0.0.1:5433 root@187.124.237.242 -N
 *   2. node scripts/migrate-indexes.mjs
 *
 * Nota: CREATE INDEX no puede ejecutarse dentro de una transacción.
 *       Los índices se crean uno a uno con IF NOT EXISTS para ser idempotentes.
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://casaos:casaos@127.0.0.1:5434/casaos',
});

const INDEXES = [
  {
    name: 'idx_jobs_url',
    sql: 'CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url)',
    desc: 'Evita duplicados en sync — lookup por URL'
  },
  {
    name: 'idx_jobs_sync_pending',
    sql: `CREATE INDEX IF NOT EXISTS idx_jobs_sync_pending
          ON jobs(raw_company_name)
          WHERE company_id IS NULL`,
    desc: 'Índice parcial — acelera "WHERE company_id IS NULL" en el sync'
  },
  {
    name: 'idx_jobs_active_created',
    sql: `CREATE INDEX IF NOT EXISTS idx_jobs_active_created
          ON jobs(is_active, created_at DESC)`,
    desc: 'Acelera GET /api/jobs (WHERE is_active = true ORDER BY created_at DESC)'
  },
  {
    name: 'idx_jobs_company_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id)',
    desc: 'FK lookup jobs → companies'
  },
  {
    name: 'idx_companies_slug',
    sql: 'CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)',
    desc: 'Upsert en sync busca por slug'
  },
];

async function run() {
  await client.connect();
  console.log('✅ Conectado a PostgreSQL\n');

  let ok = 0;
  for (const idx of INDEXES) {
    try {
      const t0 = Date.now();
      await client.query(idx.sql);
      console.log(`✅ ${idx.name}  (${Date.now() - t0}ms)  — ${idx.desc}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${idx.name}: ${err.message}`);
    }
  }

  console.log(`\n🎉 ${ok}/${INDEXES.length} índices creados/verificados.`);
  await client.end();
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
