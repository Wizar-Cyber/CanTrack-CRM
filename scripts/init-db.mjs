/**
 * init-db.mjs
 * Initialises the CRM database from scratch:
 *   1. Creates extensions, enums, tables, indexes
 *   2. Seeds sample companies + jobs
 *   3. Creates the admin user (admin@cantrack.com / Admin123!)
 *
 * Usage:  node scripts/init-db.mjs
 */

import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});

async function run(client, sql, label = '') {
  try {
    await client.query(sql);
    if (label) console.log(`  ✅ ${label}`);
  } catch (e) {
    // "already exists" or "does not exist" are safe to ignore during init
    const safe = e.code === '42701' || e.code === '42P07' || e.code === '42P01' ||
                 e.message.includes('already exists') || e.message.includes('does not exist');
    if (safe) {
      if (label) console.log(`  ⏩ ${label} (already applied)`);
    } else {
      console.error(`  ❌ ${label || 'query'}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('\n🔧 CanTrack DB Init\n');
  const client = await pool.connect();

  // ── Extensions ────────────────────────────────────────────────────────────
  await run(client, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`, 'uuid-ossp extension');

  // ── Enums ─────────────────────────────────────────────────────────────────
  await run(client, `
    DO $$ BEGIN
      CREATE TYPE enrichment_status_enum AS ENUM
        ('pending','processing','db_matched','scraped','verified','failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `, 'enrichment_status_enum');

  await run(client, `
    DO $$ BEGIN ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'processing'; EXCEPTION WHEN others THEN null; END $$
  `);
  await run(client, `
    DO $$ BEGIN ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'db_matched'; EXCEPTION WHEN others THEN null; END $$
  `);

  await run(client, `
    DO $$ BEGIN
      CREATE TYPE application_status_enum AS ENUM ('Saved','Applied','Interview','Offer','Rejected','Placed');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `, 'application_status_enum');

  await run(client, `
    DO $$ BEGIN
      CREATE TYPE candidate_status_enum AS ENUM ('Available','Interviewing','Placed','Inactive');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `, 'candidate_status_enum');

  await run(client, `
    DO $$ BEGIN
      CREATE TYPE job_source_enum AS ENUM ('linkedin','indeed','glassdoor','company_website','other');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `, 'job_source_enum');

  // ── Tables ────────────────────────────────────────────────────────────────
  await run(client, `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      role VARCHAR(50) DEFAULT 'recruiter',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'users table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      legal_name VARCHAR(255),
      industry VARCHAR(100),
      company_size VARCHAR(50),
      hq_city VARCHAR(100),
      hq_province VARCHAR(100),
      hq_country VARCHAR(100),
      hq_region VARCHAR(100),
      hq_town VARCHAR(100),
      exact_address TEXT,
      phone VARCHAR(60),
      contact_email VARCHAR(255),
      website VARCHAR(255),
      description TEXT,
      known_ats_portal VARCHAR(100),
      enrichment_status enrichment_status_enum DEFAULT 'pending',
      enriched_at TIMESTAMPTZ,
      google_maps_status VARCHAR(20) DEFAULT 'unknown',
      excel_exported_at TIMESTAMPTZ,
      sheets_exported_at TIMESTAMPTZ,
      suggested_services JSONB,
      suggested_services_summary TEXT,
      suggested_services_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'companies table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,
      raw_company_name VARCHAR(255),
      title VARCHAR(255) NOT NULL,
      source job_source_enum NOT NULL,
      url TEXT NOT NULL,
      location VARCHAR(255),
      country VARCHAR(50),
      category VARCHAR(100),
      application_type VARCHAR(50),
      is_easy_apply BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      service_type_id VARCHAR(30),
      service_match_confidence DECIMAL(3,2),
      service_match_reasoning TEXT,
      service_match_provider VARCHAR(30),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'jobs table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS scraped_jobs (
      id SERIAL PRIMARY KEY,
      fuente VARCHAR(50),
      titulo TEXT,
      empresa TEXT,
      url_postulacion TEXT,
      keyword VARCHAR(100),
      fecha_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
  `, 'scraped_jobs table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      role VARCHAR(150),
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(50),
      location VARCHAR(255),
      linkedin_url VARCHAR(255),
      resume_url TEXT,
      years_of_experience INTEGER,
      status candidate_status_enum DEFAULT 'Available',
      bio TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'candidates table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS applications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID REFERENCES jobs(id) ON DELETE RESTRICT,
      candidate_id UUID REFERENCES candidates(id) ON DELETE RESTRICT,
      status application_status_enum DEFAULT 'Applied',
      applied_date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, candidate_id)
    )
  `, 'applications table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS application_queue (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 5,
      queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      error_message TEXT,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL
    )
  `, 'application_queue table');

  await run(client, `
    CREATE TABLE IF NOT EXISTS service_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      service_type_id VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      variables JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'service_templates table');

  // ── Indexes ───────────────────────────────────────────────────────────────
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_enrichment_status ON companies(enrichment_status)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_app_queue_status ON application_queue(status)`,
    `CREATE INDEX IF NOT EXISTS idx_app_queue_job_id ON application_queue(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scraped_jobs_fuente ON scraped_jobs(fuente)`,
    `CREATE INDEX IF NOT EXISTS idx_scraped_jobs_fecha ON scraped_jobs(fecha_creacion DESC)`,
  ];
  for (const idx of indexes) await run(client, idx);
  console.log('  ✅ indexes');

  // ── Admin user ────────────────────────────────────────────────────────────
  const existing = await client.query(`SELECT id FROM users WHERE email = 'admin@cantrack.com'`);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('Admin123!', 12);
    await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role)
      VALUES ('admin@cantrack.com', $1, 'Admin', 'CanTrack', 'admin')
    `, [hash]);
    console.log('  ✅ admin user created  →  admin@cantrack.com / Admin123!');
  } else {
    console.log('  ⏩ admin user already exists');
  }

  // ── Sample companies (Quebec staffing targets) ────────────────────────────
  const sampleCompanies = [
    { name: 'Sysco Canada', city: 'Montréal', province: 'Quebec', industry: 'Food Distribution' },
    { name: 'Saputo Inc.', city: 'Montréal', province: 'Quebec', industry: 'Dairy Manufacturing' },
    { name: 'Kruger Products', city: 'Sherbrooke', province: 'Quebec', industry: 'Consumer Products' },
    { name: 'Metro Inc.', city: 'Montréal', province: 'Quebec', industry: 'Retail Grocery' },
    { name: 'CN Rail', city: 'Montréal', province: 'Quebec', industry: 'Transportation & Logistics' },
    { name: 'SNC-Lavalin', city: 'Montréal', province: 'Quebec', industry: 'Engineering & Construction' },
    { name: 'Hydro-Québec', city: 'Montréal', province: 'Quebec', industry: 'Energy & Utilities' },
    { name: 'Bombardier', city: 'Montréal', province: 'Quebec', industry: 'Aerospace & Manufacturing' },
    { name: 'Bell Canada', city: 'Montréal', province: 'Quebec', industry: 'Telecommunications' },
    { name: 'Intact Financial', city: 'Montréal', province: 'Quebec', industry: 'Insurance' },
  ];

  let companiesAdded = 0;
  for (const co of sampleCompanies) {
    const slug = co.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      await client.query(`
        INSERT INTO companies (name, slug, hq_city, hq_province, hq_country, industry, enrichment_status)
        VALUES ($1, $2, $3, $4, 'Canada', $5, 'pending')
        ON CONFLICT (slug) DO NOTHING
      `, [co.name, slug, co.city, co.province, co.industry]);
      companiesAdded++;
    } catch (e) {
      // ignore
    }
  }
  console.log(`  ✅ ${companiesAdded} sample companies seeded`);

  client.release();
  await pool.end();

  console.log('\n🎉 Database ready!\n');
  console.log('   Login:  admin@cantrack.com');
  console.log('   Pass:   Admin123!\n');
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  process.exit(1);
});
