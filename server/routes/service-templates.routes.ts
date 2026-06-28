import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import { GeminiService } from '../services/gemini.service.js';

export function createServiceTemplatesRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  /** GET /api/service-templates — lista todas las plantillas */
  router.get('/api/service-templates', requireAuth, async (_req, res) => {
    const r = await pool.query(`SELECT * FROM service_templates ORDER BY service_type_id`);
    return res.json({ success: true, data: r.rows });
  });

  /** GET /api/service-templates/:serviceId — obtiene plantilla de un servicio */
  router.get('/api/service-templates/:serviceId', requireAuth, async (req, res) => {
    const r = await pool.query(`SELECT * FROM service_templates WHERE service_type_id = $1`, [req.params.serviceId]);
    if (r.rows.length === 0) return res.json({ success: true, data: null });
    return res.json({ success: true, data: r.rows[0] });
  });

  /** POST /api/service-templates/:serviceId — crea o actualiza la plantilla de un servicio */
  router.post('/api/service-templates/:serviceId', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { name, content, variables } = req.body;
    if (!content) return res.status(400).json({ error: 'content requerido' });
    const r = await pool.query(`
      INSERT INTO service_templates (service_type_id, name, content, variables, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (service_type_id) DO UPDATE SET
        name = EXCLUDED.name,
        content = EXCLUDED.content,
        variables = EXCLUDED.variables,
        updated_at = NOW()
      RETURNING *
    `, [serviceId, name || '', content, JSON.stringify(variables || [])]);
    return res.json({ success: true, data: r.rows[0] });
  });

  /** DELETE /api/service-templates/:serviceId */
  router.delete('/api/service-templates/:serviceId', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    await pool.query(`DELETE FROM service_templates WHERE service_type_id = $1`, [req.params.serviceId]);
    return res.json({ success: true });
  });

  /** POST /api/service-templates/:serviceId/fill — rellena plantilla con datos de empresa */
  router.post('/api/service-templates/:serviceId/fill', requireAuth, async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { companyId } = req.body;

    const tmplRes = await pool.query(`SELECT * FROM service_templates WHERE service_type_id = $1`, [serviceId]);
    if (tmplRes.rows.length === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const tmpl = tmplRes.rows[0];
    let filled = tmpl.content;

    if (companyId) {
      const coRes = await pool.query(`
        SELECT c.*, COALESCE(c.name,'') as company_name
        FROM companies c WHERE c.id = $1
      `, [companyId]);
      if (coRes.rows.length > 0) {
        const co = coRes.rows[0];
        const today = new Date().toLocaleDateString('en-CA', { dateStyle: 'long' });
        filled = filled
          .replace(/\{\{company_name\}\}/gi, co.name || '')
          .replace(/\{\{contact_email\}\}/gi, co.contact_email || '')
          .replace(/\{\{phone\}\}/gi, co.phone || '')
          .replace(/\{\{city\}\}/gi, co.hq_city || '')
          .replace(/\{\{province\}\}/gi, co.hq_province || '')
          .replace(/\{\{address\}\}/gi, co.exact_address || '')
          .replace(/\{\{industry\}\}/gi, co.industry || '')
          .replace(/\{\{website\}\}/gi, co.website || '')
          .replace(/\{\{date\}\}/gi, today);
      }
    }

    return res.json({ success: true, filled, template: tmpl });
  });

  /** POST /api/service-templates/:serviceId/ai-improve — IA mejora la carta para una empresa */
  router.post('/api/service-templates/:serviceId/ai-improve', requireAuth, async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { filledContent, companyId, language } = req.body;

    if (!filledContent) return res.status(400).json({ error: 'filledContent requerido' });

    let companyContext = '';
    if (companyId) {
      const coRes = await pool.query(`SELECT name, industry, description, hq_city, hq_province FROM companies WHERE id = $1`, [companyId]);
      if (coRes.rows.length > 0) {
        const co = coRes.rows[0];
        companyContext = `\nCompany context: ${co.name}, industry: ${co.industry || 'unknown'}, city: ${co.hq_city || 'unknown'}, description: ${co.description || 'N/A'}`;
      }
    }

    const prompt = `You are an expert B2B sales email copywriter. Review this staffing offer email and provide:
1. An improved version of the email (more persuasive, professional, concise)
2. 3 specific improvement suggestions

${companyContext}

Original email:
---
${filledContent}
---

Respond in ${language || 'English'} with JSON format:
{
  "improved": "...full improved email text...",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}`;

    try {
      const aiText = await GeminiService.generateText(prompt);
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ success: true, improved: aiText, suggestions: [] });
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({ success: true, ...parsed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
