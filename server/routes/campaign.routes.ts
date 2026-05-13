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

      // Min-gap: don't re-email a company too soon (from config or body override)
      const autoCfgRow = await pool.query(
        `SELECT auto_min_gap_days FROM campaign_config LIMIT 1`,
      );
      const minGapDays: number = Number(req.body.minGapDays)
        || autoCfgRow.rows[0]?.auto_min_gap_days
        || 60;

      const params: unknown[] = [];
      let query = `
        SELECT id, nombre, correo, work
        FROM ${cfg.table}
        WHERE correo IS NOT NULL
          AND correo <> ''
          AND correo ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
          AND LENGTH(correo) BETWEEN 6 AND 254
          AND is_duplicate = FALSE
          AND LOWER(correo) NOT LIKE 'noreply@%'
          AND LOWER(correo) NOT LIKE 'no-reply@%'
          AND LOWER(correo) NOT LIKE 'donotreply@%'
          AND LOWER(correo) NOT LIKE 'postmaster@%'
          AND LOWER(correo) NOT LIKE 'mailer-daemon@%'
          AND LOWER(correo) NOT LIKE 'abuse@%'
          AND COALESCE(LOWER(status), '') NOT IN ('closed','cerrada','inactive','inactiva','bloqueado','no contactar','desactivo')
          AND COALESCE(email_status, 'unknown') NOT IN ('bounced','invalid','unsubscribed','blocked')
          AND LOWER(correo) NOT IN (SELECT LOWER(email) FROM email_suppression WHERE email IS NOT NULL)
          AND SPLIT_PART(LOWER(correo), '@', 2) NOT IN (SELECT LOWER(domain) FROM email_suppression WHERE domain IS NOT NULL)
          AND (last_campaign_at IS NULL OR last_campaign_at < NOW() - ($${params.length + 1} || ' days')::INTERVAL)
      `;
      params.push(minGapDays);

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
        return res.status(400).json({
          error: `No hay empresas elegibles. Todas fueron contactadas en los últimos ${minGapDays} días.`,
        });
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
            // Mark permanently invalid emails so they are excluded from future sends
            const msg = (error.message || '').toLowerCase();
            const isPermanent = msg.includes('invalid') || msg.includes('bounce') ||
              msg.includes('bad') || msg.includes('rejected') || msg.includes('does not exist');
            if (isPermanent) {
              pool.query(
                `UPDATE ${cfg.table}
                 SET email_status = 'bounced', email_bounce_count = COALESCE(email_bounce_count,0)+1,
                     email_blocked_at = NOW()
                 WHERE id = $1`,
                [contact.id],
              ).catch(() => {});
              pool.query(
                `INSERT INTO email_suppression (email, reason, source, notes)
                 VALUES (LOWER($1), 'bounce', 'mdirector', $2)
                 ON CONFLICT DO NOTHING`,
                [contact.correo, error.message.slice(0, 200)],
              ).catch(() => {});
            }
          }
        }

        try {
          const sendDate = new Date(scheduleDate);
          const dd = String(sendDate.getDate()).padStart(2, '0');
          const mm = String(sendDate.getMonth() + 1).padStart(2, '0');
          const yyyy = sendDate.getFullYear();
          const campaignName = `${work} ${region.toUpperCase()} ${dd}/${mm}/${yyyy}`;

          const delivery = await MDirectorService.createDeliveryFromTemplate({
            name: campaignName,
            campaignName,
            templateId,
            subject: req.body.subject || campaignName,
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

          const ids = contacts.map(c => c.id);
          await Promise.all([
            pool.query(
              `INSERT INTO email_campaign_log
                (company_id, company_name, company_email, work_label, mdirector_campaign_id, mdirector_list_id, status, sent_by_user_id)
               SELECT id, nombre, correo, $1, $2, $3, 'scheduled', $4
               FROM ${cfg.table}
               WHERE id = ANY($5::uuid[])`,
              [work, delivery.campaignId, cfg.listId, req.user!.id, ids],
            ),
            pool.query(
              `UPDATE ${cfg.table} SET last_campaign_at = NOW() WHERE id = ANY($1::uuid[])`,
              [ids],
            ),
          ]).catch((err) => {
            console.warn('[Campaign] Error registrando log/last_campaign_at:', err.message);
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

  // ---------------------------------------------------------------------------
  // POST /api/campaign/webhook/bounce  — MDirector notifica un bounce/unsubscribe
  // No requiere auth (MDirector llama desde fuera). Validar con ?secret=XXX.
  // ---------------------------------------------------------------------------
  router.post('/webhook/bounce', async (req, res) => {
    const secret = process.env.CAMPAIGN_WEBHOOK_SECRET || '';
    if (secret && req.query.secret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      // MDirector puede enviar distintos formatos; capturamos los campos más comunes
      const email  = String(req.body.email || req.body.correo || '').toLowerCase().trim();
      const type   = String(req.body.type  || req.body.reason || 'bounce').toLowerCase();
      if (!email || !email.includes('@')) return res.json({ ok: false, reason: 'no email' });

      const reason = type.includes('unsub') ? 'unsubscribed'
                   : type.includes('complaint') || type.includes('spam') ? 'spam_complaint'
                   : 'bounce';

      const emailStatus = reason === 'unsubscribed' ? 'unsubscribed' : 'bounced';

      await Promise.all([
        // Insert into suppression list
        pool.query(
          `INSERT INTO email_suppression (email, reason, source, notes)
           VALUES ($1, $2, 'mdirector_webhook', $3) ON CONFLICT DO NOTHING`,
          [email, reason, JSON.stringify(req.body).slice(0, 300)],
        ),
        // Update in ontario_companies
        pool.query(
          `UPDATE ontario_companies
           SET email_status=$1, email_bounce_count=COALESCE(email_bounce_count,0)+1, email_blocked_at=NOW()
           WHERE LOWER(correo)=$2`,
          [emailStatus, email],
        ),
        // Update in quebec_companies
        pool.query(
          `UPDATE quebec_companies
           SET email_status=$1, email_bounce_count=COALESCE(email_bounce_count,0)+1, email_blocked_at=NOW()
           WHERE LOWER(correo)=$2`,
          [emailStatus, email],
        ),
      ]);

      console.log(`[BounceWebhook] ${email} → ${reason}`);
      return res.json({ ok: true, email, reason });
    } catch (err: any) {
      console.error('[BounceWebhook] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/campaign/suppression — lista de supresión
  router.get('/suppression', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, email, domain, reason, source, notes, created_at
         FROM email_suppression ORDER BY created_at DESC LIMIT 500`,
      );
      const stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM email_suppression)                                    AS total,
          (SELECT COUNT(*) FROM email_suppression WHERE reason='bounce')              AS bounces,
          (SELECT COUNT(*) FROM email_suppression WHERE reason='unsubscribed')        AS unsubscribes,
          (SELECT COUNT(*) FROM email_suppression WHERE reason='spam_complaint')      AS spam,
          (SELECT COUNT(*) FROM email_suppression WHERE reason='manual')              AS manual,
          (SELECT COUNT(*) FROM ontario_companies WHERE email_status IN ('bounced','invalid','unsubscribed','blocked')) AS blocked_ontario,
          (SELECT COUNT(*) FROM quebec_companies  WHERE email_status IN ('bounced','invalid','unsubscribed','blocked')) AS blocked_quebec
      `);
      return res.json({ list: r.rows, stats: stats.rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/campaign/suppression — agregar manualmente
  router.post('/suppression', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const email  = String(req.body.email  || '').toLowerCase().trim() || null;
    const domain = String(req.body.domain || '').toLowerCase().trim() || null;
    const reason = String(req.body.reason || 'manual').toLowerCase();
    if (!email && !domain) return res.status(400).json({ error: 'email o domain requerido' });
    try {
      await pool.query(
        `INSERT INTO email_suppression (email, domain, reason, source, notes)
         VALUES ($1, $2, $3, 'manual', $4) ON CONFLICT DO NOTHING`,
        [email, domain, reason, req.body.notes || null],
      );
      if (email) {
        for (const tbl of ['ontario_companies', 'quebec_companies']) {
          await pool.query(
            `UPDATE ${tbl} SET email_status='blocked', email_blocked_at=NOW() WHERE LOWER(correo)=$1`,
            [email],
          );
        }
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/campaign/suppression/:id — quitar de la lista
  router.delete('/suppression/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    try {
      const r = await pool.query(
        `DELETE FROM email_suppression WHERE id=$1 RETURNING email, domain`, [req.params.id],
      );
      const row = r.rows[0];
      if (row?.email) {
        for (const tbl of ['ontario_companies', 'quebec_companies']) {
          await pool.query(
            `UPDATE ${tbl} SET email_status='unknown', email_blocked_at=NULL WHERE LOWER(correo)=$1 AND email_status='blocked'`,
            [row.email],
          );
        }
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/campaign/auto-config
  router.get('/auto-config', requireAuth, requireRole('admin', 'editor'), async (_req: AuthRequest, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT auto_enabled, auto_ontario, auto_quebec,
                auto_new_days, auto_resend_days, auto_min_gap_days,
                auto_schedule_hour, auto_last_run_at
         FROM campaign_config LIMIT 1`,
      );
      return res.json(r.rows[0] ?? {});
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/campaign/auto-config
  router.patch('/auto-config', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const allowed = ['auto_enabled','auto_ontario','auto_quebec','auto_new_days','auto_resend_days','auto_min_gap_days','auto_schedule_hour'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        vals.push(req.body[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sin campos a actualizar' });
    vals.push('00000000-0000-0000-0000-000000000001');
    try {
      await pool.query(
        `UPDATE campaign_config SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`,
        vals,
      );
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/campaign/auto-run  (disparo manual de la automatización)
  router.post('/auto-run', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    try {
      const { runCampaignAutomation } = await import('../services/campaign-automation.service.js') as any;
      const result = await runCampaignAutomation(pool, { forcedBy: req.user!.id });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/campaign/history
  router.get('/history', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(500, parseInt(req.query.limit as string) || 200);
      const result = await pool.query(`
        SELECT ecl.id, ecl.company_name, ecl.company_email, ecl.work_label,
               ecl.mdirector_campaign_id, ecl.mdirector_list_id,
               ecl.status, ecl.sent_at,
               u.first_name || ' ' || u.last_name AS sent_by_name
        FROM email_campaign_log ecl
        LEFT JOIN users u ON u.id = ecl.sent_by_user_id
        ORDER BY ecl.sent_at DESC
        LIMIT $1
      `, [limit]);
      return res.json(result.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/campaign/distinct-work — distinct work types for filter
  router.get('/distinct-work', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const region = normalizeRegion(req.query.region);
      if (!region) return res.status(400).json({ error: 'Invalid region.' });
      const { table } = regionConfig(region);
      const result = await pool.query(
        `SELECT DISTINCT work FROM ${table} WHERE work IS NOT NULL AND work != '' AND is_duplicate = FALSE ORDER BY work`
      );
      return res.json(result.rows.map(r => r.work));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/campaign/distinct-city — distinct cities for filter
  router.get('/distinct-city', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const region = normalizeRegion(req.query.region);
      if (!region) return res.status(400).json({ error: 'Invalid region.' });
      const { table } = regionConfig(region);
      const result = await pool.query(
        `SELECT DISTINCT ciudad FROM ${table} WHERE ciudad IS NOT NULL AND ciudad != '' AND is_duplicate = FALSE ORDER BY ciudad`
      );
      return res.json(result.rows.map(r => r.ciudad));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/campaign/preview — preview recipients count
  router.post('/preview', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const region = normalizeRegion(req.body.region);
      if (!region) return res.status(400).json({ error: 'Invalid region.' });
      const { table } = regionConfig(region);
      const work = String(req.body.work || '').trim().toUpperCase();
      const city = String(req.body.city || '').trim();
      const minGapDays = parseInt(String(req.body.minGapDays || '60'), 10);

      const conditions: string[] = [
        `is_duplicate = FALSE`,
        `correo IS NOT NULL AND correo != ''`,
        `LOWER(correo) NOT LIKE 'noreply@%' AND LOWER(correo) NOT LIKE 'no-reply@%'`,
        `LOWER(correo) NOT LIKE 'donotreply@%' AND LOWER(correo) NOT LIKE 'postmaster@%'`,
        `LOWER(correo) NOT LIKE 'mailer-daemon@%'`,
      ];

      if (work) conditions.push(`work = '${work.replace(/'/g, "''")}'`);
      if (city) conditions.push(`ciudad ILIKE '%${city.replace(/'/g, "''")}%'`);

      const where = conditions.join(' AND ');

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM ${table} WHERE ${where}`
      );

      const sampleResult = await pool.query(
        `SELECT correo FROM ${table} WHERE ${where} ORDER BY created_at DESC LIMIT 10`
      );

      return res.json({
        total: parseInt(countResult.rows[0].count, 10),
        emails: sampleResult.rows.map(r => r.correo),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
