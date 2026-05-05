import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { AuthRequest, createRequireAuth, requireRole } from '../middleware/auth.middleware.js';
import { MDirectorService } from '../services/mdirector.service.js';
import {
  ONTARIO_LIST_ID,
  QUEBEC_LIST_ID,
  ONTARIO_SEGMENTS,
  QUEBEC_SEGMENTS,
} from '../data/mdirectorSegments.js';

type Region = 'ontario' | 'quebec';

function normalizeRegion(value: unknown): Region | null {
  const region = String(value ?? '').trim().toLowerCase();
  return region === 'ontario' || region === 'quebec' ? region : null;
}

function normalizeWork(value: unknown): string {
  return String(value ?? '').trim().toUpperCase() || 'GENERAL';
}

function regionConfig(region: Region) {
  return region === 'ontario'
    ? {
        table: 'ontario_companies',
        listId: ONTARIO_LIST_ID,
        segments: ONTARIO_SEGMENTS,
        language: 'fr' as const,
      }
    : {
        table: 'quebec_companies',
        listId: QUEBEC_LIST_ID,
        segments: QUEBEC_SEGMENTS,
        language: 'en' as const,
      };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCampaignRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // ---------------------------------------------------------------------------
  // GET /api/campaign/templates
  // Lista envíos existentes como referencia (no son Plantillas reales).
  // ---------------------------------------------------------------------------
  router.get('/templates', requireAuth, requireRole('admin', 'editor'), async (_req: AuthRequest, res: Response) => {
    try {
      const deliveries = await MDirectorService.getDeliveries();
      const raw = Array.isArray(deliveries.data?.data) ? deliveries.data.data : [];
      const templates = raw.map((delivery: any) => ({
        envId: String(delivery.envId ?? ''),
        campaignId: String(delivery.camId ?? ''),
        name: delivery.name || delivery.campaignName || `Delivery ${delivery.envId}`,
        subject: delivery.subject || '',
        language: delivery.language || '',
        status: delivery.status || '',
        deliveries: Number(delivery.deliveries ?? 0),
        creationDate: delivery.creationDate || null,
        deliveryDate: delivery.deliveryDate || null,
      }));

      return res.json({
        templates,
        total: templates.length,
        note: 'Para enviar con una carta/plantilla usa el templateId UUID desde mDirector > Plantillas (hash de la URL al editar).',
      });
    } catch (error: any) {
      console.error('[Campaign Templates Error]:', error);
      return res.status(500).json({ error: error.message || 'Error al obtener templates' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/campaign/template-map
  // Lista todos los mapeos region+work → templateId UUID.
  // ---------------------------------------------------------------------------
  router.get('/template-map', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const regionFilter = normalizeRegion(req.query.region);
    try {
      const params: unknown[] = [];
      let query = 'SELECT * FROM mdirector_template_map';
      if (regionFilter) {
        params.push(regionFilter);
        query += ` WHERE region = $${params.length}`;
      }
      query += ' ORDER BY region, work_label';
      const result = await pool.query(query, params);
      return res.json({ mappings: result.rows, total: result.rowCount });
    } catch (error: any) {
      console.error('[Template Map GET Error]:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/campaign/template-map
  // Registra o actualiza un mapeo region+work → templateId UUID.
  // Body: { region, work_label, template_id, template_name?, language? }
  // ---------------------------------------------------------------------------
  router.post('/template-map', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const region = normalizeRegion(req.body.region);
    const work_label = normalizeWork(req.body.work_label);
    const template_id = String(req.body.template_id ?? '').trim();
    const template_name = String(req.body.template_name ?? '').trim() || null;
    const language = String(req.body.language ?? '').trim() || (region === 'ontario' ? 'fr' : 'en');

    if (!region) return res.status(400).json({ error: 'region debe ser ontario o quebec' });
    if (!template_id || !UUID_RE.test(template_id)) {
      return res.status(400).json({
        error: 'template_id debe ser el UUID de una plantilla de mDirector',
        hint: 'Ábrela en mDirector > Plantillas > Editar y copia el UUID del hash de la URL. Ejemplo: 4243aa55-aaf1-3b7c-988c-a10fa856b11d',
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO mdirector_template_map (region, work_label, template_id, template_name, language)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (region, work_label) DO UPDATE
           SET template_id = EXCLUDED.template_id,
               template_name = EXCLUDED.template_name,
               language = EXCLUDED.language,
               active = TRUE,
               updated_at = NOW()
         RETURNING *`,
        [region, work_label, template_id, template_name, language],
      );
      return res.status(201).json({ mapping: result.rows[0] });
    } catch (error: any) {
      console.error('[Template Map POST Error]:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/campaign/template-map/:region/:work_label
  // Elimina un mapeo.
  // ---------------------------------------------------------------------------
  router.delete('/template-map/:region/:work_label', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const region = normalizeRegion(req.params.region);
    const work_label = normalizeWork(req.params.work_label);
    if (!region) return res.status(400).json({ error: 'region inválida' });

    try {
      const result = await pool.query(
        'DELETE FROM mdirector_template_map WHERE region = $1 AND work_label = $2 RETURNING id',
        [region, work_label],
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Mapeo no encontrado' });
      return res.json({ deleted: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/campaign/send-template
  //
  // Body:
  // {
  //   region: "ontario" | "quebec",
  //   work?: "GENERAL",                           // filtra por work; si tiene mapeo resuelve templateId automáticamente
  //   templateId?: "UUID",                        // opcional si ya está en mdirector_template_map
  //   subject?: "Asunto",
  //   scheduleDate?: "YYYY-MM-DD HH:mm:ss",
  //   limit?: 25
  // }
  // ---------------------------------------------------------------------------
  router.post('/send-template', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const region = normalizeRegion(req.body.region);
    let templateId = String(req.body.templateId ?? '').trim();
    const workFilter = req.body.work ? normalizeWork(req.body.work) : null;
    const limit = Number.isFinite(Number(req.body.limit)) && Number(req.body.limit) > 0
      ? Math.min(1000, Number(req.body.limit))
      : null;

    if (!region) {
      return res.status(400).json({ error: 'region es requerido (ontario o quebec)' });
    }

    const cfg = regionConfig(region);

    try {
      // Auto-resolver templateId desde mdirector_template_map si no fue provisto
      let resolvedTemplateName: string | null = null;
      let resolvedLanguage: string = cfg.language;

      if (!templateId) {
        const lookupWork = workFilter ?? 'GENERAL';
        const mapRow = await pool.query(
          `SELECT template_id, template_name, language FROM mdirector_template_map
           WHERE region = $1 AND work_label = $2 AND active = TRUE
           LIMIT 1`,
          [region, lookupWork],
        );
        if (mapRow.rowCount === 0) {
          return res.status(400).json({
            error: `No hay templateId registrado para ${region}/${lookupWork}. Regístralo con POST /api/campaign/template-map o pásalo directamente en el body.`,
          });
        }
        templateId = mapRow.rows[0].template_id;
        resolvedTemplateName = mapRow.rows[0].template_name;
        resolvedLanguage = mapRow.rows[0].language || cfg.language;
      }

      if (!UUID_RE.test(templateId)) {
        return res.status(400).json({
          error: 'templateId debe ser el UUID de una plantilla de mDirector, no el ID numérico de una campaña/envío.',
          hint: 'Copia el UUID desde mDirector > Plantillas > Editar (hash de la URL). Ejemplo: 4243aa55-aaf1-3b7c-988c-a10fa856b11d',
        });
      }

      const params: unknown[] = [];
      let query = `
        SELECT id, nombre, correo, work
        FROM ${cfg.table}
        WHERE correo IS NOT NULL
          AND correo <> ''
          AND correo LIKE '%@%'
          AND is_duplicate = FALSE
      `;

      if (workFilter) {
        params.push(workFilter);
        query += ` AND UPPER(TRIM(COALESCE(work, 'GENERAL'))) = $${params.length}`;
      }

      query += ' ORDER BY work, nombre';
      if (limit) {
        params.push(limit);
        query += ` LIMIT $${params.length}`;
      }

      const companiesResult = await pool.query(query, params);
      const companies = companiesResult.rows;
      if (companies.length === 0) {
        return res.status(400).json({ error: 'No hay empresas con email para esa región/filtro' });
      }

      const groups = new Map<string, typeof companies>();
      const skipped: Array<{ name: string; email: string; reason: string }> = [];

      for (const company of companies) {
        const work = normalizeWork(company.work);
        const segmentId = cfg.segments[work] ?? cfg.segments.GENERAL;
        if (!segmentId) {
          skipped.push({ name: company.nombre, email: company.correo, reason: `Sin segmento para ${work}` });
          continue;
        }
        const key = `${segmentId}|||${work}`;
        const group = groups.get(key) ?? [];
        group.push(company);
        groups.set(key, group);
      }

      const scheduleDate = req.body.scheduleDate || MDirectorService.scheduleDateInMinutes(2);
      const templateName = req.body.templateName || resolvedTemplateName || `Template ${templateId}`;

      const results: Array<{
        work: string;
        segmentId: string;
        contactCount: number;
        subscribed: number;
        campaignId?: string;
        envId?: string;
        status: 'success' | 'failed';
        errors: string[];
      }> = [];

      for (const [key, contacts] of groups) {
        const [segmentId, work] = key.split('|||');
        const errors: string[] = [];
        let subscribed = 0;

        for (const contact of contacts) {
          try {
            await MDirectorService.subscribeContact(contact.correo, contact.nombre, cfg.listId, segmentId);
            subscribed++;
          } catch (error: any) {
            errors.push(`${contact.correo}: ${error.message}`);
          }
        }

        try {
          const campaignName = `${region.toUpperCase()}_${work.replace(/\s+/g, '_').slice(0, 36)}_${Date.now()}`;
          const delivery = await MDirectorService.createDeliveryFromTemplate({
            name: campaignName,
            campaignName,
            templateId,
            subject: req.body.subject || templateName,
            segmentId,
            language: resolvedLanguage as 'fr' | 'en',
            scheduleDate,
          });

          results.push({
            work,
            segmentId,
            contactCount: contacts.length,
            subscribed,
            campaignId: delivery.campaignId,
            envId: delivery.envId,
            status: 'success',
            errors,
          });

          await pool.query(
            `INSERT INTO email_campaign_log
              (company_id, company_name, company_email, work_label, mdirector_campaign_id, mdirector_list_id, status, sent_by_user_id)
             SELECT id, nombre, correo, $1, $2, $3, 'scheduled', $4
             FROM ${cfg.table}
             WHERE id = ANY($5::uuid[])`,
            [work, delivery.campaignId, cfg.listId, req.user!.id, contacts.map(c => c.id)],
          ).catch((err) => {
            console.warn('[Campaign] No se pudo registrar email_campaign_log:', err.message);
          });
        } catch (error: any) {
          results.push({
            work,
            segmentId,
            contactCount: contacts.length,
            subscribed,
            status: 'failed',
            errors: [...errors, error.message],
          });
        }
      }

      const totalCampaigns = results.filter(r => r.status === 'success').length;
      const totalSubscribed = results.reduce((sum, r) => sum + r.subscribed, 0);

      return res.json({
        success: totalCampaigns > 0,
        region,
        language: resolvedLanguage,
        listId: cfg.listId,
        template: { id: templateId, name: templateName },
        scheduleDate,
        totalCompanies: companies.length,
        totalSubscribed,
        totalCampaigns,
        skipped,
        results,
      });
    } catch (error: any) {
      console.error('[Send Template Error]:', error);
      return res.status(500).json({ error: error.message || 'Error al enviar campaña' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/campaign/send-test
  // Envía a un solo correo de prueba.
  // ---------------------------------------------------------------------------
  router.post('/send-test', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const region = normalizeRegion(req.body.region) ?? 'ontario';
    let templateId = String(req.body.templateId ?? '').trim();
    const toEmail = String(req.body.toEmail ?? '').trim();
    const toName = String(req.body.toName ?? toEmail).trim();
    const work = normalizeWork(req.body.work);

    if (!toEmail.includes('@')) {
      return res.status(400).json({ error: 'toEmail válido es requerido' });
    }

    const cfg = regionConfig(region);

    // Auto-resolver templateId desde mdirector_template_map si no fue provisto
    let resolvedLanguage: string = cfg.language;
    if (!templateId) {
      const mapRow = await pool.query(
        `SELECT template_id, language FROM mdirector_template_map
         WHERE region = $1 AND work_label = $2 AND active = TRUE LIMIT 1`,
        [region, work],
      );
      if (mapRow.rowCount === 0) {
        return res.status(400).json({
          error: `No hay templateId registrado para ${region}/${work}. Pásalo en el body o regístralo con POST /api/campaign/template-map.`,
        });
      }
      templateId = mapRow.rows[0].template_id;
      resolvedLanguage = mapRow.rows[0].language || cfg.language;
    }

    if (!UUID_RE.test(templateId)) {
      return res.status(400).json({
        error: 'templateId debe ser el UUID de una plantilla de mDirector.',
        hint: 'Copia el UUID desde mDirector > Plantillas > Editar (hash de la URL).',
      });
    }

    const segmentId = cfg.segments[work] ?? cfg.segments.GENERAL;
    const scheduleDate = req.body.scheduleDate || MDirectorService.scheduleDateInMinutes(2);

    try {
      await MDirectorService.subscribeContact(toEmail, toName, cfg.listId, segmentId);
      const delivery = await MDirectorService.createDeliveryFromTemplate({
        name: `TEST_${region.toUpperCase()}_${work}_${Date.now()}`,
        campaignName: `TEST_${region.toUpperCase()}_${work}_${Date.now()}`,
        templateId,
        subject: req.body.subject || req.body.templateName || `Template ${templateId}`,
        segmentId,
        language: resolvedLanguage as 'fr' | 'en',
        scheduleDate,
      });

      return res.json({
        success: true,
        campaignId: delivery.campaignId,
        envId: delivery.envId,
        subId: delivery.subId,
        listId: cfg.listId,
        segmentId,
        scheduleDate,
        templateId,
      });
    } catch (error: any) {
      console.error('[Send Test Error]:', error);
      return res.status(500).json({ error: error.message || 'Error al enviar prueba' });
    }
  });

  return router;
}
