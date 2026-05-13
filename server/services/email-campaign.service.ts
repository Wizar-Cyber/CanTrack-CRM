/**
 * EmailCampaignService
 *
 * Orchestrates the full email campaign flow for Ontario and Quebec companies:
 *   1. Load companies from ontario_companies / quebec_companies DB table
 *   2. Group by `work` field
 *   3. Map each work label → MDirector list + segment
 *   4. Filter out recently-sent companies (check email_campaign_log)
 *   5. Preview: return grouped companies with segment mapping
 *   6. Send:
 *      a. subscribeContact per company
 *      b. Create one campaign per work-type group
 *      c. Log results to email_campaign_log
 */

import pg from 'pg';
import { GoogleSheetsService, ActonValeRow } from './google-sheets.service.js';
import { MDirectorService } from './mdirector.service.js';
import {
  QUEBEC_LIST_ID,
  ONTARIO_LIST_ID,
  QUEBEC_SEGMENTS,
  ONTARIO_SEGMENTS,
} from '../data/mdirectorSegments.js';

// ── Province source ───────────────────────────────────────────────────────────

export type ProvinceSource = 'quebec' | 'ontario';

// ── Service labels (for legacy Google Sheets flow) ────────────────────────────

export const SERVICE_LABELS: string[] = [
  'EMPACADORES',
  'OPERADORES DE MONTEACARGA',
  'CONDUCTORES DE VEHICULOS DE CARGA',
  'RECEPCIONISTA',
  'ELECTRICISTA',
  'MESEROS',
  'CARGA Y DESCARGA',
  'RECOLECTORES DE FRUTAS Y VEGETALES',
  'TRABAJADORES DE INVERNADEROS',
  'OPERARIO AGRICOLA',
  'PERSONAL DE SEGURIDAD',
  'EMPLEADA DOMESTICA',
  'REPARADORES DE REFRIGERADORAS',
  'MECANICO FORK LIFT',
  'TECNICO EN REPARACION DE ELEVADORES',
  'BARTENDERS',
  'CARNICERIA',
  'ALMACEN',
  'CARROCERIA',
  'EBANISTA',
  'TIENDA DE COMESTIBLES',
  'SUPERMERCADO',
  'SOLDADOR',
  'RESTAURANTE',
  'REMOCION DE NIEVE',
  'PLOMERO',
  'PINTOR',
  'PANADERIA',
  'PAISAJISMO',
  'OPERARIO DE PRODUCCION',
  'OPERARIO DE MAQUINARIA',
  'MUDANZAS',
  'MECANICO',
  'MANTENIMIENTO',
  'LAVANDERIA',
  'HOTEL',
  'EXCAVACION',
  'CONSTRUCCION',
  'DISEÑADOR DE INTERIORES',
  'DOMICILIARIO',
  'MECANICO INDUSTRIAL',
  'OPERADOR LASER',
  'LIMPIEZA INDUSTRIAL',
  'LIMPIEZA',
  'MUCAMA',
  'AGRICULTOR',
  'MATADERO',
  'ASISTENTE DE COCINA',
  'CHEF',
  'PIZZERO',
  'GENERAL',
  'CARPINTERO',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampaignConfig {
  newCompanyDays:      number;
  resendIntervalDays:  number;
  mdirectorApiKey:     string;
  mdirectorApiSecret:  string;
  mdirectorFromEmail:  string;
  mdirectorFromName:   string;
  mdirectorUsername:   string;
  mdirectorPassword:   string;
  mdirectorReplyTo:    string;
  quebecListId:        string;
  ontarioListId:       string;
  /** Legacy map: WORK_LABEL → mdirector_template_id */
  serviceTemplateMap:  Record<string, string>;
}

export interface CampaignContact {
  companyId:      string | null;
  companyName:    string;
  email:          string;
  work:           string;
  listId:         string;
  segmentId:      string | null;
  direccion:      string;
  isNew:          boolean;
  lastSentAt:     Date | null;
  tipo:           string | null;
  source:         ProvinceSource;
  language:       'fr' | 'en';
  // Legacy fields kept for backward compat
  templateId?:    string | null;
  addedToSheetAt?: Date | null;
}

export interface CampaignPreview {
  toSend:         CampaignContact[];
  skipped:        Array<{ name: string; reason: string }>;
  byWork:         Record<string, number>;
  totalNew:       number;
  totalOld:       number;
  source:         ProvinceSource;
}

export interface CampaignSendResult {
  sent:    number;
  failed:  number;
  skipped: number;
  details: Array<{ name: string; email: string; status: 'sent' | 'failed' | 'skipped'; error?: string }>;
}

// ── Service class ─────────────────────────────────────────────────────────────

export class EmailCampaignService {

  // ── Config ────────────────────────────────────────────────────────────────

  static async getConfig(pool: pg.Pool): Promise<CampaignConfig> {
    const res = await pool.query(`
      SELECT new_company_days, resend_interval_days,
             mdirector_api_key, mdirector_api_secret,
             mdirector_from_email, mdirector_from_name,
             mdirector_username, mdirector_password, mdirector_reply_to,
             quebec_list_id, ontario_list_id,
             service_template_map
      FROM campaign_config LIMIT 1
    `);
    const row = res.rows[0] ?? {};
    return {
      newCompanyDays:      row.new_company_days     ?? 15,
      resendIntervalDays:  row.resend_interval_days ?? 90,
      mdirectorApiKey:     row.mdirector_api_key    || process.env.MDIRECTOR_API_KEY    || '',
      mdirectorApiSecret:  row.mdirector_api_secret || process.env.MDIRECTOR_API_SECRET || '',
      mdirectorFromEmail:  row.mdirector_from_email || process.env.MDIRECTOR_FROM_EMAIL || '',
      mdirectorFromName:   row.mdirector_from_name  || process.env.MDIRECTOR_FROM_NAME  || 'VSM Services',
      mdirectorUsername:   row.mdirector_username   || process.env.MDIRECTOR_USERNAME   || '107843',
      mdirectorPassword:   row.mdirector_password   || process.env.MDIRECTOR_PASSWORD   || '',
      mdirectorReplyTo:    row.mdirector_reply_to   || process.env.MDIRECTOR_REPLY_TO   || '',
      quebecListId:        row.quebec_list_id        || QUEBEC_LIST_ID,
      ontarioListId:       row.ontario_list_id       || ONTARIO_LIST_ID,
      serviceTemplateMap:  row.service_template_map  ?? {},
    };
  }

  static async saveConfig(pool: pg.Pool, cfg: Partial<CampaignConfig>): Promise<void> {
    const fields: string[] = [];
    const values: any[]   = [];
    let i = 1;
    if (cfg.newCompanyDays     !== undefined) { fields.push(`new_company_days=$${i++}`);       values.push(cfg.newCompanyDays); }
    if (cfg.resendIntervalDays !== undefined) { fields.push(`resend_interval_days=$${i++}`);   values.push(cfg.resendIntervalDays); }
    if (cfg.mdirectorApiKey    !== undefined) { fields.push(`mdirector_api_key=$${i++}`);      values.push(cfg.mdirectorApiKey); }
    if (cfg.mdirectorApiSecret !== undefined) { fields.push(`mdirector_api_secret=$${i++}`);   values.push(cfg.mdirectorApiSecret); }
    if (cfg.mdirectorFromEmail !== undefined) { fields.push(`mdirector_from_email=$${i++}`);   values.push(cfg.mdirectorFromEmail); }
    if (cfg.mdirectorFromName  !== undefined) { fields.push(`mdirector_from_name=$${i++}`);    values.push(cfg.mdirectorFromName); }
    if (cfg.mdirectorUsername  !== undefined) { fields.push(`mdirector_username=$${i++}`);     values.push(cfg.mdirectorUsername); }
    if (cfg.mdirectorPassword  !== undefined) { fields.push(`mdirector_password=$${i++}`);     values.push(cfg.mdirectorPassword); }
    if (cfg.mdirectorReplyTo   !== undefined) { fields.push(`mdirector_reply_to=$${i++}`);     values.push(cfg.mdirectorReplyTo); }
    if (cfg.quebecListId       !== undefined) { fields.push(`quebec_list_id=$${i++}`);         values.push(cfg.quebecListId); }
    if (cfg.ontarioListId      !== undefined) { fields.push(`ontario_list_id=$${i++}`);        values.push(cfg.ontarioListId); }
    if (cfg.serviceTemplateMap !== undefined) { fields.push(`service_template_map=$${i++}`);   values.push(JSON.stringify(cfg.serviceTemplateMap)); }
    if (fields.length === 0) return;
    fields.push(`updated_at=NOW()`);
    await pool.query(
      `UPDATE campaign_config SET ${fields.join(', ')} WHERE id='00000000-0000-0000-0000-000000000001'`,
      values,
    );
    // Clear token cache if credentials changed
    MDirectorService.clearToken();
  }

  // ── Load from DB ──────────────────────────────────────────────────────────

  /**
   * Loads companies from ontario_companies or quebec_companies,
   * maps work → listId + segmentId, checks last campaign log.
   */
  static async loadFromDb(pool: pg.Pool, source: ProvinceSource): Promise<CampaignContact[]> {
    const table    = source === 'ontario' ? 'ontario_companies' : 'quebec_companies';
    const listId   = source === 'ontario' ? ONTARIO_LIST_ID      : QUEBEC_LIST_ID;
    const segments = source === 'ontario' ? ONTARIO_SEGMENTS      : QUEBEC_SEGMENTS;
    const language: 'fr' | 'en' = source === 'ontario' ? 'fr' : 'en';

    // Load companies that have an email address
    const companiesRes = await pool.query<{
      id: string; nombre: string; correo: string; work: string | null;
      tipo: string | null; direccion: string | null; created_at: Date;
    }>(
      `SELECT id, nombre, correo, work, tipo, direccion, created_at
       FROM ${table}
       WHERE correo IS NOT NULL AND correo != '' AND is_duplicate = FALSE
       ORDER BY created_at DESC`,
    );

    if (companiesRes.rows.length === 0) return [];

    // Load last-sent dates from campaign log
    const emailList = companiesRes.rows.map(r => r.correo);
    const logRes = await pool.query<{ company_email: string; max_sent: Date }>(
      `SELECT company_email, MAX(sent_at) AS max_sent
       FROM email_campaign_log
       WHERE company_email = ANY($1::text[])
       GROUP BY company_email`,
      [emailList],
    );
    const lastSentMap = new Map<string, Date>();
    for (const row of logRes.rows) {
      lastSentMap.set(row.company_email.toLowerCase(), new Date(row.max_sent));
    }

    return companiesRes.rows.map(row => {
      const work      = (row.work || '').toUpperCase().trim();
      const segmentId = segments[work] ?? null;
      const lastSentAt = lastSentMap.get(row.correo.toLowerCase()) ?? null;

      return {
        companyId:  row.id,
        companyName: row.nombre,
        email:      row.correo,
        work,
        listId,
        segmentId,
        direccion:  row.direccion || '',
        isNew:      false, // will be computed in buildPreview
        lastSentAt,
        tipo:       row.tipo,
        source,
        language,
        addedToSheetAt: row.created_at,
      } as CampaignContact;
    });
  }

  // ── Preview (DB-based) ───────────────────────────────────────────────────

  static async buildPreview(pool: pg.Pool, source: ProvinceSource): Promise<CampaignPreview> {
    const config   = await this.getConfig(pool);
    const contacts = await this.loadFromDb(pool, source);
    const now      = new Date();

    const toSend:  CampaignContact[]                      = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    const byWork:  Record<string, number>                  = {};

    for (const c of contacts) {
      if (!c.email || !c.email.includes('@')) {
        skipped.push({ name: c.companyName, reason: 'No valid email' });
        continue;
      }

      if (!c.segmentId) {
        skipped.push({ name: c.companyName, reason: `No segment mapping for "${c.work}"` });
        continue;
      }

      // Compute isNew based on created_at vs newCompanyDays
      const addedAt = (c as any).addedToSheetAt as Date | null;
      const daysSinceAdded = addedAt
        ? (now.getTime() - addedAt.getTime()) / 86_400_000
        : 9999;
      const isNew = daysSinceAdded <= config.newCompanyDays;

      // Skip if not new and recently sent
      if (!isNew && c.lastSentAt) {
        const daysSinceSent = (now.getTime() - c.lastSentAt.getTime()) / 86_400_000;
        if (daysSinceSent < config.resendIntervalDays) {
          skipped.push({
            name: c.companyName,
            reason: `Recent send (${Math.round(daysSinceSent)}d ago, interval ${config.resendIntervalDays}d)`,
          });
          continue;
        }
      }

      toSend.push({ ...c, isNew });
      byWork[c.work] = (byWork[c.work] ?? 0) + 1;
    }

    return {
      toSend,
      skipped,
      byWork,
      totalNew: toSend.filter(c => c.isNew).length,
      totalOld: toSend.filter(c => !c.isNew).length,
      source,
    };
  }

  // ── Legacy Google Sheets Preview ──────────────────────────────────────────

  static async buildPreviewFromSheet(pool: pg.Pool): Promise<any> {
    await GoogleSheetsService.init();
    const config    = await this.getConfig(pool);
    const sheetRows = await GoogleSheetsService.readRows();

    if (sheetRows.length === 0) {
      return { toSend: [], skipped: [], byWork: {}, totalNew: 0, totalOld: 0 };
    }

    const dbMap = await this.loadDbData(pool, sheetRows);
    const now   = new Date();
    const toSend:  CampaignContact[]               = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    const byWork:  Record<string, number>          = {};

    for (const row of sheetRows) {
      const db    = dbMap.get(this.normalizeKey(row.empresa));

      const sheetTipoRaw = (row.tipo || '').toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
      let tipoFromSheet: string | null = null;
      if (sheetTipoRaw.includes('rojo') || sheetTipoRaw.includes('red') || sheetTipoRaw === 'r') tipoFromSheet = 'rojo';
      else if (sheetTipoRaw.includes('verde') || sheetTipoRaw === 'v') tipoFromSheet = 'verde';
      else if (sheetTipoRaw.includes('naranja') || sheetTipoRaw === 'n') tipoFromSheet = 'naranja';
      else if (sheetTipoRaw.includes('morado') || sheetTipoRaw.includes('lila') || sheetTipoRaw === 'm') tipoFromSheet = 'morado';
      const tipo = db?.tipo ?? tipoFromSheet;

      if (tipo === 'rojo') {
        skipped.push({ name: row.empresa, reason: 'Company closed (red)' });
        continue;
      }

      const email = db?.contact_email || row.correo || '';
      if (!email || !email.includes('@')) {
        skipped.push({ name: row.empresa, reason: 'No email' });
        continue;
      }

      const work       = (row.work || '').toUpperCase().trim();
      const templateId = config.serviceTemplateMap[work] ?? null;

      if (!templateId) {
        skipped.push({ name: row.empresa, reason: `No MDirector template for "${work}"` });
        continue;
      }

      const addedAt    = db?.sheets_exported_at    ? new Date(db.sheets_exported_at)    : null;
      const lastSentAt = db?.last_campaign_sent_at ? new Date(db.last_campaign_sent_at) : null;
      const daysSinceAdded = addedAt ? (now.getTime() - addedAt.getTime()) / 86_400_000 : 9999;
      const isNew = daysSinceAdded <= config.newCompanyDays;

      if (!isNew && lastSentAt) {
        const daysSinceSent = (now.getTime() - lastSentAt.getTime()) / 86_400_000;
        if (daysSinceSent < config.resendIntervalDays) {
          skipped.push({ name: row.empresa, reason: `Recent send (${Math.round(daysSinceSent)}d)` });
          continue;
        }
      }

      const contact: CampaignContact = {
        companyId:      db?.id ?? null,
        companyName:    row.empresa,
        email,
        work,
        listId:         QUEBEC_LIST_ID,
        segmentId:      QUEBEC_SEGMENTS[work] ?? null,
        templateId,
        direccion:      row.direccion,
        isNew,
        lastSentAt,
        addedToSheetAt: addedAt,
        tipo,
        source:         'quebec',
        language:       'en',
      };

      toSend.push(contact);
      byWork[work] = (byWork[work] ?? 0) + 1;
    }

    return { toSend, skipped, byWork, totalNew: toSend.filter(c => c.isNew).length, totalOld: toSend.filter(c => !c.isNew).length };
  }

  // ── Send (DB-based) ──────────────────────────────────────────────────────

  static async sendCampaignFromDb(
    pool:         pg.Pool,
    source:       ProvinceSource,
    opts: {
      fromEmail?:          string;
      fromName?:           string;
      subject:             string;
      scheduleDate?:       string;
      workFilter?:         string;
      templateServiceId?:  string;
    },
    sentByUserId: string,
  ): Promise<CampaignSendResult> {
    const config  = await this.getConfig(pool);
    const preview = await this.buildPreview(pool, source);

    let contacts = preview.toSend;
    if (opts.workFilter) {
      contacts = contacts.filter(c => c.work === opts.workFilter.toUpperCase());
    }

    if (contacts.length === 0) {
      return { sent: 0, failed: 0, skipped: 0, details: [] };
    }

    // Sync env vars from DB config so MDirectorService picks them up
    if (config.mdirectorUsername) process.env.MDIRECTOR_USERNAME = config.mdirectorUsername;
    if (config.mdirectorPassword) process.env.MDIRECTOR_PASSWORD = config.mdirectorPassword;
    if (config.mdirectorFromEmail) process.env.MDIRECTOR_FROM_EMAIL = config.mdirectorFromEmail;
    if (config.mdirectorFromName)  process.env.MDIRECTOR_FROM_NAME  = config.mdirectorFromName;
    if (config.mdirectorReplyTo)   process.env.MDIRECTOR_REPLY_TO   = config.mdirectorReplyTo;
    MDirectorService.clearToken();

    const fromEmail = opts.fromEmail || config.mdirectorFromEmail || MDirectorService.fromEmail;
    const fromName  = opts.fromName  || config.mdirectorFromName  || MDirectorService.fromName;

    const result: CampaignSendResult = { sent: 0, failed: 0, skipped: 0, details: [] };

    // Group by work so we create one campaign per work-type
    const groups = new Map<string, CampaignContact[]>();
    for (const c of contacts) {
      if (!c.segmentId) {
        result.skipped++;
        result.details.push({ name: c.companyName, email: c.email, status: 'skipped', error: 'No segment mapping' });
        continue;
      }
      const arr = groups.get(c.work) ?? [];
      arr.push(c);
      groups.set(c.work, arr);
    }

    const dateStr = new Date().toISOString().slice(0, 10);

    for (const [work, batch] of groups) {
      // 1. Subscribe all contacts in this group
      const subscribeErrors: string[] = [];
      for (const contact of batch) {
        try {
          await MDirectorService.subscribeContact(
            contact.email,
            contact.companyName,
            contact.listId,
            contact.segmentId!,
          );
        } catch (err: any) {
          console.error(`[Campaign] subscribeContact failed for ${contact.email}:`, err.message);
          subscribeErrors.push(`${contact.email}: ${err.message}`);
        }
      }

      // 2. Load HTML template from DB if templateServiceId provided, else use default
      let html = '<p>VSM Services</p>';
      if (opts.templateServiceId) {
        try {
          const tmplRes = await pool.query(
            `SELECT content FROM service_templates WHERE id = $1`,
            [opts.templateServiceId],
          );
          if (tmplRes.rows[0]?.content) html = tmplRes.rows[0].content;
        } catch (e) { /* use default */ }
      }

      // 3. Create campaign for the segment
      const campaignName = `CRM-${source.toUpperCase()}-${work.replace(/\s+/g, '_').slice(0, 30)}-${dateStr}`;
      let campaignId = '';

      try {
        const res = await MDirectorService.sendCampaignToSegment({
          campaignName,
          listId:      batch[0].listId,
          segmentId:   batch[0].segmentId!,
          subject:     opts.subject,
          html,
          fromEmail,
          fromName,
          scheduleDate: opts.scheduleDate,
        });
        campaignId = res.campaignId;
        console.log(`[Campaign] Created campaign "${campaignName}" → id=${campaignId}`);
      } catch (err: any) {
        console.error(`[Campaign] createCampaign failed for ${work}:`, err.message);
        for (const contact of batch) {
          result.failed++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'failed', error: err.message });
        }
        continue;
      }

      // 4. Log and count
      for (const contact of batch) {
        try {
          await this.logSent(pool, contact, campaignId, contact.listId, sentByUserId);
          result.sent++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'sent' });
        } catch (err: any) {
          result.failed++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'failed', error: err.message });
        }
      }
    }

    return result;
  }

  // ── Legacy Send (Google Sheets flow) ─────────────────────────────────────

  static async sendCampaign(
    pool:          pg.Pool,
    contacts:      CampaignContact[],
    sentByUserId:  string,
  ): Promise<CampaignSendResult> {
    const config = await this.getConfig(pool);
    if (!config.mdirectorApiKey && !config.mdirectorPassword) {
      throw new Error('MDirector not configured');
    }

    const groups = new Map<string, CampaignContact[]>();
    for (const c of contacts) {
      if (!c.templateId) continue;
      const arr = groups.get(c.templateId) ?? [];
      arr.push(c);
      groups.set(c.templateId, arr);
    }

    const result: CampaignSendResult = { sent: 0, failed: 0, skipped: 0, details: [] };

    for (const [templateId, batch] of groups) {
      try {
        const listId     = await this.createMDirectorList(config, templateId, batch);
        const campaignId = await this.launchMDirectorCampaign(config, templateId, listId, batch[0].work);

        for (const contact of batch) {
          await this.logSent(pool, contact, campaignId, listId, sentByUserId);
          result.sent++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'sent' });
        }
      } catch (err: any) {
        console.error(`[Campaign] Error template ${templateId}:`, err.message);
        for (const contact of batch) {
          result.failed++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'failed', error: err.message });
        }
      }
    }

    return result;
  }

  // ── Legacy MDirector API Calls (api_key based) ────────────────────────────

  private static async createMDirectorList(
    config:     CampaignConfig,
    templateId: string,
    contacts:   CampaignContact[],
  ): Promise<string> {
    const listName = `VSM_${contacts[0].work}_${new Date().toISOString().slice(0, 10)}`;
    const createRes = await fetch('https://api.mdirector.com/api_list', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:    config.mdirectorApiKey,
        api_secret: config.mdirectorApiSecret,
        name:       listName,
      }),
    });
    const createData: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createData.id) {
      throw new Error(`MDirector createList error: ${JSON.stringify(createData)}`);
    }
    return String(createData.id);
  }

  private static async launchMDirectorCampaign(
    config:     CampaignConfig,
    templateId: string,
    listId:     string,
    workLabel:  string,
  ): Promise<string> {
    const campaignName = `VSM_${workLabel}_${new Date().toISOString().slice(0, 16).replace('T', '_')}`;
    const res = await fetch('https://api.mdirector.com/api_campaign', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:     config.mdirectorApiKey,
        api_secret:  config.mdirectorApiSecret,
        name:        campaignName,
        template_id: templateId,
        list_id:     listId,
        from_email:  config.mdirectorFromEmail,
        from_name:   config.mdirectorFromName,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      throw new Error(`MDirector createCampaign error: ${JSON.stringify(data)}`);
    }
    return String(data.id);
  }

  // ── Log & History ────────────────────────────────────────────────────────

  static async logSent(
    pool:          pg.Pool,
    contact:       CampaignContact,
    campaignId:    string,
    listId:        string,
    sentByUserId:  string,
  ): Promise<void> {
    await pool.query(`
      INSERT INTO email_campaign_log
        (company_id, company_name, company_email, work_label,
         mdirector_campaign_id, mdirector_list_id, status, sent_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,'sent',$7)
    `, [contact.companyId, contact.companyName, contact.email,
        contact.work, campaignId, listId, sentByUserId]);

    if (contact.companyId) {
      // Update last_campaign_sent_at on the source table
      const table = (contact.source === 'ontario') ? 'ontario_companies' : 'quebec_companies';
      await pool.query(
        `UPDATE ${table} SET updated_at = NOW() WHERE id = $1`,
        [contact.companyId],
      ).catch(() => null);
    }
  }

  static async getHistory(pool: pg.Pool, limit = 100) {
    const res = await pool.query(`
      SELECT ecl.*, u.first_name || ' ' || u.last_name AS sent_by_name
      FROM email_campaign_log ecl
      LEFT JOIN users u ON u.id = ecl.sent_by_user_id
      ORDER BY ecl.sent_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static normalizeKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/gi, '').trim();
  }

  private static async loadDbData(
    pool: pg.Pool,
    rows: ActonValeRow[],
  ): Promise<Map<string, any>> {
    const names = rows.map(r => r.empresa).filter(Boolean);
    if (names.length === 0) return new Map();

    const res = await pool.query(`
      SELECT id, name, slug, contact_email, sheets_exported_at, last_campaign_sent_at, tipo
      FROM companies
      WHERE name = ANY($1::text[])
         OR slug = ANY($2::text[])
    `, [names, names.map(n => n.toLowerCase().replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-'))]);

    const map = new Map<string, any>();
    for (const row of res.rows) {
      map.set(this.normalizeKey(row.name), row);
    }
    return map;
  }
}
