import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { slugify } from '../utils/slug.js';
import { EnrichmentService } from '../services/enrichment.service.js';
import { MDirectorService } from '../services/mdirector.service.js';

const ALLOWED_COMPANY_COLUMNS = new Set([
  'enrichment_status', 'industry', 'company_size',
  'hq_city', 'hq_province', 'hq_country', 'exact_address',
  'phone', 'contact_email', 'website', 'description',
  'known_ats_portal', 'legal_name', 'name',
]);

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas exportaciones. Espera un minuto.' },
});

const enrichLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Demasiadas solicitudes de enriquecimiento.' },
});

export function createCompaniesRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // GET /api/companies
  router.get('/', requireAuth, async (_req, res: Response) => {
    try {
      const result = await pool.query('SELECT * FROM companies ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (error) {
      console.error('[DB Error] Fetching companies:', error);
      return res.status(500).json({ error: 'Error al obtener empresas.' });
    }
  });

  // GET /api/companies/:id — must be before DELETE /api/companies/all
  router.get('/:id', requireAuth, async (req, res: Response) => {
    try {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Company GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener empresa.' });
    }
  });

  // POST /api/companies
  router.post('/', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { name, legal_name, website, industry } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido.' });
    const slug = slugify(name);
    try {
      const result = await pool.query(
        `INSERT INTO companies (name, slug, legal_name, website, industry, enrichment_status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [name.trim(), slug, legal_name || null, website || null, industry || null],
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23505') return res.status(409).json({ error: 'Ya existe una empresa con ese nombre.' });
      console.error('[Company POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear empresa.' });
    }
  });

  // PATCH /api/companies/:id
  router.patch('/:id', requireAuth, requireRole('admin', 'editor'), async (_req: AuthRequest, res: Response) => {
    const req = _req as AuthRequest;
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });

    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, ...values],
      );
      return res.json({ success: true });
    } catch (error) {
      console.error('[DB Error] Updating company:', error);
      return res.status(500).json({ error: 'Error al actualizar empresa.' });
    }
  });

  // DELETE /api/companies/all — reset enrichment data (before /:id)
  router.delete('/all', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;

      await pool.query(`
        UPDATE companies SET
          industry       = NULL, company_size   = NULL, hq_city        = NULL,
          hq_province    = NULL, hq_country     = NULL, exact_address  = NULL,
          phone          = NULL, contact_email  = NULL, website        = NULL,
          description    = NULL, known_ats_portal = NULL, legal_name   = NULL,
          enrichment_status = 'skipped', enriched_at = NULL, updated_at = CURRENT_TIMESTAMP
      `);

      if (limit && limit > 0) {
        await pool.query(
          `UPDATE companies SET enrichment_status = 'pending'
           WHERE id IN (SELECT id FROM companies ORDER BY created_at ASC LIMIT $1)`,
          [limit],
        );
        return res.json({ success: true, message: `Reset done. First ${limit} companies queued for enrichment, rest skipped.` });
      }
      await pool.query(`UPDATE companies SET enrichment_status = 'pending'`);
      return res.json({ success: true, message: 'All company enrichment data cleared. Ready to re-scrape.' });
    } catch (error) {
      console.error('[Clear Companies Error]:', error);
      return res.status(500).json({ error: 'Error clearing company data.' });
    }
  });

  // DELETE /api/companies/:id
  router.delete('/:id', requireAuth, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
    const req = _req as AuthRequest;
    const { id } = req.params;
    try {
      const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json({ success: true });
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23503') return res.status(409).json({ error: 'No se puede eliminar: la empresa tiene vacantes asociadas.' });
      console.error('[Company DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar empresa.' });
    }
  });

  // POST /api/companies/export
  router.post('/export', requireAuth, exportLimiter, async (req, res: Response) => {
    try {
      const { ids } = req.body;
      let query: string;
      let params: unknown[];
      
      // ── Deduplicar IDs para evitar empresas duplicadas en Excel ─────────────
      if (Array.isArray(ids) && ids.length > 0) {
        const uniqueIds = [...new Set(ids)]; // Elimina duplicados del array
        query = `SELECT DISTINCT ON (id) * FROM companies WHERE id = ANY($1::uuid[]) ORDER BY id, name`;
        params = [uniqueIds];
      } else {
        query = `SELECT * FROM companies ORDER BY name`;
        params = [];
      }
      const result = await pool.query(query, params);
      const rows = result.rows;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'CanTrack CRM';
      const ws = wb.addWorksheet('Companies');

      ws.columns = [
        { header: 'Company',  key: 'name',          width: 32 },
        { header: 'Address',  key: 'exact_address', width: 50 },
        { header: 'Industry', key: 'industry',      width: 22 },
      ];

      ws.getRow(1).eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      ws.getRow(1).height = 22;

      for (const r of rows) {
        ws.addRow({ name: r.name, exact_address: r.exact_address ?? '', industry: r.industry ?? '' });
      }

      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const bg = rowNum % 2 === 0 ? 'FFF0F4FA' : 'FFFFFFFF';
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.alignment = { vertical: 'middle', wrapText: false };
        });
      });

      ws.autoFilter = { from: 'A1', to: 'C1' };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="empresas-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('[Export Error]:', error);
      res.status(500).json({ error: 'Error al exportar Excel.' });
    }
  });

  // POST /api/companies/import — Importar empresas desde JSON validando duplicados
  router.post('/import', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { companies } = req.body;
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ error: 'Se requiere array de empresas en body: { companies: [...] }' });
      }

      const results = {
        total: companies.length,
        imported: 0,
        duplicates: [] as Array<{ name: string; reason: string }>,
        errors: [] as Array<{ name: string; error: string }>,
      };

      // Obtener slugs existentes para validación rápida
      const existingSlugs = await pool.query('SELECT slug FROM companies');
      const slugSet = new Set(existingSlugs.rows.map((r: any) => r.slug));

      for (const company of companies) {
        const { name, exact_address, industry } = company;
        
        // Validar que al menos tenga nombre
        if (!name || String(name).trim() === '') {
          results.errors.push({ name: '(sin nombre)', error: 'El nombre es requerido' });
          continue;
        }

        const companyName = String(name).trim();
        const slug = slugify(companyName);

        // ── Validar si ya existe ──────────────────────────────────────────────
        if (slugSet.has(slug)) {
          results.duplicates.push({ name: companyName, reason: 'Ya existe en la BD' });
          continue;
        }

        try {
          // Insertar nueva empresa
          await pool.query(
            `INSERT INTO companies (name, slug, exact_address, industry, enrichment_status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [companyName, slug, exact_address || null, industry || null],
          );
          
          slugSet.add(slug); // Prevenir duplicados en el mismo import
          results.imported++;
        } catch (dbErr: unknown) {
          const err = dbErr as { code?: string; message?: string };
          if (err.code === '23505') {
            results.duplicates.push({ name: companyName, reason: 'Duplicado detectado en BD (race condition)' });
          } else {
            results.errors.push({ name: companyName, error: err.message || 'Error desconocido' });
          }
        }
      }

      console.log(`[Import] ${results.imported} nuevas, ${results.duplicates.length} duplicadas, ${results.errors.length} errores`);
      return res.json({
        success: true,
        stats: results,
        message: `Importadas ${results.imported}/${results.total} empresas. ${results.duplicates.length} duplicadas, ${results.errors.length} con errores.`,
      });
    } catch (error) {
      console.error('[Import Error]:', error);
      res.status(500).json({ error: 'Error al importar empresas.' });
    }
  });

  // POST /api/companies/enrich — manual enrichment trigger
  router.post('/enrich', requireAuth, requireRole('admin', 'editor'), enrichLimiter, async (req: AuthRequest, res: Response) => {
    const { companyId, companyName } = req.body;
    if (!companyId || !companyName) return res.status(400).json({ error: 'companyId y companyName son requeridos.' });
    try {
      const existing = await pool.query(
        'SELECT industry, website, description, enrichment_status FROM companies WHERE id = $1',
        [companyId],
      );
      const row = existing.rows[0];
      if (row && (row.industry || row.website || row.description) && row.enrichment_status !== 'pending') {
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId],
        );
        return res.json({ success: true, source: 'db_matched', data: row });
      }

      const data = await EnrichmentService.enrichCompany(companyName);
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';
      const updatePayload: Record<string, unknown> = { enrichment_status: newStatus };
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
        [companyId, ...values],
      );
      return res.json({ success: true, source: data._provider ?? 'unknown', data });
    } catch (error) {
      console.error('[Gemini Enrich Error]:', error);
      return res.status(500).json({ error: 'Error en enriquecimiento.' });
    }
  });

  // POST /api/companies/:id/send-offer
  router.post('/:id/send-offer', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
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

      await pool.query(
        `INSERT INTO email_logs (company_id, sent_by, to_email, to_name, subject, employee_type_id, employee_type_name, mdirector_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [companyId, req.user!.id, toEmail, toName || null, subject, employeeTypeId, employeeTypeName, result.messageId || null],
      );

      console.log(`[mDirector] Oferta enviada → ${toEmail} | empresa: ${company.name} | perfil: ${employeeTypeName}`);
      return res.json({ success: true, messageId: result.messageId });
    } catch (error) {
      console.error('[Send Offer Error]:', error);
      return res.status(500).json({ error: 'Error interno al enviar la oferta.' });
    }
  });

  // GET /api/companies/:id/email-logs
  router.get('/:id/email-logs', requireAuth, async (req, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT el.*, u.first_name || ' ' || u.last_name AS sent_by_name
         FROM email_logs el LEFT JOIN users u ON el.sent_by = u.id
         WHERE el.company_id = $1 ORDER BY el.sent_at DESC LIMIT 50`,
        [req.params.id],
      );
      return res.json(result.rows);
    } catch (error) {
      console.error('[Email Logs Error]:', error);
      return res.status(500).json({ error: 'Error al obtener historial.' });
    }
  });

  return router;
}
