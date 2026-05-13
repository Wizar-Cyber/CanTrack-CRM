/**
 * workflow.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ciclo completo: scraped jobs → companies → enrich → province tables → Sheets
 *
 * Pasos en orden:
 *  0. requeueStuck        — reset failed/processing → pending (siempre antes de enriquecer)
 *  1. syncJobs            — vincula jobs sin company_id a su empresa en companies
 *  2. enrichAllPending    — enriquece TODAS las empresas pending con IA
 *  3. copyToProvinceTables — copia empresas Ontario/Quebec a sus tablas separadas
 *  4. exportToSheets      — exporta a Google Sheets las empresas nuevas
 */

import type { Pool } from 'pg';
import { EnrichmentService } from './enrichment.service.js';
import { JobClassifierService } from './job-classifier.service.js';
import { slugify } from '../utils/slug.js';
import {
  isRegionFilterActive,
  isRegionMatch,
  REGION_FILTER,
} from '../utils/region-filter.js';

const ALLOWED = new Set([
  'industry','company_size','hq_city','hq_province','hq_country','exact_address',
  'phone','contact_email','website','description','enrichment_status','tipo','tipo_updated_at',
]);

export interface WorkflowResult {
  step: string;
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkflowCycleResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: WorkflowResult[];
  totalNewCompanies: number;
  totalEnriched: number;
  totalExported: number;
}

// ── Step 0: reset stuck companies (failed / processing) ───────────────────────

export async function requeueStuck(pool: Pool): Promise<WorkflowResult> {
  try {
    const { rowCount } = await pool.query(`
      UPDATE companies SET enrichment_status='pending', updated_at=NOW()
      WHERE enrichment_status IN ('failed', 'processing')
    `);
    return {
      step: 'requeueStuck', ok: true,
      message: `${rowCount ?? 0} empresas (failed/processing) re-encoladas como pending`,
      details: { requeued: rowCount ?? 0 },
    };
  } catch (err: any) {
    return { step: 'requeueStuck', ok: false, message: err.message };
  }
}

// ── Step 1: sync scraped jobs ─────────────────────────────────────────────────

export async function syncJobs(pool: Pool): Promise<WorkflowResult> {
  try {
    let linkedJobs   = 0;
    let newCompanies = 0;
    let skippedRegion = 0;

    const unlinked = await pool.query(`
      SELECT id, raw_company_name, title, source, url, location, country, created_at, service_type_id
      FROM jobs
      WHERE company_id IS NULL AND raw_company_name IS NOT NULL AND raw_company_name <> ''
      ORDER BY created_at ASC LIMIT 300
    `);

    for (const job of unlinked.rows) {
      const name = job.raw_company_name as string;
      if (isRegionFilterActive() && (job.location || job.country)) {
        if (!isRegionMatch(job.location, job.country, job.title, name)) {
          skippedRegion++;
          await pool.query(`UPDATE jobs SET is_active=false, updated_at=NOW() WHERE id=$1`, [job.id]);
          continue;
        }
      }
      const sl = slugify(name);
      if (!job.service_type_id && job.title) {
        JobClassifierService.classifyJob(job.title, '', name, '').then(r =>
          pool.query(
            `UPDATE jobs SET service_type_id=$1,service_match_confidence=$2,service_match_reasoning=$3,service_match_provider=$4 WHERE id=$5`,
            [r.service_id, r.confidence, r.reasoning, r._provider, job.id],
          ),
        ).catch(() => {});
      }
      const ins = await pool.query(
        `INSERT INTO companies (name, slug, enrichment_status) VALUES ($1,$2,'pending'::enrichment_status_enum) ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [name, sl],
      );
      let companyId: string;
      if (ins.rows.length > 0) {
        companyId = ins.rows[0].id;
        newCompanies++;
      } else {
        const found = await pool.query('SELECT id FROM companies WHERE slug=$1', [sl]);
        if (!found.rows.length) continue;
        companyId = found.rows[0].id;
      }
      await pool.query(`UPDATE jobs SET company_id=$1, updated_at=NOW() WHERE id=$2`, [companyId, job.id]);
      linkedJobs++;
    }

    // Legacy scraped_jobs table
    const legacy = await pool.query(`
      SELECT DISTINCT ON (sj.url_postulacion)
        sj.fuente, sj.titulo, sj.empresa, sj.url_postulacion, sj.fecha_creacion
      FROM scraped_jobs sj
      WHERE sj.empresa IS NOT NULL AND sj.titulo IS NOT NULL AND sj.url_postulacion IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.url = sj.url_postulacion)
      ORDER BY sj.url_postulacion, sj.fecha_creacion DESC LIMIT 300
    `).catch(() => ({ rows: [] }));

    const VALID_SOURCES = new Set(['linkedin','indeed','glassdoor','company_website']);
    for (const sj of legacy.rows) {
      if (isRegionFilterActive() && !isRegionMatch(sj.titulo, sj.empresa)) { skippedRegion++; continue; }
      const sl = slugify(sj.empresa);
      const ins = await pool.query(
        `INSERT INTO companies (name, slug, enrichment_status) VALUES ($1,$2,'pending'::enrichment_status_enum) ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [sj.empresa, sl],
      );
      let companyId: string;
      if (ins.rows.length > 0) { companyId = ins.rows[0].id; newCompanies++; }
      else {
        const f = await pool.query('SELECT id FROM companies WHERE slug=$1', [sl]);
        if (!f.rows.length) continue;
        companyId = f.rows[0].id;
      }
      const src = VALID_SOURCES.has(sj.fuente?.toLowerCase()) ? sj.fuente.toLowerCase() : 'other';
      try {
        const j = await pool.query(
          `INSERT INTO jobs (company_id,title,source,url,raw_company_name,created_at)
           VALUES ($1,$2,$3::job_source_enum,$4,$5,$6)
           ON CONFLICT (LOWER(TRIM(COALESCE(raw_company_name,''))), LOWER(TRIM(COALESCE(title,''))))
             WHERE is_active = true
             DO UPDATE SET company_id=EXCLUDED.company_id, url=EXCLUDED.url, updated_at=NOW()
           RETURNING id`,
          [companyId, sj.titulo, src, sj.url_postulacion, sj.empresa, sj.fecha_creacion ?? new Date()],
        );
        linkedJobs++;
        if (j.rowCount) {
          const jid = j.rows[0].id;
          JobClassifierService.classifyJob(sj.titulo, '', sj.empresa, '').then(r =>
            pool.query(
              `UPDATE jobs SET service_type_id=$1,service_match_confidence=$2,service_match_reasoning=$3,service_match_provider=$4 WHERE id=$5`,
              [r.service_id, r.confidence, r.reasoning, r._provider, jid],
            ),
          ).catch(() => {});
        }
      } catch { /* duplicate */ }
    }

    return {
      step: 'syncJobs', ok: true,
      message: `${linkedJobs} vacantes vinculadas, ${newCompanies} empresas nuevas, ${skippedRegion} descartadas${REGION_FILTER ? ` (filtro: ${REGION_FILTER})` : ''}`,
      details: { linkedJobs, newCompanies, skippedRegion },
    };
  } catch (err: any) {
    return { step: 'syncJobs', ok: false, message: err.message };
  }
}

// ── Step 2: enrich all pending companies ──────────────────────────────────────

export async function enrichAllPending(pool: Pool): Promise<WorkflowResult> {
  let enriched = 0;
  let failed   = 0;
  let skipped  = 0;
  const MAX_ITERATIONS = 500;
  let iter = 0;

  try {
    while (iter++ < MAX_ITERATIONS) {
      const lock = await pool.query(`
        UPDATE companies SET enrichment_status='processing'
        WHERE id=(SELECT id FROM companies WHERE enrichment_status='pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, name
      `);
      if (!lock.rows.length) break;

      const { id: companyId, name: companyName } = lock.rows[0];

      const existing = await pool.query(
        'SELECT industry,website,description FROM companies WHERE id=$1', [companyId],
      );
      const row = existing.rows[0];
      if (row && (row.industry || row.website || row.description)) {
        await pool.query(`UPDATE companies SET enrichment_status='db_matched', updated_at=NOW() WHERE id=$1`, [companyId]);
        skipped++;
        await maybeCopyToProvinceTable(pool, companyId);
        continue;
      }

      // Pre-enrichment: check province tables to avoid calling AI for already-known companies
      const provMatch = await pool.query(`
        SELECT telefono, correo, direccion, ciudad, provincia, region, pueblo, dominio_de_pagina, descripcion
        FROM ontario_companies WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
        UNION ALL
        SELECT telefono, correo, direccion, ciudad, provincia, region, pueblo, dominio_de_pagina, descripcion
        FROM quebec_companies WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
        LIMIT 1
      `, [companyName]);

      if (provMatch.rows.length > 0) {
        const pm = provMatch.rows[0];
        const upd: Record<string, any> = { enrichment_status: 'db_matched' };
        if (pm.telefono)          upd.phone          = pm.telefono;
        if (pm.correo)            upd.contact_email  = pm.correo;
        if (pm.direccion)         upd.exact_address  = pm.direccion;
        if (pm.ciudad)            upd.hq_city        = pm.ciudad;
        if (pm.provincia)         upd.hq_province    = pm.provincia;
        if (pm.region)            upd.hq_region      = pm.region;
        if (pm.pueblo)            upd.hq_town        = pm.pueblo;
        if (pm.dominio_de_pagina) upd.website        = pm.dominio_de_pagina;
        if (pm.descripcion)       upd.description    = pm.descripcion;
        const keys = Object.keys(upd);
        const sets = keys.map((k, i) => `"${k}"=$${i + 2}`).join(', ');
        await pool.query(
          `UPDATE companies SET ${sets}, updated_at=NOW() WHERE id=$1`,
          [companyId, ...keys.map(k => upd[k])],
        );
        await maybeCopyToProvinceTable(pool, companyId);
        skipped++;
        continue;
      }

      try {
        const data = await EnrichmentService.enrichCompany(companyName);
        const hasData = !!(data.industry || data.description || data.website);
        const newStatus = hasData ? 'scraped' : 'failed';
        const payload: Record<string, any> = { enrichment_status: newStatus };
        if (data.is_closed === true) { payload.tipo = 'rojo'; payload.tipo_updated_at = new Date().toISOString(); }
        for (const k of ['industry','company_size','hq_city','hq_province','hq_country','exact_address','phone','contact_email','website','description']) {
          if ((data as any)[k] && ALLOWED.has(k)) payload[k] = (data as any)[k];
        }
        const keys   = Object.keys(payload);
        const sets   = keys.map((k, i) => `"${k}"=$${i + 2}`).join(', ');
        const values = keys.map(k => payload[k]);
        await pool.query(
          `UPDATE companies SET ${sets}, updated_at=NOW(), enriched_at=NOW() WHERE id=$1`,
          [companyId, ...values],
        );

        if (hasData) {
          await maybeCopyToProvinceTable(pool, companyId);
          JobClassifierService.suggestForCompany({ name: companyName, industry: data.industry, description: data.description }).then(s =>
            pool.query(`UPDATE companies SET suggested_services=$1,suggested_services_summary=$2,suggested_services_at=NOW() WHERE id=$3`,
              [JSON.stringify(s.suggestions), s.company_summary, companyId]),
          ).catch(() => {});
          enriched++;
        } else {
          failed++;
        }
      } catch (err: any) {
        console.warn(`[Workflow] Enrich failed for "${companyName}":`, err.message);
        await pool.query(`UPDATE companies SET enrichment_status='pending' WHERE id=$1`, [companyId]);
        failed++;
      }
    }

    return {
      step: 'enrichPending', ok: true,
      message: `${enriched} enriquecidas, ${skipped} ya tenían datos (db_matched), ${failed} fallidas`,
      details: { enriched, skipped, failed },
    };
  } catch (err: any) {
    return { step: 'enrichPending', ok: false, message: err.message };
  }
}

// ── Internal: copy one enriched company to its province table ─────────────────

async function maybeCopyToProvinceTable(pool: Pool, companyId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT name,phone,contact_email,hq_city,hq_province,hq_region,hq_town,exact_address,website,description,industry
     FROM companies WHERE id=$1`, [companyId],
  );
  if (!rows.length) return;
  const co = rows[0];
  const prov = (co.hq_province ?? '').trim().toLowerCase();
  let tbl: string | null = null;
  let provinciaLabel: string | null = null;
  if (prov === 'on' || prov === 'ontario') { tbl = 'ontario_companies'; provinciaLabel = 'Ontario'; }
  else if (prov === 'qc' || prov === 'quebec' || prov === 'québec') { tbl = 'quebec_companies'; provinciaLabel = 'Quebec'; }
  if (!tbl || !co.name) return;
  const workLabel = co.industry ? co.industry.substring(0, 50).toUpperCase() : 'GENERAL';
  await pool.query(
    `INSERT INTO ${tbl} (nombre,telefono,correo,ciudad,provincia,region,pueblo,direccion,dominio_de_pagina,descripcion,work,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'enriched')
     ON CONFLICT DO NOTHING`,
    [co.name, co.phone||null, co.contact_email||null, co.hq_city||null,
     provinciaLabel, co.hq_region||null, co.hq_town||null,
     co.exact_address||null, co.website||null, co.description||null, workLabel],
  ).catch(() => {});
}

// ── Step 3: copy ALL enriched Ontario/Quebec companies to province tables ─────
// Uses ON CONFLICT DO NOTHING so re-running is safe and idempotent.

export async function copyMissedToProvinceTables(pool: Pool): Promise<WorkflowResult> {
  try {
    const { rows } = await pool.query(`
      SELECT id FROM companies
      WHERE enrichment_status IN ('scraped','db_matched','verified')
        AND hq_province IS NOT NULL
        AND (
          hq_province ILIKE 'on'      OR hq_province ILIKE 'ontario' OR
          hq_province ILIKE 'qc'      OR hq_province ILIKE 'quebec'  OR
          hq_province ILIKE 'québec'
        )
      LIMIT 500
    `);
    let attempted = 0;
    for (const r of rows) {
      await maybeCopyToProvinceTable(pool, r.id);
      attempted++;
    }
    return {
      step: 'copyToProvinceTables', ok: true,
      message: `${attempted} empresas procesadas hacia tablas de provincia (duplicados ignorados)`,
      details: { attempted },
    };
  } catch (err: any) {
    return { step: 'copyToProvinceTables', ok: false, message: err.message };
  }
}

// ── Step 4: export to Google Sheets ──────────────────────────────────────────

export async function exportToSheets(pool: Pool): Promise<WorkflowResult> {
  const ontarioId = process.env.ONTARIO_SHEETS_ID;
  const quebecId  = process.env.QUEBEC_SHEETS_ID;
  const hasCredentials = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  );

  if ((!ontarioId && !quebecId) || !hasCredentials) {
    return { step: 'exportToSheets', ok: true, message: 'Google Sheets no configurado — omitido' };
  }

  try {
    const { runSheetsExport } = await import('../../scripts/export-to-sheets.js')
      .catch(() => ({ runSheetsExport: null })) as any;
    if (!runSheetsExport) {
      return { step: 'exportToSheets', ok: false, message: 'Script de exportación no encontrado (scripts/ no copiado al contenedor)' };
    }

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalInvalid = 0;
    let totalPossible = 0;
    const parts: string[] = [];

    if (ontarioId) {
      const r = await runSheetsExport({ limit: 1000, dryRun: false, pool, spreadsheetId: ontarioId, hqProvince: 'ontario' });
      totalAdded   += r.added;
      totalSkipped += r.skipped;
      totalInvalid += r.invalid ?? 0;
      totalPossible += r.possibleDuplicates ?? 0;
      parts.push(`Ontario: +${r.added}`);
    }

    if (quebecId) {
      const r = await runSheetsExport({ limit: 1000, dryRun: false, pool, spreadsheetId: quebecId, hqProvince: 'quebec' });
      totalAdded   += r.added;
      totalSkipped += r.skipped;
      totalInvalid += r.invalid ?? 0;
      totalPossible += r.possibleDuplicates ?? 0;
      parts.push(`Quebec: +${r.added}`);
    }

    return {
      step: 'exportToSheets', ok: true,
      message: `${parts.join(', ')} exportadas (${totalSkipped} ya existían, ${totalPossible} posibles duplicadas, ${totalInvalid} inválidas)`,
      details: { added: totalAdded, skipped: totalSkipped },
    };
  } catch (err: any) {
    return { step: 'exportToSheets', ok: false, message: err.message };
  }
}

// ── Full cycle ────────────────────────────────────────────────────────────────

export async function runWorkflowCycle(pool: Pool): Promise<WorkflowCycleResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const steps: WorkflowResult[] = [];

  console.log('[Workflow] ── Iniciando ciclo completo ──────────────────────────');

  // Step 0: reset failed/processing companies so they get retried
  const r0 = await requeueStuck(pool);
  steps.push(r0);
  console.log(`[Workflow] requeueStuck: ${r0.message}`);

  // Step 1: link new scraped jobs to companies
  const r1 = await syncJobs(pool);
  steps.push(r1);
  console.log(`[Workflow] syncJobs: ${r1.message}`);

  // Step 2: enrich all pending companies
  const r2 = await enrichAllPending(pool);
  steps.push(r2);
  console.log(`[Workflow] enrichPending: ${r2.message}`);

  // Step 3: copy enriched companies to province tables (idempotent)
  const r3 = await copyMissedToProvinceTables(pool);
  steps.push(r3);
  console.log(`[Workflow] copyToProvinceTables: ${r3.message}`);

  // Step 4: export new companies to Google Sheets
  const r4 = await exportToSheets(pool);
  steps.push(r4);
  console.log(`[Workflow] exportToSheets: ${r4.message}`);

  const durationMs = Date.now() - t0;
  console.log(`[Workflow] ── Ciclo completado en ${(durationMs / 1000).toFixed(1)}s ──`);

  await pool.query(
    `INSERT INTO automation_log (job, status, message) VALUES ($1, $2, $3)`,
    [
      'workflow_cycle',
      steps.every(s => s.ok) ? 'ok' : 'partial',
      steps.map(s => `${s.step}: ${s.message}`).join(' | '),
    ],
  ).catch(() => {});

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    steps,
    totalNewCompanies: (r1.details?.newCompanies as number) ?? 0,
    totalEnriched:     (r2.details?.enriched    as number) ?? 0,
    totalExported:     (r4.details?.added        as number) ?? 0,
  };
}
