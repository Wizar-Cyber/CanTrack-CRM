/**
 * Migración: crea la tabla email_logs para registrar correos enviados via mDirector.
 * 
 * Uso:
 *   1. Asegúrate de que el túnel SSH esté activo:
 *      ssh -L 5434:127.0.0.1:5433 root@187.124.237.242 -N
 *   2. Ejecuta:
 *      node scripts/migrate-email-logs.mjs
 */

import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://casaos:casaos@127.0.0.1:5434/casaos',
});

async function run() {
  await client.connect();
  console.log('✅ Conectado a PostgreSQL');

  try {
    await client.query('BEGIN');

    // Tabla de registro de correos enviados
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
        sent_by         UUID REFERENCES users(id) ON DELETE SET NULL,
        to_email        VARCHAR(255) NOT NULL,
        to_name         VARCHAR(255),
        subject         TEXT NOT NULL,
        employee_type_id   VARCHAR(50),
        employee_type_name VARCHAR(255),
        mdirector_message_id VARCHAR(255),
        status          VARCHAR(50) DEFAULT 'sent',
        sent_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabla email_logs creada (o ya existe)');

    // Índices para consultas frecuentes
    await client.query(`
      CREATE INDEX IF NOT EXISTS email_logs_company_idx
        ON email_logs(company_id, sent_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS email_logs_sent_by_idx
        ON email_logs(sent_by);
    `);
    console.log('✅ Índices creados');

    // Columna contact_email en companies (si no existe)
    await client.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
    `);
    console.log('✅ Columna contact_email añadida a companies (o ya existe)');

    await client.query('COMMIT');
    console.log('\n🎉 Migración completada correctamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración, rollback ejecutado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
