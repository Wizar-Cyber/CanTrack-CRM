/**
 * EmailCampaignService
 *
 * Orquesta el flujo completo de campañas de email:
 *   1. Lee empresas desde Google Sheets (Empresa | DIRECCION | WORK)
 *   2. Cruza con la DB para obtener emails y fechas de último envío
 *   3. Filtra: nuevas (< newCompanyDays) vs antiguas (> resendIntervalDays desde último envío)
 *   4. Sube la lista a MDirector con columnas: NOMBRE | CORREO ELECTRONICO | CATEGORIA
 *   5. Lanza la campaña vinculada a la plantilla configurada para ese WORK
 *   6. Registra cada envío en email_campaign_log
 */

import pg from 'pg';
import { GoogleSheetsService, ActonValeRow } from './google-sheets.service.js';

// ── Las 52 categorías de servicio (nombre exacto del campo WORK en el Sheet) ──
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

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CampaignConfig {
  newCompanyDays:      number;   // días para considerar empresa "nueva"  (default 15)
  resendIntervalDays:  number;   // días mínimos entre reenvíos           (default 90)
  mdirectorApiKey:     string;
  mdirectorApiSecret:  string;
  mdirectorFromEmail:  string;
  mdirectorFromName:   string;
  /** Mapa directo: WORK_LABEL (en mayúsculas) → mdirector_template_id */
  serviceTemplateMap:  Record<string, string>;
}

export interface CampaignContact {
  companyId:      string | null;
  companyName:    string;
  email:          string;
  work:           string;       // valor WORK del sheet, en mayúsculas
  templateId:     string | null;
  direccion:      string;
  isNew:          boolean;
  lastSentAt:     Date | null;
  addedToSheetAt: Date | null;
  tipo:           string | null;
}

export interface CampaignPreview {
  toSend:   CampaignContact[];
  skipped:  Array<{ name: string; reason: string }>;
  byWork:   Record<string, number>;
  totalNew: number;
  totalOld: number;
}

export interface CampaignSendResult {
  sent:    number;
  failed:  number;
  skipped: number;
  details: Array<{ name: string; email: string; status: 'sent' | 'failed' | 'skipped'; error?: string }>;
}

export class EmailCampaignService {

  // ── Config ────────────────────────────────────────────────────────────────

  static async getConfig(pool: pg.Pool): Promise<CampaignConfig> {
    const res = await pool.query(`
      SELECT new_company_days, resend_interval_days,
             mdirector_api_key, mdirector_api_secret,
             mdirector_from_email, mdirector_from_name,
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
      serviceTemplateMap:  row.service_template_map ?? {},
    };
  }

  static async saveConfig(pool: pg.Pool, cfg: Partial<CampaignConfig>): Promise<void> {
    const fields: string[] = [];
    const values: any[]   = [];
    let i = 1;
    if (cfg.newCompanyDays     !== undefined) { fields.push(`new_company_days=$${i++}`);      values.push(cfg.newCompanyDays); }
    if (cfg.resendIntervalDays !== undefined) { fields.push(`resend_interval_days=$${i++}`);  values.push(cfg.resendIntervalDays); }
    if (cfg.mdirectorApiKey    !== undefined) { fields.push(`mdirector_api_key=$${i++}`);     values.push(cfg.mdirectorApiKey); }
    if (cfg.mdirectorApiSecret !== undefined) { fields.push(`mdirector_api_secret=$${i++}`);  values.push(cfg.mdirectorApiSecret); }
    if (cfg.mdirectorFromEmail !== undefined) { fields.push(`mdirector_from_email=$${i++}`);  values.push(cfg.mdirectorFromEmail); }
    if (cfg.mdirectorFromName  !== undefined) { fields.push(`mdirector_from_name=$${i++}`);   values.push(cfg.mdirectorFromName); }
    if (cfg.serviceTemplateMap !== undefined) { fields.push(`service_template_map=$${i++}`);  values.push(JSON.stringify(cfg.serviceTemplateMap)); }
    if (fields.length === 0) return;
    fields.push(`updated_at=NOW()`);
    await pool.query(
      `UPDATE campaign_config SET ${fields.join(', ')} WHERE id='00000000-0000-0000-0000-000000000001'`,
      values,
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  static async buildPreview(pool: pg.Pool): Promise<CampaignPreview> {
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

      // Determinar tipo: prioridad DB sobre Sheet
      const sheetTipoRaw = (row.tipo || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let tipoFromSheet: string | null = null;
      if (sheetTipoRaw.includes('rojo') || sheetTipoRaw.includes('red') || sheetTipoRaw === 'r') tipoFromSheet = 'rojo';
      else if (sheetTipoRaw.includes('verde') || sheetTipoRaw === 'v') tipoFromSheet = 'verde';
      else if (sheetTipoRaw.includes('naranja') || sheetTipoRaw === 'n') tipoFromSheet = 'naranja';
      else if (sheetTipoRaw.includes('morado') || sheetTipoRaw.includes('lila') || sheetTipoRaw === 'm') tipoFromSheet = 'morado';
      const tipo = db?.tipo ?? tipoFromSheet;

      // Excluir automáticamente empresas rojas (cerradas / no existen)
      if (tipo === 'rojo') {
        skipped.push({ name: row.empresa, reason: '🔴 Empresa cerrada o no existe (rojo)' });
        continue;
      }

      const email = db?.contact_email || row.correo || '';

      if (!email || !email.includes('@')) {
        skipped.push({ name: row.empresa, reason: 'Sin email' });
        continue;
      }

      const work       = (row.work || '').toUpperCase().trim();
      const templateId = config.serviceTemplateMap[work] ?? null;

      if (!templateId) {
        skipped.push({ name: row.empresa, reason: `Sin plantilla MDirector para "${work}"` });
        continue;
      }

      const addedAt    = db?.sheets_exported_at     ? new Date(db.sheets_exported_at)     : null;
      const lastSentAt = db?.last_campaign_sent_at  ? new Date(db.last_campaign_sent_at)  : null;

      const daysSinceAdded = addedAt
        ? (now.getTime() - addedAt.getTime()) / 86_400_000
        : 9999;
      const isNew = daysSinceAdded <= config.newCompanyDays;

      if (!isNew && lastSentAt) {
        const daysSinceSent = (now.getTime() - lastSentAt.getTime()) / 86_400_000;
        if (daysSinceSent < config.resendIntervalDays) {
          skipped.push({
            name: row.empresa,
            reason: `Envío reciente (hace ${Math.round(daysSinceSent)}d, intervalo ${config.resendIntervalDays}d)`,
          });
          continue;
        }
      }

      const contact: CampaignContact = {
        companyId:      db?.id ?? null,
        companyName:    row.empresa,
        email,
        work,
        templateId,
        direccion:      row.direccion,
        isNew,
        lastSentAt,
        addedToSheetAt: addedAt,
        tipo,
      };

      toSend.push(contact);
      byWork[work] = (byWork[work] ?? 0) + 1;
    }

    return {
      toSend,
      skipped,
      byWork,
      totalNew: toSend.filter(c => c.isNew).length,
      totalOld: toSend.filter(c => !c.isNew).length,
    };
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  static async sendCampaign(
    pool:          pg.Pool,
    contacts:      CampaignContact[],
    sentByUserId:  string,
  ): Promise<CampaignSendResult> {
    const config = await this.getConfig(pool);
    if (!config.mdirectorApiKey) throw new Error('MDIRECTOR_API_KEY no configurado');

    // Agrupar por templateId (cada plantilla = un tipo de servicio)
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
        console.error(`[Campaign] Error en template ${templateId}:`, err.message);
        for (const contact of batch) {
          result.failed++;
          result.details.push({ name: contact.companyName, email: contact.email, status: 'failed', error: err.message });
        }
      }
    }

    return result;
  }

  // ── MDirector API calls ───────────────────────────────────────────────────

  /**
   * Crea una lista en MDirector y sube los suscriptores con el formato:
   *   NOMBRE | CORREO ELECTRONICO | CATEGORIA
   */
  private static async createMDirectorList(
    config:     CampaignConfig,
    templateId: string,
    contacts:   CampaignContact[],
  ): Promise<string> {
    const listName = `VSM_${contacts[0].work}_${new Date().toISOString().slice(0, 10)}`;

    // 1. Crear la lista
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
    const listId = String(createData.id);
    console.log(`[MDirector] Lista creada: "${listName}" → id=${listId}`);

    // 2. Subir suscriptores — formato idéntico al Excel: NOMBRE | CORREO ELECTRONICO | CATEGORIA
    const subscribers = contacts.map(c => ({
      'NOMBRE':              c.companyName,
      'CORREO ELECTRONICO':  c.email,
      'CATEGORIA':           c.work,       // valor WORK = categoría de servicio
    }));

    const subRes = await fetch('https://api.mdirector.com/api_subscriber', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:     config.mdirectorApiKey,
        api_secret:  config.mdirectorApiSecret,
        list_id:     listId,
        subscribers,
      }),
    });
    const subData: any = await subRes.json().catch(() => ({}));
    if (!subRes.ok) {
      throw new Error(`MDirector addSubscribers error: ${JSON.stringify(subData)}`);
    }
    console.log(`[MDirector] ${subscribers.length} suscriptores subidos a lista ${listId}`);
    return listId;
  }

  /**
   * Lanza una campaña en MDirector usando la plantilla configurada + la lista recién creada.
   */
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
    const campaignId = String(data.id);

    // Launch (algunos planes de MDirector requieren paso separado)
    await fetch(`https://api.mdirector.com/api_campaign/${campaignId}/launch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: config.mdirectorApiKey, api_secret: config.mdirectorApiSecret }),
    }).catch(() => null);

    console.log(`[MDirector] Campaña "${campaignName}" lanzada → id=${campaignId}`);
    return campaignId;
  }

  // ── Historial & DB ────────────────────────────────────────────────────────

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
      await pool.query(
        `UPDATE companies SET last_campaign_sent_at=NOW() WHERE id=$1`,
        [contact.companyId],
      );
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
