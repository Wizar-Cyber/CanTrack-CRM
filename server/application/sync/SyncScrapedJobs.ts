import type { Pool } from 'pg';
import { slugify } from '../../utils/slug.js';

export interface SyncResult {
  synced: number;
  newCompanies: number;
  message: string;
}

/**
 * SyncScrapedJobs — a complex orchestration use case that operates on two
 * legacy tables (jobs with NULL company_id and scraped_jobs). It uses Pool
 * directly because both tables require multi-step SQL with tight transaction
 * semantics that would be awkward to model across two repositories.
 *
 * If scraped_jobs is ever deprecated, this use case becomes the deletion point.
 */
export class SyncScrapedJobsUseCase {
  private readonly VALID_SOURCES = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);

  constructor(private readonly pool: Pool) {}

  async execute(): Promise<SyncResult> {
    let linkedJobs   = 0;
    let newCompanies = 0;

    linkedJobs   += await this.syncUnlinkedJobs(newCompanies).then(r => { newCompanies += r.newCompanies; return r.linked; });
    const legacy  = await this.syncLegacyScrapedJobs(newCompanies);
    linkedJobs   += legacy.linked;
    newCompanies += legacy.newCompanies;

    return {
      synced: linkedJobs,
      newCompanies,
      message: linkedJobs === 0
        ? 'All up to date — no unlinked vacancies.'
        : `${linkedJobs} vacancies synced, ${newCompanies} new companies to enrich.`,
    };
  }

  private async syncUnlinkedJobs(_seed: number): Promise<{ linked: number; newCompanies: number }> {
    let linked = 0; let newCompanies = 0;
    const result = await this.pool.query(`
      SELECT id, raw_company_name FROM jobs
      WHERE company_id IS NULL AND raw_company_name IS NOT NULL AND raw_company_name <> ''
      ORDER BY created_at ASC LIMIT 200
    `);
    for (const job of result.rows) {
      const { id, isNew } = await this.upsertCompany(job.raw_company_name);
      if (!id) continue;
      if (isNew) newCompanies++;
      await this.pool.query(`UPDATE jobs SET company_id = $1, updated_at = NOW() WHERE id = $2`, [id, job.id]);
      linked++;
    }
    return { linked, newCompanies };
  }

  private async syncLegacyScrapedJobs(_seed: number): Promise<{ linked: number; newCompanies: number }> {
    let linked = 0; let newCompanies = 0;
    const result = await this.pool.query(`
      SELECT DISTINCT ON (sj.url_postulacion) sj.fuente, sj.titulo, sj.empresa, sj.url_postulacion, sj.fecha_creacion
      FROM scraped_jobs sj
      WHERE sj.empresa IS NOT NULL AND sj.titulo IS NOT NULL AND sj.url_postulacion IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.url = sj.url_postulacion)
      ORDER BY sj.url_postulacion, sj.fecha_creacion DESC LIMIT 200
    `);
    for (const sj of result.rows) {
      const { id: companyId, isNew } = await this.upsertCompany(sj.empresa);
      if (!companyId) continue;
      if (isNew) newCompanies++;
      const source = this.VALID_SOURCES.has(sj.fuente?.toLowerCase()) ? sj.fuente.toLowerCase() : 'other';
      try {
        await this.pool.query(
          `INSERT INTO jobs (company_id, title, source, url, raw_company_name, created_at) VALUES ($1,$2,$3::job_source_enum,$4,$5,$6)`,
          [companyId, sj.titulo, source, sj.url_postulacion, sj.empresa, sj.fecha_creacion ?? new Date()],
        );
        linked++;
      } catch { /* duplicate — skip */ }
    }
    return { linked, newCompanies };
  }

  private async upsertCompany(name: string): Promise<{ id: string | null; isNew: boolean }> {
    const slug = slugify(name);
    const ins  = await this.pool.query(
      `INSERT INTO companies (name, slug, enrichment_status) VALUES ($1,$2,'pending'::enrichment_status_enum) ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [name, slug],
    );
    if (ins.rows.length > 0) return { id: ins.rows[0].id, isNew: true };
    const found = await this.pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
    return { id: found.rows[0]?.id ?? null, isNew: false };
  }
}
