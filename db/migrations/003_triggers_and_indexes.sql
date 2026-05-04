-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003: auto-updated_at triggers + GIN full-text index
-- Safe to re-run (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. updated_at trigger function ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Attach trigger to each table ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. GIN index for full-text search on jobs ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_title_fts
  ON jobs USING GIN(to_tsvector('spanish', COALESCE(title, '')));

CREATE INDEX IF NOT EXISTS idx_companies_name_fts
  ON companies USING GIN(to_tsvector('spanish', COALESCE(name, '')));

-- ── 4. raw_company_name index (used heavily during sync) ────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_raw_company_name
  ON jobs(raw_company_name)
  WHERE raw_company_name IS NOT NULL;

-- ── 5. Partial index: unlinked jobs (company_id IS NULL) ────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_unlinked
  ON jobs(created_at)
  WHERE company_id IS NULL AND raw_company_name IS NOT NULL;
