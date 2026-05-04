import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { slugify } from '../utils/slug.js';

const VALID_SOURCES = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);

export function createSyncRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // POST /api/sync/scraped-jobs
  router.post('/scraped-jobs', requireAuth, async (_req: AuthRequest, res: Response) => {
    let linkedJobs   = 0;
    let newCompanies = 0;

    try {
      // Step 1: jobs inserted by scraper with raw_company_name but no company_id
      const unlinkedResult = await pool.query(`
        SELECT id, raw_company_name, source, url, created_at
        FROM jobs
        WHERE company_id IS NULL
          AND raw_company_name IS NOT NULL
          AND raw_company_name <> ''
        ORDER BY created_at ASC
        LIMIT 200
      `);

      for (const job of unlinkedResult.rows) {
        const name = job.raw_company_name as string;
        const slug = slugify(name);

        const insertComp = await pool.query(
          `INSERT INTO companies (name, slug, enrichment_status)
           VALUES ($1, $2, 'pending'::enrichment_status_enum)
           ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [name, slug],
        );

        let companyId: string;
        if (insertComp.rows.length > 0) {
          companyId = insertComp.rows[0].id;
          newCompanies++;
        } else {
          const found = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
          if (found.rows.length === 0) continue;
          companyId = found.rows[0].id;
        }

        await pool.query(
          `UPDATE jobs SET company_id = $1, updated_at = NOW() WHERE id = $2`,
          [companyId, job.id],
        );
        linkedJobs++;
      }

      // Step 2: legacy scraped_jobs not yet in jobs table
      const legacyResult = await pool.query(`
        SELECT DISTINCT ON (sj.url_postulacion)
          sj.fuente, sj.titulo, sj.empresa, sj.url_postulacion, sj.fecha_creacion
        FROM scraped_jobs sj
        WHERE sj.empresa IS NOT NULL AND sj.titulo IS NOT NULL AND sj.url_postulacion IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.url = sj.url_postulacion)
        ORDER BY sj.url_postulacion, sj.fecha_creacion DESC
        LIMIT 200
      `);

      for (const sj of legacyResult.rows) {
        const slug = slugify(sj.empresa);
        const insertComp = await pool.query(
          `INSERT INTO companies (name, slug, enrichment_status)
           VALUES ($1, $2, 'pending'::enrichment_status_enum)
           ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [sj.empresa, slug],
        );
        let companyId: string;
        if (insertComp.rows.length > 0) {
          companyId = insertComp.rows[0].id;
          newCompanies++;
        } else {
          const found = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
          if (found.rows.length === 0) continue;
          companyId = found.rows[0].id;
        }
        const source = VALID_SOURCES.has(sj.fuente?.toLowerCase()) ? sj.fuente.toLowerCase() : 'other';
        try {
          await pool.query(
            `INSERT INTO jobs (company_id, title, source, url, raw_company_name, created_at)
             VALUES ($1, $2, $3::job_source_enum, $4, $5, $6)`,
            [companyId, sj.titulo, source, sj.url_postulacion, sj.empresa, sj.fecha_creacion ?? new Date()],
          );
          linkedJobs++;
        } catch { /* duplicate url — skip */ }
      }

      console.log(`[Sync] ${linkedJobs} vacantes vinculadas, ${newCompanies} empresas nuevas.`);
      return res.json({
        synced: linkedJobs,
        newCompanies,
        message: linkedJobs === 0
          ? 'Todo al día — no hay vacantes sin empresa.'
          : `${linkedJobs} vacantes sincronizadas, ${newCompanies} empresas nuevas para enriquecer.`,
      });
    } catch (error) {
      console.error('[Sync Error]:', error);
      return res.status(500).json({ error: 'Error sincronizando vacantes.' });
    }
  });

  return router;
}
