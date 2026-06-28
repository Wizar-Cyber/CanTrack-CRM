import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { EnrichmentService } from '../services/enrichment.service.js';
import { GeminiService } from '../services/gemini.service.js';
import { JobClassifierService } from '../services/job-classifier.service.js';
import { MDirectorService } from '../services/mdirector.service.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import {
  REGION_FILTER, isRegionFilterActive, companyRegionClause, jobRegionClause, isRegionMatch,
} from '../utils/region-filter.js';
import { slugify } from '../utils/slug.js';
import { scheduleExcelExport } from '../utils/export-helpers.js';
import { maybeCopyToProvinceTable } from '../utils/province-helpers.js';

// ── Column allowlist for safe dynamic updates ─────────────────────────────────
const ALLOWED_COMPANY_COLUMNS = new Set([
  'enrichment_status', 'industry', 'company_size',
  'hq_city', 'hq_province', 'hq_country', 'hq_region', 'hq_town', 'exact_address',
  'phone', 'contact_email', 'website', 'description',
  'known_ats_portal', 'legal_name', 'name', 'tipo', 'tipo_updated_at',
]);

export function createCompaniesRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);



  // GET /api/companies
  router.get('/companies', requireAuth, async (req, res) => {
    try {
      const regionSQL = companyRegionClause('c');
      // Por defecto solo mostramos empresas con dirección real (enriquecidas).
      // ?includeUnenriched=1 permite verlas todas (para panel admin / enrichment queue).
      const includeUnenriched = req.query.includeUnenriched === '1' || req.query.includeUnenriched === 'true';
      const addressClause = includeUnenriched
        ? 'TRUE'
        : `(
            c.exact_address IS NOT NULL AND TRIM(c.exact_address) <> ''
            AND c.enrichment_status IN ('enriched','db_matched','scraped')
          )`;
      const result = await pool.query(
        `SELECT c.* FROM companies c
         WHERE ${regionSQL} AND ${addressClause}
         ORDER BY c.created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[DB Error] Fetching companies:', error);
      res.status(500).json({ error: 'Error al obtener empresas.' });
    }
  });

  // GET /api/companies/:id
  router.get('/companies/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Company GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener empresa.' });
    }
  });

  // POST /api/companies — create company
  router.post('/companies', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { name, legal_name, website, industry } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido.' });
    const slug = slugify(name);
    try {
      const result = await pool.query(
        `INSERT INTO companies (name, slug, legal_name, website, industry, enrichment_status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [name.trim(), slug, legal_name || null, website || null, industry || null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una empresa con ese nombre.' });
      console.error('[Company POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear empresa.' });
    }
  });

  // POST /api/gemini/enrich — enriquece una empresa específica (comprueba datos antes de llamar a Gemini)
  router.post('/gemini/enrich', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { companyId, companyName } = req.body;
    if (!companyId || !companyName) return res.status(400).json({ error: 'companyId y companyName son requeridos.' });
    try {
      // 1. Verificar si ya tiene datos en BD (no desperdiciar llamadas Gemini)
      const existing = await pool.query(
        'SELECT industry, website, description, enrichment_status FROM companies WHERE id = $1',
        [companyId]
      );
      const row = existing.rows[0];
      if (row && (row.industry || row.website || row.description) && row.enrichment_status !== 'pending') {
        // Ya tiene datos — solo confirmar como db_matched
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId]
        );
        return res.json({ success: true, source: 'db_matched', data: row });
      }

      // 2. No tiene datos → enriquecer (Gemini → Groq → Ollama → WebSearch)
      const data = await EnrichmentService.enrichCompany(companyName);
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';
      const updatePayload: Record<string, any> = { enrichment_status: newStatus };
      if (data.industry) updatePayload.industry = data.industry;
      if (data.company_size) updatePayload.company_size = data.company_size;
      if (data.hq_city) updatePayload.hq_city = data.hq_city;
      if (data.hq_province) updatePayload.hq_province = data.hq_province;
      if (data.hq_country) updatePayload.hq_country = data.hq_country;
      if (data.exact_address) updatePayload.exact_address = data.exact_address;
      if (data.phone) updatePayload.phone = data.phone;
      if (data.contact_email) updatePayload.contact_email = data.contact_email;
      if (data.website) updatePayload.website = data.website;
      if (data.description) updatePayload.description = data.description;
      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values]
      );
      // Disparar export al Excel en background (debounced 10s)
      if (hasData) scheduleExcelExport(pool);
      // Copiar a ontario/quebec si la provincia corresponde
      if (hasData) maybeCopyToProvinceTable(pool, companyId).catch(() => {});
      return res.json({ success: true, source: data._provider ?? 'unknown', data });
    } catch (error) {
      console.error('[Gemini Enrich Error]:', error);
      return res.status(500).json({ error: 'Error en enriquecimiento con Gemini.' });
    }
  });

  // POST /api/enrichment/process-next — procesa UNA empresa pending de la cola (llama el frontend cada N segundos)
  router.post('/enrichment/process-next', requireAuth, async (req: AuthRequest, res) => {
    try {
      // Lock next pending company that HAS a job linked
      let lockResult;
      for (const [table, src] of [['ontario_companies', 'ontario'], ['quebec_companies', 'quebec']] as const) {
        lockResult = await pool.query(`
          UPDATE ${table} oc SET enrichment_status = 'processing'
          WHERE oc.id = (
            SELECT oc2.id FROM ${table} oc2
            JOIN jobs j ON j.province_id = oc2.id AND j.province_source = $1
            WHERE oc2.enrichment_status = 'pending'
            ORDER BY oc2.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
          ) RETURNING oc.id, oc.nombre AS name, $1 AS src
        `, [src]);
        if (lockResult.rows.length > 0) break;
      }
      if (lockResult.rows.length === 0) return res.json({ done: true, message: 'No pending companies.' });

      const { id: companyId, name: companyName, src: province } = lockResult.rows[0];
      const table = province === 'ontario' ? 'ontario_companies' : 'quebec_companies';

      // Check if already has data
      const existing = await pool.query(
        `SELECT industry, website, description FROM ${table} WHERE id = $1`,
        [companyId]
      );
      const row = existing.rows[0];

      if (row && (row.industry || row.website || row.description)) {
        await pool.query(
          `UPDATE ${table} SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId]
        );
        scheduleExcelExport(pool);
        return res.json({ done: false, source: 'db_matched', companyId, companyName, province });
      }

      // AI enrichment (Gemini → Groq → WebSearch)
      const data = await EnrichmentService.enrichCompany(companyName);
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';

      // Build update payload for province table
      const updates: Record<string, any> = { enrichment_status: newStatus };

      if (data.is_closed === true) {
        updates.tipo = 'rojo';
        console.info(`[Auto-rojo] "${companyName}" marked as closed by AI`);
      }
      if (data.industry) updates.industry = data.industry;
      if (data.company_size) updates.company_size = data.company_size;
      if (data.website) updates.dominio_de_pagina = data.website;
      if (data.description) updates.descripcion = (data.description || '').substring(0, 500);
      if (data.hq_city) updates.ciudad = data.hq_city;
      if (data.hq_province) updates.provincia = data.hq_province;
      if (data.exact_address) updates.direccion = data.exact_address;
      if (data.phone) updates.telefono = data.phone;
      if (data.contact_email) updates.correo = data.contact_email;
      if (data.website) updates.dominio_de_pagina = data.website;

      const updateKeys = Object.keys(updates);
      const setClauses = updateKeys.map((k, i) => `"${k}" = $${i + 3}`);
      const allValues = [companyId, data._provider ?? 'unknown', ...Object.values(updates)];
      await pool.query(
        `UPDATE ${table} SET ${setClauses.join(', ')}, enrichment_provider = $2, enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        allValues
      );

      // Trigger sheets export in background
      if (hasData) scheduleExcelExport(pool);

      // Auto-suggest services
      if (hasData) {
        JobClassifierService.suggestForCompany({
          name: companyName, industry: data.industry, description: data.description,
          company_size: data.company_size, hq_city: data.hq_city, hq_country: data.hq_country,
        }).then(suggestions => pool.query(
          `UPDATE ${table} SET suggested_services=$1, suggested_services_at=NOW() WHERE id=$2`,
          [JSON.stringify(suggestions.suggestions), companyId]
        )).catch(err => console.warn('[Auto-suggest]', err.message));
      }

      // Remaining count
      const countResult = await pool.query(
        `SELECT (SELECT COUNT(*) FROM ontario_companies WHERE enrichment_status = 'pending') +
                (SELECT COUNT(*) FROM quebec_companies WHERE enrichment_status = 'pending') AS cnt`
      );
      const remaining = parseInt(countResult.rows[0].cnt, 10);
      return res.json({ done: remaining === 0, source: data._provider ?? 'unknown', companyId, companyName, data, remaining, province });

    } catch (error: any) {
      console.error('[process-next Error]:', error);
      // Release locks on error
      await pool.query(
        `UPDATE ontario_companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`
      ).catch(() => {});
      await pool.query(
        `UPDATE quebec_companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`
      ).catch(() => {});
      return res.status(500).json({ error: 'Error processing enrichment queue.' });
    }
  });

  // DELETE /api/companies/all — borra datos de enriquecimiento de TODAS las empresas para re-scrapar
  // Mantiene las empresas (nombre/slug) pero resetea todos los campos enriquecidos a NULL y status a 'pending'
  // Opcional: ?limit=20  → solo las primeras N quedan como 'pending', el resto como 'skipped'
  router.delete('/companies/all', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;

      // 1. Resetear todo a NULL primero
      await pool.query(`
        UPDATE companies SET
          industry       = NULL,
          company_size   = NULL,
          hq_city        = NULL,
          hq_province    = NULL,
          hq_country     = NULL,
          exact_address  = NULL,
          phone          = NULL,
          contact_email  = NULL,
          website        = NULL,
          description    = NULL,
          known_ats_portal = NULL,
          legal_name     = NULL,
          enrichment_status = 'skipped',
          enriched_at    = NULL,
          updated_at     = CURRENT_TIMESTAMP
      `);

      if (limit && limit > 0) {
        // 2a. Solo las primeras N (por fecha de creación) quedan como 'pending'
        await pool.query(
          `UPDATE companies SET enrichment_status = 'pending'
           WHERE id IN (
             SELECT id FROM companies ORDER BY created_at ASC LIMIT $1
           )`,
          [limit]
        );
        return res.json({ success: true, message: `Reset done. First ${limit} companies queued for enrichment, rest skipped.` });
      } else {
        // 2b. Sin límite — todas como pending
        await pool.query(`UPDATE companies SET enrichment_status = 'pending'`);
        return res.json({ success: true, message: 'All company enrichment data cleared. Ready to re-scrape.' });
      }
    } catch (error) {
      console.error('[Clear Companies Error]:', error);
      return res.status(500).json({ error: 'Error clearing company data.' });
    }
  });

  // POST /api/companies/export — exporta empresas seleccionadas a Excel
  router.post('/companies/export', requireAuth, async (req, res) => {
    try {
      const { ids, serviceId } = req.body as { ids?: string[]; serviceId?: string };

      const where: string[] = [];
      const params: any[] = [];
      if (Array.isArray(ids) && ids.length > 0) {
        params.push(ids);
        where.push(`c.id = ANY($${params.length}::uuid[])`);
      }
      if (serviceId) {
        params.push(serviceId);
        where.push(`(
          EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.service_type_id = $${params.length})
          OR c.suggested_services::jsonb @> jsonb_build_array(jsonb_build_object('service_id', $${params.length}::text))
        )`);
      }
      // Inyectar filtro regional (no-op si REGION_FILTER vacío)
      where.push(companyRegionClause('c'));
      const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const q = `
        SELECT
          c.id, c.name, c.exact_address, c.hq_city, c.hq_province, c.hq_country,
          c.suggested_services,
          (SELECT j.service_type_id FROM jobs j
            WHERE j.company_id = c.id AND j.service_type_id IS NOT NULL
            ORDER BY j.created_at DESC LIMIT 1) AS job_service_type_id
        FROM companies c
        ${whereSQL}
        ORDER BY c.name
      `;
      const { rows } = await pool.query(q, params);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'CanTrack CRM';
      const ws = wb.addWorksheet('Hoja1');

      // Formato exacto Acton Vale: 3 columnas sin estilo extra.
      ws.columns = [
        { header: 'Empresa',    key: 'empresa',   width: 38 },
        { header: 'DIRECCION',  key: 'direccion', width: 55 },
        { header: 'WORK',       key: 'work',      width: 24 },
      ];

      // Solo negrita en encabezado — el archivo de referencia es muy simple.
      ws.getRow(1).font = { bold: true };

      // Resolver el WORK para cada empresa
      const resolveWork = (r: any): string => {
        // 1. Servicio derivado de la vacante clasificada
        const jobSvc = r.job_service_type_id;
        if (jobSvc && SERVICE_TYPE_BY_ID[jobSvc]) return SERVICE_TYPE_BY_ID[jobSvc].name;
        // 2. Filtro explícito por servicio
        if (serviceId && SERVICE_TYPE_BY_ID[serviceId]) return SERVICE_TYPE_BY_ID[serviceId].name;
        // 3. Primera sugerencia AI sobre la empresa
        const ss = Array.isArray(r.suggested_services) ? r.suggested_services : null;
        if (ss && ss.length && ss[0]?.service_id && SERVICE_TYPE_BY_ID[ss[0].service_id]) {
          return SERVICE_TYPE_BY_ID[ss[0].service_id].name;
        }
        // 4. Fallback
        return 'General';
      };

      // Componer dirección Acton Vale-style si exact_address está vacío
      const resolveAddress = (r: any): string => {
        if (r.exact_address) return r.exact_address;
        const parts = [r.hq_city, r.hq_province, r.hq_country].filter(Boolean);
        return parts.join(', ');
      };

      for (const r of rows) {
        ws.addRow({
          empresa:   r.name ?? '',
          direccion: resolveAddress(r),
          work:      resolveWork(r),
        });
      }

      const filename = serviceId && SERVICE_TYPE_BY_ID[serviceId]
        ? `cantrack-${SERVICE_TYPE_BY_ID[serviceId].id}-${new Date().toISOString().slice(0,10)}.xlsx`
        : `cantrack-empresas-${new Date().toISOString().slice(0,10)}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('[Export Error]:', error);
      res.status(500).json({ error: 'Error al exportar Excel.' });
    }
  });

  // GET /api/enrichment/status — cuántas empresas pending/processing quedan
  router.get('/enrichment/status', requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE enrichment_status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE enrichment_status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE enrichment_status = 'scraped') AS scraped,
          COUNT(*) FILTER (WHERE enrichment_status = 'db_matched') AS db_matched
        FROM companies
      `);
      const row = result.rows[0];
      return res.json({
        pending: parseInt(row.pending, 10),
        processing: parseInt(row.processing, 10),
        scraped: parseInt(row.scraped, 10),
        db_matched: parseInt(row.db_matched, 10),
      });
    } catch (error) {
      console.error('[Enrichment Status Error]:', error);
      return res.status(500).json({ error: 'Error al obtener estado.' });
    }
  });

  // PATCH /api/companies/:id/tipo
  router.patch('/companies/:id/tipo', requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { tipo } = req.body;
    const valid = ['verde','naranja','morado','rojo',null];
    if (!valid.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    try {
      await pool.query(
        `UPDATE companies SET tipo=$1, tipo_updated_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [tipo, id]
      );
      return res.json({ success: true, tipo });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/companies/:id — Enrich (editor+ only, column allowlist prevents SQL injection)
  router.patch('/companies/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });

    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, ...values]
      );
      return res.json({ success: true });
    } catch (error) {
      console.error('[DB Error] Updating company:', error);
      return res.status(500).json({ error: 'Error al actualizar empresa.' });
    }
  });

  // DELETE /api/companies/:id — hard delete (restricts if has jobs)
  router.delete('/companies/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json({ success: true });
    } catch (error: any) {
      if (error.code === '23503') return res.status(409).json({ error: 'No se puede eliminar: la empresa tiene vacantes asociadas.' });
      console.error('[Company DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar empresa.' });
    }
  });

  // POST /api/companies/:id/send-offer — Envía correo de oferta de personal via mDirector
  router.post('/companies/:id/send-offer', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id: companyId } = req.params;
    const { toEmail, toName, employeeTypeId, employeeTypeName, employeeTypeDescription, subject, customMessage } = req.body;

    if (!toEmail || !employeeTypeId || !employeeTypeName || !subject)
      return res.status(400).json({ error: 'toEmail, employeeTypeId, employeeTypeName y subject son requeridos.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail))
      return res.status(400).json({ error: 'Email de destino inválido.' });

    try {
      const companyRes = await pool.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
      if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });

      const company = companyRes.rows[0];
      const senderName = `${req.user!.firstName} ${req.user!.lastName}`;

      const htmlBody = MDirectorService.buildOfferEmailHtml({
        companyName: company.name,
        contactName: toName || undefined,
        employeeTypeName,
        employeeTypeDescription: employeeTypeDescription || '',
        customMessage: customMessage || '',
        senderName,
      });

      const result = await MDirectorService.sendEmail({
        toEmail,
        toName: toName || company.name,
        subject,
        htmlBody,
        companyId,
        employeeTypeId,
        sentByUserId: req.user!.id,
      });

      if (!result.success) return res.status(502).json({ error: result.error || 'Error al enviar el correo.' });

      // Registrar en historial
      await pool.query(
        `INSERT INTO email_logs (company_id, sent_by, to_email, to_name, subject, employee_type_id, employee_type_name, mdirector_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [companyId, req.user!.id, toEmail, toName || null, subject, employeeTypeId, employeeTypeName, result.messageId || null]
      );

      console.log(`[mDirector] Oferta enviada → ${toEmail} | empresa: ${company.name} | perfil: ${employeeTypeName}`);
      return res.json({ success: true, messageId: result.messageId });
    } catch (error: any) {
      console.error('[Send Offer Error]:', error);
      return res.status(500).json({ error: 'Error interno al enviar la oferta.' });
    }
  });

  // GET /api/companies/:id/email-logs — historial de correos enviados
  router.get('/companies/:id/email-logs', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT el.*, u.first_name || ' ' || u.last_name AS sent_by_name
         FROM email_logs el
         LEFT JOIN users u ON el.sent_by = u.id
         WHERE el.company_id = $1
         ORDER BY el.sent_at DESC
         LIMIT 50`,
        [req.params.id]
      );
      return res.json(result.rows);
    } catch (error) {
      console.error('[Email Logs Error]:', error);
      return res.status(500).json({ error: 'Error al obtener historial.' });
    }
  });

  // PATCH /api/companies/:id/google-maps-status
  router.patch('/companies/:id/google-maps-status', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['open', 'closed', 'unknown'].includes(status)) {
      return res.status(400).json({ error: 'status debe ser: open, closed o unknown' });
    }
    await pool.query(
      `UPDATE companies SET google_maps_status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
    return res.json({ success: true });
  });

  // POST /api/companies/:id/suggest-services
  router.post('/companies/:id/suggest-services', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const companyRow = await pool.query(
        `SELECT id, name, industry, description, company_size, hq_city, hq_country
         FROM companies WHERE id = $1`,
        [id]
      );
      if (companyRow.rowCount === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada' });

      const company = companyRow.rows[0];
      const result = await JobClassifierService.suggestForCompany(company);

      await pool.query(
        `UPDATE companies
         SET suggested_services = $1, suggested_services_summary = $2,
             suggested_services_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(result.suggestions), result.company_summary, id]
      );

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/companies/:id/suggest-services]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /api/companies/:id/suggest-services
  // Devuelve las sugerencias guardadas (o genera nuevas si no existen).
  router.get('/companies/:id/suggest-services', requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const row = await pool.query(
        `SELECT suggested_services, suggested_services_summary, suggested_services_at,
                name, industry, description, company_size, hq_city, hq_country
         FROM companies WHERE id = $1`,
        [id]
      );
      if (row.rowCount === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada' });

      const company = row.rows[0];

      // Si ya hay sugerencias guardadas, devuélvelas
      if (company.suggested_services) {
        return res.json({
          success: true,
          data: {
            suggestions: company.suggested_services,
            company_summary: company.suggested_services_summary,
            generated_at: company.suggested_services_at,
            _cached: true,
          },
        });
      }

      // Si no, genera nuevas (no bloquea — responde rápido con fallback)
      const result = await JobClassifierService.suggestForCompany(company);
      await pool.query(
        `UPDATE companies SET suggested_services = $1, suggested_services_summary = $2, suggested_services_at = NOW() WHERE id = $3`,
        [JSON.stringify(result.suggestions), result.company_summary, id]
      );
      return res.json({ success: true, data: { ...result, _cached: false } });
    } catch (err: any) {
      console.error('[GET /api/companies/:id/suggest-services]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
}
