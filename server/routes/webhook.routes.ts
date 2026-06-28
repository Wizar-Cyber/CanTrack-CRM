import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { JobClassifierService } from '../services/job-classifier.service.js';
import { REGION_FILTER, isRegionFilterActive, isRegionMatch } from '../utils/region-filter.js';
import { spawn } from 'child_process';
import { findCompanyInBothTables, enrichAndInsertCompany } from '../utils/province-helpers.js';

// ── Module-level state for enrichment batch ────────────────────────────────
let enrichRunning = false;
let enrichLastRun: { startedAt: string; finishedAt?: string; exitCode?: number | null; pid?: number } | null = null;

export function createWebhookRouter(pool: Pool) {
  const router = Router();

  router.post('/scraper', async (req: AuthRequest, res: Response) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Invalid webhook secret.' });

    const { fuente, titulo, empresa, url_postulacion, location, country } = req.body;
    if (!empresa || !titulo || !url_postulacion)
      return res.status(400).json({ error: 'Required fields: empresa, titulo, url_postulacion.' });

    if (isRegionFilterActive() && !isRegionMatch(location, country, titulo, empresa, url_postulacion)) {
      return res.json({ success: true, skipped: true, reason: `Outside region ${REGION_FILTER}` });
    }

    try {
      const validSources = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);
      const source = validSources.has((fuente || '').toLowerCase()) ? fuente.toLowerCase() : 'other';

      const existing = await findCompanyInBothTables(pool, empresa);
      let companyId: string;
      let province: string;
      let isNew = false;

      if (existing) {
        companyId = existing.id;
        province = existing.src;
        console.log(`[Webhook] Existing company: ${empresa} -> ${existing.table}`);
      } else {
        isNew = true;
        const created = await enrichAndInsertCompany(pool, empresa);
        companyId = created.id;
        province = created.src;
      }

      const insertResult = await pool.query(
        `INSERT INTO jobs (raw_company_name, title, source, url, province_id, province_source)
         VALUES ($1, $2, $3::job_source_enum, $4, $5, $6)
         ON CONFLICT (LOWER(TRIM(COALESCE(raw_company_name,''))), LOWER(TRIM(COALESCE(title,''))))
           WHERE is_active = true
           DO UPDATE SET url = EXCLUDED.url, province_id = COALESCE(EXCLUDED.province_id, jobs.province_id), updated_at = NOW()
         RETURNING id`,
        [empresa, titulo, source, url_postulacion, companyId, province]
      );

      if (insertResult.rowCount && insertResult.rowCount > 0) {
        const newJobId = insertResult.rows[0].id;
        JobClassifierService.classifyJob(titulo, '', empresa, '')
          .then(result => pool.query(
            `UPDATE jobs SET service_type_id=$1, service_match_confidence=$2, service_match_reasoning=$3, service_match_provider=$4 WHERE id=$5`,
            [result.service_id, result.confidence, result.reasoning, result._provider, newJobId]
          ))
          .catch(err => console.warn('[Webhook Classify]', err.message));
      }

      return res.json({ success: true, isNew, province, companyId });
    } catch (error) {
      console.error('[Webhook Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.post('/enrich', async (req: AuthRequest, res: Response) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret invalido.' });

    if (enrichRunning) {
      return res.status(409).json({
        error: 'Ya hay un batch de enriquecimiento en curso.',
        lastRun: enrichLastRun,
      });
    }

    const limit = Math.max(1, Math.min(200, parseInt(req.body?.limit, 10) || 20));
    const delay = Math.max(200, Math.min(10_000, parseInt(req.body?.delay, 10) || 1200));
    const runSync = req.body?.sync === true || req.body?.sync === 'true';

    const scriptArgs = ['tsx', 'scripts/enrich-companies.ts', '--limit', String(limit), '--delay', String(delay)];
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', scriptArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    enrichRunning = true;
    enrichLastRun = { startedAt: new Date().toISOString(), pid: child.pid };

    child.stdout?.on('data', d => process.stdout.write(`[Enrich] ${d}`));
    child.stderr?.on('data', d => process.stderr.write(`[Enrich err] ${d}`));
    child.on('close', code => {
      enrichRunning = false;
      enrichLastRun = { ...enrichLastRun!, finishedAt: new Date().toISOString(), exitCode: code };
      console.log(`[Webhook Enrich] termino con codigo ${code}`);
    });

    if (runSync) {
      pool.query(`
        SELECT COUNT(*)::int AS n FROM jobs WHERE company_id IS NULL AND raw_company_name IS NOT NULL
      `).then(r => console.log(`[Webhook Enrich] jobs pendientes de sync: ${r.rows[0].n}`))
        .catch(() => {});
    }

    return res.json({
      success: true,
      message: `Batch de enriquecimiento lanzado (limit=${limit}, delay=${delay}ms).`,
      pid: child.pid,
      startedAt: enrichLastRun.startedAt,
    });
  });

  router.get('/enrich/status', createRequireAuth(pool), async (_req: AuthRequest, res: Response) => {
    res.json({ running: enrichRunning, lastRun: enrichLastRun });
  });

  return router;
}
