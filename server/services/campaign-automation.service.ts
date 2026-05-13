import type { Pool } from 'pg';
import { MDirectorService } from './mdirector.service.js';
import {
  ONTARIO_LIST_ID,
  QUEBEC_LIST_ID,
  ONTARIO_SEGMENTS,
  QUEBEC_SEGMENTS,
} from '../data/mdirectorSegments.js';

interface AutoConfig {
  auto_enabled: boolean;
  auto_ontario: boolean;
  auto_quebec: boolean;
  auto_new_days: number;
  auto_resend_days: number;
  auto_min_gap_days: number;
  auto_schedule_hour: number;
  auto_last_run_at: string | null;
}

interface RegionCfg {
  table: string;
  listId: string;
  segments: Record<string, string>;
  language: 'fr' | 'en';
}

function regionCfg(region: 'ontario' | 'quebec'): RegionCfg {
  return region === 'ontario'
    ? { table: 'ontario_companies', listId: ONTARIO_LIST_ID, segments: ONTARIO_SEGMENTS, language: 'fr' }
    : { table: 'quebec_companies',  listId: QUEBEC_LIST_ID,  segments: QUEBEC_SEGMENTS,  language: 'en' };
}

function campaignName(work: string, region: string, date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0');
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${work} ${region.toUpperCase()} ${dd}/${mm}/${yyyy}`;
}

export async function getAutoConfig(pool: Pool): Promise<AutoConfig | null> {
  const r = await pool.query(
    `SELECT auto_enabled, auto_ontario, auto_quebec,
            auto_new_days, auto_resend_days, auto_min_gap_days,
            auto_schedule_hour, auto_last_run_at
     FROM campaign_config LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

export async function runCampaignAutomation(
  pool: Pool,
  opts: { forcedBy?: string; dryRun?: boolean } = {},
): Promise<{
  ran: boolean;
  reason?: string;
  regions: Array<{ region: string; sent: number; skipped: number; errors: string[] }>;
}> {
  const cfg = await getAutoConfig(pool);
  if (!cfg) return { ran: false, reason: 'No hay configuración de campaña', regions: [] };
  if (!cfg.auto_enabled && !opts.forcedBy) {
    return { ran: false, reason: 'Automatización desactivada', regions: [] };
  }

  const minGapDays  = cfg.auto_min_gap_days  ?? 60;
  const newDays     = cfg.auto_new_days       ?? 15;
  const resendDays  = cfg.auto_resend_days    ?? 90;
  const scheduleDate = MDirectorService.scheduleDateInMinutes(5);
  const sendDate    = new Date(scheduleDate);

  const regionResults: Array<{ region: string; sent: number; skipped: number; errors: string[] }> = [];
  const regions: Array<'ontario' | 'quebec'> = [];
  if (cfg.auto_ontario) regions.push('ontario');
  if (cfg.auto_quebec)  regions.push('quebec');

  for (const region of regions) {
    const rc = regionCfg(region);
    const errors: string[] = [];
    let totalSent = 0;
    let totalSkipped = 0;

    try {
      // Companies eligible: new OR due for resend, AND haven't been emailed recently
      const companiesResult = await pool.query(
        `SELECT id, nombre, correo, work
         FROM ${rc.table}
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
           AND (last_campaign_at IS NULL OR last_campaign_at < NOW() - ($1 || ' days')::INTERVAL)
           AND (
             created_at > NOW() - ($2 || ' days')::INTERVAL
             OR last_campaign_at IS NULL
             OR last_campaign_at < NOW() - ($3 || ' days')::INTERVAL
           )
         ORDER BY work, nombre`,
        [minGapDays, newDays, resendDays],
      );

      if (companiesResult.rows.length === 0) {
        regionResults.push({ region, sent: 0, skipped: 0, errors: ['Sin empresas elegibles'] });
        continue;
      }

      // Group by work type (each work type gets its own template)
      const groups = new Map<string, any[]>();
      for (const company of companiesResult.rows) {
        const work = String(company.work ?? '').trim().toUpperCase() || 'GENERAL';
        const segmentId = rc.segments[work] ?? rc.segments.GENERAL;
        if (!segmentId) { totalSkipped++; continue; }

        // Find template for this region+work
        const mapRow = await pool.query(
          `SELECT template_id, template_name, language FROM mdirector_template_map
           WHERE region = $1 AND work_label = $2 AND active = TRUE LIMIT 1`,
          [region, work],
        );
        // Fall back to GENERAL template
        const fallback = mapRow.rowCount === 0
          ? await pool.query(
              `SELECT template_id, template_name, language FROM mdirector_template_map
               WHERE region = $1 AND work_label = 'GENERAL' AND active = TRUE LIMIT 1`,
              [region],
            )
          : null;

        const templateRow = mapRow.rows[0] ?? fallback?.rows[0];
        if (!templateRow) { totalSkipped++; continue; }

        const key = `${work}|||${segmentId}|||${templateRow.template_id}|||${templateRow.language || rc.language}`;
        const g = groups.get(key) ?? [];
        g.push(company);
        groups.set(key, g);
      }

      for (const [key, contacts] of groups) {
        const [work, segmentId, templateId, lang] = key.split('|||');

        let subscribed = 0;
        for (const c of contacts) {
          try {
            await MDirectorService.subscribeContact(c.correo, c.nombre, rc.listId, segmentId);
            subscribed++;
          } catch (e: any) {
            errors.push(`${c.correo}: ${e.message}`);
            const msg = (e.message || '').toLowerCase();
            const isPermanent = msg.includes('invalid') || msg.includes('bounce') ||
              msg.includes('bad') || msg.includes('rejected') || msg.includes('does not exist');
            if (isPermanent) {
              pool.query(
                `UPDATE ${rc.table}
                 SET email_status='bounced', email_bounce_count=COALESCE(email_bounce_count,0)+1,
                     email_blocked_at=NOW()
                 WHERE id=$1`, [c.id],
              ).catch(() => {});
              pool.query(
                `INSERT INTO email_suppression (email, reason, source, notes)
                 VALUES (LOWER($1),'bounce','mdirector',$2) ON CONFLICT DO NOTHING`,
                [c.correo, e.message.slice(0, 200)],
              ).catch(() => {});
            }
          }
        }

        try {
          const name = campaignName(work, region, sendDate);
          const delivery = await MDirectorService.createDeliveryFromTemplate({
            name,
            campaignName: name,
            templateId,
            subject: name,
            segmentId,
            language: lang as 'fr' | 'en',
            scheduleDate,
          });

          totalSent += subscribed;

          const ids = contacts.map((c: any) => c.id);
          await pool.query(
            `UPDATE ${rc.table} SET last_campaign_at = NOW() WHERE id = ANY($1::uuid[])`,
            [ids],
          ).catch(() => {});

          await pool.query(
            `INSERT INTO email_campaign_log
              (company_id, company_name, company_email, work_label, mdirector_campaign_id, mdirector_list_id, status, sent_by_user_id)
             SELECT id, nombre, correo, $1, $2, $3, 'scheduled', NULL
             FROM ${rc.table}
             WHERE id = ANY($4::uuid[])`,
            [work, delivery.campaignId, rc.listId, ids],
          ).catch(() => {});
        } catch (e: any) {
          errors.push(`[${work}] ${e.message}`);
          totalSkipped += contacts.length;
        }
      }
    } catch (e: any) {
      errors.push(e.message);
    }

    regionResults.push({ region, sent: totalSent, skipped: totalSkipped, errors });
  }

  if (!opts.dryRun) {
    await pool.query(
      `UPDATE campaign_config SET auto_last_run_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000001'`,
    ).catch(() => {});
  }

  return { ran: true, regions: regionResults };
}
