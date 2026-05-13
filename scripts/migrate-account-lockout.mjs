/**
 * Migration: Add account lockout fields to users table.
 * Adds failed_login_attempts and locked_until columns.
 */

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check if columns already exist
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    `);

    if (check.rows.length === 0) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN failed_login_attempts INTEGER DEFAULT 0,
        ADD COLUMN locked_until TIMESTAMPTZ DEFAULT NULL
      `);
      console.log('✅ Added failed_login_attempts and locked_until columns to users table');
    } else {
      console.log('ℹ️  Columns already exist — skipping migration');
    }

    // Add index for email lookups (already exists but ensure)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_active ON users (email) WHERE is_active = true
    `).catch(() => {});
    console.log('✅ Ensure idx_users_email_active index exists');

  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
