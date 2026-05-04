import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { createRequireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { EnrichmentService } from '../services/enrichment.service.js';

const ALLOWED_COMPANY_COLUMNS = new Set([
  'enrichment_status', 'industry', 'company_size',
  'hq_city', 'hq_province', 'hq_country', 'exact_address',
  'phone', 'contact_email', 'website', 'description',
  'known_ats_portal', 'legal_name', 'name',
]);

const processNextLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes al queue de enriquecimiento.' },
});

function buildUpdatePayload(data: Awaited<ReturnType<typeof EnrichmentService.enrichCompany>>) {
  const payload: Record<string, unknown> = {};
  if (data.industry) payload.industry = data.industry;
  if (data.company_size) payload.company_size = data.company_size;
  if (data.hq_city) payload.hq_city = data.hq_city;
  if (data.hq_province) payload.hq_province = data.hq_province;
  if (data.hq_country) payload.hq_country = data.hq_country;
  if (data.exact_address) payload.exact_address = data.exact_address;
  if (data.phone) payload.phone = data.phone;
  if (data.contact_email) payload.contact_email = data.contact_email;
  if (data.website) payload.website = data.website;
  if (data.description) payload.description = data.description;
  return payload;
}

export function createEnrichmentRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // POST /api/enrichment/process-next — queue processor (called by frontend poller)
  router.post('/process-next', requireAuth, processNextLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const lockResult = await pool.query(
        `UPDATE companies SET enrichment_status = 'processing'
         WHERE id = (
           SELECT id FROM companies WHERE enrichment_status = 'pending'
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
         ) RETURNING id, name`,
      );
      if (lockResult.rows.length === 0) return res.json({ done: true, message: 'No hay empresas pendientes.' });

      const { id: companyId, name: companyName } = lockResult.rows[0];

      const existing = await pool.query(
        'SELECT industry, website, description FROM companies WHERE id = $1',
        [companyId],
      );
      const row = existing.rows[0];

      if (row && (row.industry || row.website || row.description)) {
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId],
        );
        return res.json({ done: false, source: 'db_matched', companyId, companyName });
      }

      const data = await EnrichmentService.enrichCompany(companyName);
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';
      const updatePayload = { enrichment_status: newStatus, ...buildUpdatePayload(data) };

      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k) || k === 'enrichment_status');
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values],
      );

      const countResult = await pool.query(`SELECT COUNT(*)::int AS remaining FROM companies WHERE enrichment_status = 'pending'`);
      const remaining = countResult.rows[0].remaining;
      return res.json({ done: remaining === 0, source: data._provider ?? 'unknown', companyId, companyName, data, remaining });
    } catch (error) {
      console.error('[process-next Error]:', error);
      await pool.query(
        `UPDATE companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`,
      ).catch(() => {});
      return res.status(500).json({ error: 'Error procesando cola de enriquecimiento.' });
    }
  });

  // GET /api/enrichment/status
  router.get('/status', requireAuth, async (_req, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE enrichment_status = 'pending')::int    AS pending,
          COUNT(*) FILTER (WHERE enrichment_status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE enrichment_status = 'scraped')::int    AS scraped,
          COUNT(*) FILTER (WHERE enrichment_status = 'db_matched')::int AS db_matched
        FROM companies
      `);
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Enrichment Status Error]:', error);
      return res.status(500).json({ error: 'Error al obtener estado.' });
    }
  });

  return router;
}
