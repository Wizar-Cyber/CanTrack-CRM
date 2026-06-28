-- ═══════════════════════════════════════════════════════════════════════
-- Migration 006: Full-text search indexes and missing performance indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Full-text search GIN indexes for Spanish-language text search
CREATE INDEX IF NOT EXISTS idx_companies_name_fts
  ON companies
  USING GIN (to_tsvector('spanish', COALESCE(name, '')));

CREATE INDEX IF NOT EXISTS idx_jobs_title_fts
  ON jobs
  USING GIN (to_tsvector('spanish', COALESCE(title, '')));

-- Index for unlinked job sync queries (heavily used)
CREATE INDEX IF NOT EXISTS idx_jobs_unlinked
  ON jobs(created_at)
  WHERE company_id IS NULL AND raw_company_name IS NOT NULL;

-- Index for raw_company_name lookups (heavily used during sync)
CREATE INDEX IF NOT EXISTS idx_jobs_raw_company_name
  ON jobs(raw_company_name)
  WHERE raw_company_name IS NOT NULL;

-- Composite index for province table enrichment queue
CREATE INDEX IF NOT EXISTS idx_province_companies_enrichment
  ON ontario_companies(enrichment_status, created_at)
  WHERE enrichment_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_province_companies_enrichment_qc
  ON quebec_companies(enrichment_status, created_at)
  WHERE enrichment_status = 'pending';

-- Index for province_id + province_source joins (heavily used)
CREATE INDEX IF NOT EXISTS idx_jobs_province
  ON jobs(province_id, province_source)
  WHERE province_id IS NOT NULL;

-- Index for email_logs lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_company
  ON email_logs(company_id, sent_at DESC);

-- Index for automation_log queries
CREATE INDEX IF NOT EXISTS idx_automation_log_job
  ON automation_log(job, created_at DESC);
