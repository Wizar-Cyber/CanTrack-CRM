import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { GoogleSheetsService } from '../services/google-sheets.service.js';
import { MDirectorService } from '../services/mdirector.service.js';
import { EmailCampaignService } from '../services/email-campaign.service.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import {
  REGION_FILTER, isRegionFilterActive, companyRegionClause,
} from '../utils/region-filter.js';
import {
  ONTARIO_LIST_ID, QUEBEC_LIST_ID, ONTARIO_SEGMENTS, QUEBEC_SEGMENTS,
} from '../data/mdirectorSegments.js';

/** Normaliza el campo TIPO del Sheet a enum del CRM */
function sheetTipo(raw: string): 'verde'|'naranja'|'morado'|'rojo'|null {
  const v = (raw || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (v.includes('verde')  || v === 'v') return 'verde';
  if (v.includes('naranja')|| v === 'n') return 'naranja';
  if (v.includes('morado') || v.includes('lila') || v === 'm') return 'morado';
  if (v.includes('rojo')   || v.includes('red')  || v === 'r') return 'rojo';
  return null;
}

export function createCampaignRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  /** GET /api/campaigns/config — lee la configuración actual */
  router.get('/api/campaigns/config', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const cfg = await EmailCampaignService.getConfig(pool);
      // No exponer las credenciales completas al frontend — solo indicar si están configuradas
      res.json({
        newCompanyDays:      cfg.newCompanyDays,
        resendIntervalDays:  cfg.resendIntervalDays,
        mdirectorConfigured: !!(cfg.mdirectorApiKey && cfg.mdirectorFromEmail),
        mdirectorFromEmail:  cfg.mdirectorFromEmail,
        mdirectorFromName:   cfg.mdirectorFromName,
        serviceTemplateMap:  cfg.serviceTemplateMap,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** PATCH /api/campaigns/config — actualiza la configuración */
  router.patch('/api/campaigns/config', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const {
        newCompanyDays, resendIntervalDays,
        mdirectorApiKey, mdirectorApiSecret, mdirectorFromEmail, mdirectorFromName,
        serviceTemplateMap,
      } = req.body;
      await EmailCampaignService.saveConfig(pool, {
        newCompanyDays, resendIntervalDays,
        mdirectorApiKey, mdirectorApiSecret, mdirectorFromEmail, mdirectorFromName,
        serviceTemplateMap,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaigns/preview — vista previa sin enviar */
  router.get('/api/campaigns/preview', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const preview = await EmailCampaignService.buildPreviewFromSheet(pool);
      res.json(preview);
    } catch (err: any) {
      console.error('[Campaign Preview]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/campaigns/send — lanza la campaña con los contactos del preview */
  router.post('/api/campaigns/send', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const { contacts } = req.body;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Envía contacts[] del preview antes de disparar.' });
      }
      const result = await EmailCampaignService.sendCampaign(pool, contacts, req.user!.id);
      res.json(result);
    } catch (err: any) {
      console.error('[Campaign Send]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaigns/history — historial de envíos */
  router.get('/api/campaigns/history', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
      const history = await EmailCampaignService.getHistory(pool, limit);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaigns/sheet-companies — empresas del Google Sheet con estado de campaña */
  router.get('/api/campaigns/sheet-companies', requireAuth, async (_req, res) => {
    try {
      // Si Google Sheets no está configurado o falla, devolvemos array vacío
      // en lugar de 500 para no romper la carga inicial del CRM.
      let rows: Awaited<ReturnType<typeof GoogleSheetsService.readRows>> = [];
      try {
        await GoogleSheetsService.init();
        rows = await GoogleSheetsService.readRows();
      } catch (sheetsErr: any) {
        console.warn('[sheet-companies] Google Sheets no disponible:', sheetsErr.message);
        return res.json({ total: 0, companies: [], sheetsError: sheetsErr.message });
      }
      // Cruzar con DB para obtener email y fechas
      const names = rows.map(r => r.empresa);
      const dbRes = await pool.query(`
        SELECT id, name, contact_email, phone, website, industry, company_size,
               hq_city, hq_province, hq_region, hq_town, hq_country, exact_address,
               description, known_ats_portal,
               sheets_exported_at, last_campaign_sent_at, enrichment_status,
               tipo, tipo_updated_at
        FROM companies WHERE name = ANY($1::text[])
      `, [names]);
      const dbMap = new Map(dbRes.rows.map(r => [r.name, r]));

      const result = rows.map(row => {
        const db = dbMap.get(row.empresa);
        return {
          companyId:        db?.id                  || null,
          empresa:          row.empresa,
          // Contacto — Sheet tiene datos directos
          email:            row.correo              || db?.contact_email || null,
          hasEmail:         !!(row.correo || db?.contact_email),
          phone:            row.telefono            || db?.phone         || null,
          // Dirección — Sheet tiene columnas separadas
          direccion:        row.direccion,
          exactAddress:     row.direccion           || db?.exact_address || null,
          provincia:        row.provincia,
          region:           row.region,
          ciudad:           row.ciudad,
          pueblo:           row.pueblo,
          hqCity:           row.ciudad              || db?.hq_city       || null,
          hqProvince:       row.provincia           || db?.hq_province   || null,
          hqRegion:         row.region              || db?.hq_region     || null,
          hqTown:           row.pueblo              || db?.hq_town       || null,
          hqCountry:        'Canada',
          // Servicio y descripción
          work:             row.work,
          descripcion:      row.descripcion         || db?.description   || null,
          dominio:          row.dominio             || db?.website       || null,
          // Enriquecimiento adicional de DB
          industry:         db?.industry            || null,
          companySize:      db?.company_size        || null,
          website:          row.dominio             || db?.website       || null,
          description:      row.descripcion         || db?.description   || null,
          knownAtsPortal:   row.work                || db?.known_ats_portal || null,
          // Fechas
          addedToSheetAt:   row.fecha               || db?.sheets_exported_at  || null,
          lastCampaignAt:   db?.last_campaign_sent_at || null,
          enrichmentStatus: db?.enrichment_status   || 'unknown',
          // Tipo: DB tiene prioridad; si no hay, usar el color detectado del Sheet
          tipo:             db?.tipo                || row.tipo          || null,
          tipoUpdatedAt:    db?.tipo_updated_at     || null,
        };
      });
      res.json({ total: result.length, companies: result });
    } catch (err: any) {
      console.error('[Sheet Companies]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/mdirector/status — MDirector credentials configured? */
  router.get('/api/mdirector/status', requireAuth, (_req, res) => {
    res.json({ configured: MDirectorService.isConfigured() });
  });

  /** GET /api/mdirector/lists — fetch all MDirector lists */
  router.get('/api/mdirector/lists', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const data = await MDirectorService.getLists();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaign/preview/:source — preview companies that will receive campaign */
  router.get('/api/campaign/preview/:source', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    const { source } = req.params as { source: string };
    if (source !== 'ontario' && source !== 'quebec') {
      return res.status(400).json({ error: "source must be 'ontario' or 'quebec'" });
    }
    try {
      const table      = source === 'ontario' ? 'ontario_companies' : 'quebec_companies';
      const segMap     = source === 'ontario' ? ONTARIO_SEGMENTS   : QUEBEC_SEGMENTS;
      const listId     = source === 'ontario' ? ONTARIO_LIST_ID    : QUEBEC_LIST_ID;

      const rows = await pool.query(
        `SELECT id, nombre, correo AS email, work, ciudad, provincia, last_campaign_at
         FROM ${table}
         WHERE correo IS NOT NULL AND correo LIKE '%@%'
         ORDER BY work, nombre`
      );

      const toSend: any[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];
      const byWork: Record<string, number> = {};

      for (const row of rows.rows) {
        const work    = (row.work || '').toUpperCase().trim() || 'GENERAL';
        const segId   = segMap[work] ?? segMap['GENERAL'] ?? null;
        if (!segId) {
          skipped.push({ name: row.nombre, reason: `No segment for work: "${work}"` });
          continue;
        }
        toSend.push({ id: row.id, nombre: row.nombre, email: row.email, work, segmentId: segId, listId, ciudad: row.ciudad, provincia: row.provincia, lastCampaignAt: row.last_campaign_at });
        byWork[work] = (byWork[work] || 0) + 1;
      }

      res.json({ success: true, source, listId, toSend, skipped, byWork, total: toSend.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/campaign/send/:source — subscribe contacts & launch campaigns per segment */
  router.post('/api/campaign/send/:source', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { source } = req.params as { source: string };
    if (source !== 'ontario' && source !== 'quebec') {
      return res.status(400).json({ error: "source must be 'ontario' or 'quebec'" });
    }

    const { subject, scheduleDate, contactIds } = req.body as {
      subject?: string;
      scheduleDate?: string;
      contactIds?: string[];
    };

    const table    = source === 'ontario' ? 'ontario_companies' : 'quebec_companies';
    const segMap   = source === 'ontario' ? ONTARIO_SEGMENTS   : QUEBEC_SEGMENTS;
    const listId   = source === 'ontario' ? ONTARIO_LIST_ID    : QUEBEC_LIST_ID;
    const lang     = source === 'ontario' ? 'fr' : 'en'; // Ontario→French, Quebec→English

    try {
      // Build query
      let query = `SELECT id, nombre, correo AS email, work FROM ${table} WHERE correo IS NOT NULL AND correo LIKE '%@%'`;
      const params: any[] = [];
      if (Array.isArray(contactIds) && contactIds.length > 0) {
        params.push(contactIds);
        query += ` AND id = ANY($1::uuid[])`;
      }
      query += ` ORDER BY work, nombre`;

      const rows = await pool.query(query, params);

      // Group by segment
      const bySegment = new Map<string, Array<{ id: string; nombre: string; email: string; work: string }>>();
      const noSegment: string[] = [];

      for (const row of rows.rows) {
        const work  = (row.work || '').toUpperCase().trim() || 'GENERAL';
        const segId = segMap[work] ?? segMap['GENERAL'] ?? '';
        if (!segId) { noSegment.push(row.nombre); continue; }
        const key = `${segId}|||${work}`;
        const arr = bySegment.get(key) || [];
        arr.push(row);
        bySegment.set(key, arr);
      }

      const results: Array<{
        work: string; segmentId: string; campaignId: string; subscribed: number; errors: string[];
      }> = [];

      for (const [key, contacts] of bySegment) {
        const [segId, work] = key.split('|||');
        const errors: string[] = [];
        let subscribed = 0;

        // Subscribe each contact to list+segment
        for (const c of contacts) {
          try {
            await MDirectorService.subscribeContact(c.email, c.nombre, listId, segId);
            subscribed++;
          } catch (e: any) {
            errors.push(`${c.nombre}: ${e.message}`);
          }
        }

        if (subscribed === 0) {
          results.push({ work, segmentId: segId, campaignId: '', subscribed: 0, errors });
          continue;
        }

        // Fetch HTML template from service_templates table or fall back to built-in
        const tmplKey = work.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const tmplRes = await pool.query(
          `SELECT content FROM service_templates WHERE service_type_id = $1 LIMIT 1`, [tmplKey]
        );
        const html = tmplRes.rows[0]?.content || MDirectorService.buildOfferEmailHtml({
          companyName:              '{{NOMBRE}}',
          employeeTypeName:         work,
          employeeTypeDescription:  work,
          senderName:               process.env.MDIRECTOR_FROM_NAME || 'VSM Services',
        });

        const campSubject = subject || (lang === 'fr'
          ? `Services de personnel — ${work}`
          : `Staffing services — ${work}`);
        const campName = `${source.toUpperCase()}_${work}_${new Date().toISOString().slice(0, 10)}`;

        try {
          const campaignId = await MDirectorService.createCampaign({
            name: campName, listId, segmentId: segId,
            subject: campSubject, html, scheduleDate,
          });
          results.push({ work, segmentId: segId, campaignId, subscribed, errors });

          // Mark last_campaign_at
          const ids = contacts.map(c => c.id);
          await pool.query(
            `UPDATE ${table} SET last_campaign_at = NOW() WHERE id = ANY($1::uuid[])`, [ids]
          );
        } catch (e: any) {
          results.push({ work, segmentId: segId, campaignId: '', subscribed, errors: [...errors, e.message] });
        }
      }

      const totalSubscribed = results.reduce((s, r) => s + r.subscribed, 0);
      const totalCampaigns  = results.filter(r => r.campaignId).length;

      res.json({ success: true, source, totalSubscribed, totalCampaigns, results, noSegment });
    } catch (err: any) {
      console.error('[Campaign MDirector]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
