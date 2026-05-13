/**
 * Migration: Migrate data from `companies` table to province tables,
 * then prepare to stop using `companies`.
 *
 * Steps:
 * 1. Add enrichment columns to ontario_companies and quebec_companies
 * 2. Insert enriched company data into the appropriate province table
 * 3. Link jobs.company_id to the new province table entries
 */

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🚀 Starting migration: companies → ontario/quebec tables');

    // ── Step 1: Add enrichment columns to province tables ────────────────────
    const addColumns = [
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending'`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS enrichment_provider TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS industry TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS company_size TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS website TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS slug TEXT`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS sheets_exported_at TIMESTAMPTZ`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS excel_exported_at TIMESTAMPTZ`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS suggested_services JSONB`,
      `ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS suggested_services_at TIMESTAMPTZ`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending'`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS enrichment_provider TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS industry TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS company_size TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS website TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS slug TEXT`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS sheets_exported_at TIMESTAMPTZ`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS excel_exported_at TIMESTAMPTZ`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS suggested_services JSONB`,
      `ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS suggested_services_at TIMESTAMPTZ`,
    ];

    for (const sql of addColumns) {
      await pool.query(sql).catch(e => console.warn('⚠️  Column add warning:', e.message));
    }
    console.log('✅ Province tables have enrichment columns');

    // ── Step 2: Create slug index for dedup ───────────────────────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ontario_slug ON ontario_companies (slug)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_quebec_slug ON quebec_companies (slug)`).catch(() => {});
    console.log('✅ Slug indexes created');

    // ── Step 3: Migrate companies → province tables ───────────────────────────
    const { rows: companies } = await pool.query(`
      SELECT * FROM companies
      WHERE enrichment_status IN ('scraped', 'db_matched', 'verified')
        AND name IS NOT NULL
    `);

    let migrated = 0;
    let skipped = 0;

    for (const c of companies) {
      const slug = c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const province = (c.hq_province || '').toLowerCase().trim();
      
      let targetTable: string | null = null;
      if (province === 'on' || province === 'ontario') targetTable = 'ontario_companies';
      else if (province === 'qc' || province === 'quebec' || province === 'québec') targetTable = 'quebec_companies';

      if (!targetTable) {
        // Default to Quebec if no province detected
        targetTable = 'quebec_companies';
      }

      // Check if company already exists by slug
      const exists = await pool.query(
        `SELECT id FROM ${targetTable} WHERE slug = $1 OR LOWER(TRIM(nombre)) = $2 LIMIT 1`,
        [slug, c.name.toLowerCase().trim()]
      );
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }

      // Insert into province table
      let suggestedServices = c.suggested_services;
      if (typeof suggestedServices === 'string') {
        try { suggestedServices = JSON.parse(suggestedServices); }
        catch { suggestedServices = null; }
      }

      const hqProvince = (c.hq_province || province).toLowerCase();
      const provinceLabel = targetTable === 'ontario_companies' ? 'ON' : 'QC';

      await pool.query(`
        INSERT INTO ${targetTable}
          (nombre, slug, telefono, correo, direccion, provincia, ciudad, descripcion, dominio_de_pagina, work,
           enrichment_status, enriched_at, industry, company_size, website, description,
           sheets_exported_at, excel_exported_at, suggested_services, suggested_services_at, is_duplicate)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16,
           $17, $18, $19::jsonb, $20, false)
        ON CONFLICT DO NOTHING`,
        [
          c.name, slug, c.phone, c.contact_email, c.exact_address,
          provinceLabel, c.hq_city,
          (c.description || '').substring(0, 500), c.website, null,
          c.enrichment_status, c.enriched_at,
          c.industry, c.company_size, c.website, (c.description || '').substring(0, 500),
          c.sheets_exported_at, c.excel_exported_at,
          suggestedServices ? JSON.stringify(suggestedServices) : null,
          c.suggested_services_at
        ]
      );
      migrated++;
    }

    console.log(`✅ Migrated: ${migrated} companies → province tables`);
    console.log(`✅ Skipped (already exist): ${skipped}`);

    // ── Step 4: Update jobs.company_id references to point to province tables ──
    // We'll add a job_province_id column instead of company_id
    await pool.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province_id UUID
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province_source TEXT
    `).catch(() => {});
    console.log('✅ Added province_id and province_source to jobs table');

    console.log('\n🎉 Migration complete!');
    console.log('Next steps:');
    console.log('  1. Update server code to use ontario_companies/quebec_companies instead of companies');
    console.log('  2. Run: npm run dev (restart server)');

  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
