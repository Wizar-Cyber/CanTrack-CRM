import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { GeminiService } from '../services/gemini.service.js';
import { JobClassifierService } from '../services/job-classifier.service.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import {
  REGION_FILTER, isRegionFilterActive, companyRegionClause, jobRegionClause, isRegionMatch,
} from '../utils/region-filter.js';
import { slugify } from '../utils/slug.js';

const ALLOWED_JOB_COLUMNS = new Set([
  'title', 'url', 'location', 'country', 'category',
  'application_type', 'is_easy_apply', 'is_active', 'raw_company_name',
]);

export function createJobsRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  router.get('/', requireAuth, async (req, res) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const search = ((req.query.search as string) || '').trim();

      const params: any[] = [limit, offset];
      let searchClause = '';
      if (search) {
        searchClause = `AND (
          j.title ILIKE $3
          OR COALESCE(c.name, j.raw_company_name) ILIKE $3
          OR j.location ILIKE $3
        )`;
        params.push(`%${search}%`);
      }

      const regionSQL = jobRegionClause('j');
      const baseSelect = `
        SELECT
          j.*,
          COALESCE(oc.nombre, qc.nombre, j.raw_company_name) AS company_name,
          COALESCE(oc.industry, qc.industry) AS company_industry,
          COALESCE(oc.company_size, qc.company_size) AS company_size,
          COALESCE(oc.ciudad, qc.ciudad) AS company_hq_city,
          'Canada' AS company_hq_country,
          COALESCE(oc.dominio_de_pagina, qc.dominio_de_pagina, oc.website, qc.website) AS company_website,
          COALESCE(oc.descripcion, qc.descripcion) AS company_description,
          COALESCE(oc.enrichment_status, qc.enrichment_status) AS company_enrichment_status
        FROM jobs j
        LEFT JOIN ontario_companies oc ON j.province_id = oc.id AND j.province_source = 'ontario'
        LEFT JOIN quebec_companies qc ON j.province_id = qc.id AND j.province_source = 'quebec'
        WHERE j.is_active = true AND ${regionSQL} ${searchClause}
      `;

      const [rowsResult, countResult] = await Promise.all([
        pool.query(`${baseSelect} ORDER BY j.created_at DESC LIMIT $1 OFFSET $2`, params),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM jobs j
           LEFT JOIN ontario_companies oc ON j.province_id = oc.id AND j.province_source = 'ontario'
           LEFT JOIN quebec_companies qc ON j.province_id = qc.id AND j.province_source = 'quebec'
           WHERE j.is_active = true AND ${regionSQL} ${searchClause}`,
          search ? [`%${search}%`] : [],
        ),
      ]);

      // Enriquecer cada vacante con el nombre legible del servicio CanTrack
      // y un title_display que prioriza el servicio sobre el título crudo.
      const enriched = rowsResult.rows.map((j: any) => {
        const svc = j.service_type_id ? SERVICE_TYPE_BY_ID[j.service_type_id] : null;
        return {
          ...j,
          service_name:    svc?.name    ?? null,
          service_number:  svc?.number  ?? null,
          service_category: svc?.category ?? null,
          // title_display: servicio mapeado si existe, si no el título original
          title_display:   svc?.name    ?? j.title,
          // has_direct_service_match: false si el clasificador no encontró ningún servicio
          has_direct_service_match: !!svc,
        };
      });

      res.json({
        data:       enriched,
        total:      countResult.rows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      });
    } catch (error) {
      console.error('[DB Error] Fetching jobs:', error);
      res.status(500).json({ error: 'Error al obtener trabajos.' });
    }
  });

  // GET /api/jobs/:id — single job
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name,
                c.industry, c.website, c.description, c.enrichment_status
         FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
         WHERE j.id = $1 AND j.is_active = true`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      const j: any = result.rows[0];
      const svc = j.service_type_id ? SERVICE_TYPE_BY_ID[j.service_type_id] : null;
      return res.json({
        ...j,
        service_name:    svc?.name    ?? null,
        service_number:  svc?.number  ?? null,
        service_category: svc?.category ?? null,
        title_display:   svc?.name    ?? j.title,
        has_direct_service_match: !!svc,
      });
    } catch (error) {
      console.error('[Job GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener vacante.' });
    }
  });

  // POST /api/jobs — create job
  // Acepta dos modos:
  //   A) company_id + title + source + url  → vacante completa vinculada
  //   B) raw_company_name + title + source + url → scraper inserta sin company (sync la vinculará)
  router.post('/', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply } = req.body;
    const VALID_SOURCES = ['linkedin', 'indeed', 'glassdoor', 'company_website', 'other'];
    if (!title || !source || !url)
      return res.status(400).json({ error: 'title, source y url son requeridos.' });
    if (!company_id && !raw_company_name)
      return res.status(400).json({ error: 'Se requiere company_id o raw_company_name.' });
    if (!VALID_SOURCES.includes(source))
      return res.status(400).json({ error: 'Fuente inválida. Usa: linkedin, indeed, glassdoor, company_website, other.' });
    try {
      const result = await pool.query(
        `INSERT INTO jobs (company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [company_id || null, raw_company_name || null, title.trim(), source, url.trim(),
         location || null, country || null, category || null, application_type || null, is_easy_apply || false]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23503') return res.status(404).json({ error: 'La empresa especificada no existe.' });
      console.error('[Job POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear vacante.' });
    }
  });

  // PATCH /api/jobs/:id — update job fields
  router.patch('/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_JOB_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      const result = await pool.query(
        `UPDATE jobs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING *`,
        [id, ...values]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true, job: result.rows[0] });
    } catch (error) {
      console.error('[Job PATCH Error]:', error);
      return res.status(500).json({ error: 'Error al actualizar vacante.' });
    }
  });

  // DELETE /api/jobs/:id — soft delete (is_active = false)
  router.delete('/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        'UPDATE jobs SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING id',
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Job DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar vacante.' });
    }
  });

  router.post('/classify', requireAuth, async (req: AuthRequest, res) => {
    const { title, description, companyName, companyIndustry, jobId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title es requerido' });

    try {
      const result = await JobClassifierService.classifyJob(
        title,
        description || '',
        companyName || '',
        companyIndustry || ''
      );

      // Si se envió un jobId, persiste la clasificación
      if (jobId) {
        await pool.query(
          `UPDATE jobs
           SET service_type_id = $1, service_match_confidence = $2,
               service_match_reasoning = $3, service_match_provider = $4
           WHERE id = $5`,
          [result.service_id, result.confidence, result.reasoning, result._provider, jobId]
        );
      }

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/jobs/classify]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/jobs/:id/classify
   * Clasifica la vacante guardada en BD y persiste el resultado.
   */
  router.post('/:id/classify', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const jobRow = await pool.query(
        `SELECT j.title, j.raw_company_name, c.name AS company_name, c.industry, j.id
         FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
         WHERE j.id = $1`,
        [id]
      );
      if (jobRow.rowCount === 0) return res.status(404).json({ success: false, message: 'Vacante no encontrada' });

      const job = jobRow.rows[0];
      const result = await JobClassifierService.classifyJob(
        job.title,
        '',
        job.company_name || job.raw_company_name || '',
        job.industry || ''
      );

      await pool.query(
        `UPDATE jobs
         SET service_type_id = $1, service_match_confidence = $2,
             service_match_reasoning = $3, service_match_provider = $4
         WHERE id = $5`,
        [result.service_id, result.confidence, result.reasoning, result._provider, id]
      );

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/jobs/:id/classify]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
}
