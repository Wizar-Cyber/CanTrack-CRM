/**
 * Migration: add contact_email column to companies table
 * Run: node scripts/migrate-contact-email.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add contact_email column if it doesn't exist
    await client.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS contact_email TEXT;
    `);
    console.log('✅ contact_email column added (or already exists)');

    // Index for quick lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_contact_email
      ON companies (contact_email)
      WHERE contact_email IS NOT NULL;
    `);
    console.log('✅ Index on contact_email created');

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
