import type { Pool } from 'pg';
import { runCampaignAutomation, getAutoConfig } from '../services/campaign-automation.service.js';
import { runWorkflowCycle } from '../services/workflow.service.js';

// Workflow cron — runs at 08:00 UTC and 20:00 UTC every day
const WORKFLOW_HOURS_UTC = [8, 20];
// Track last workflow run date per hour slot to avoid double-firing
const _workflowLastRun: Record<number, string> = {};

// Mapbox Geocoding API — free tier: 100k req/month, ~10 req/sec safe
const GEOCODING_BATCH = 100;
const GEOCODING_CONCURRENCY = 10;
const GEOCODING_CHUNK_DELAY_MS = 100; // pause between chunks of 10
const GEOCODING_INTERVAL_MS = 60 * 60 * 1000;

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';

export async function geocodeAddress(
  address: string,
  city: string,
  province: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const cleanAddr = address.replace(/,?\s*Canad[aáà]/gi, '').trim();
    const parts = [cleanAddr, city, province, 'Canada'].map(s => s?.trim()).filter(Boolean);
    const query = parts.join(', ');

    if (MAPBOX_TOKEN) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=ca&limit=1&types=address,poi`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const data: any = await r.json();
        const feature = data.features?.[0];
        if (feature) {
          const [lng, lat] = feature.center;
          return { lat, lng };
        }
        return null; // Mapbox responded but no results — don't fall back
      }
    }

    // Fallback: Nominatim (only when Mapbox not configured)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=ca`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CanTrackCRM/1.0 (cantrack@vsm.ca)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_e) {}
  return null;
}

async function geocodePendingCompanies(pool: Pool): Promise<void> {
  const delay = MAPBOX_TOKEN ? GEOCODING_CHUNK_DELAY_MS : 1100;

  for (const table of ['ontario_companies', 'quebec_companies'] as const) {
    let processed = 0;
    let updated = 0;
    const failed = new Set<string>(); // IDs that couldn't be geocoded this run

    while (true) {
      const { rows } = await pool.query(`
        SELECT id, direccion, ciudad, provincia
        FROM ${table}
        WHERE (lat IS NULL OR lng IS NULL)
          AND direccion IS NOT NULL AND TRIM(direccion) NOT IN ('', 'null')
          ${failed.size > 0 ? `AND id != ALL($2)` : ''}
        ORDER BY id
        LIMIT $1
      `, failed.size > 0 ? [GEOCODING_BATCH, [...failed]] : [GEOCODING_BATCH]);

      if (rows.length === 0) break;

      if (MAPBOX_TOKEN) {
        // Parallel processing in chunks of GEOCODING_CONCURRENCY
        for (let i = 0; i < rows.length; i += GEOCODING_CONCURRENCY) {
          const chunk = rows.slice(i, i + GEOCODING_CONCURRENCY);
          const results = await Promise.all(
            chunk.map(c =>
              geocodeAddress(c.direccion, c.ciudad || '', c.provincia || '')
                .then(coords => ({ c, coords }))
            )
          );
          for (const { c, coords } of results) {
            if (coords) {
              await pool.query(
                `UPDATE ${table} SET lat = $1, lng = $2, updated_at = NOW() WHERE id = $3`,
                [coords.lat, coords.lng, c.id]
              );
              updated++;
            } else {
              failed.add(c.id);
            }
            processed++;
          }
          await new Promise(r => setTimeout(r, delay));
        }
      } else {
        // Sequential for Nominatim (strict 1 req/sec)
        for (const c of rows) {
          const coords = await geocodeAddress(c.direccion, c.ciudad || '', c.provincia || '');
          if (coords) {
            await pool.query(
              `UPDATE ${table} SET lat = $1, lng = $2, updated_at = NOW() WHERE id = $3`,
              [coords.lat, coords.lng, c.id]
            );
            updated++;
          } else {
            failed.add(c.id);
          }
          processed++;
          await new Promise(r => setTimeout(r, delay));
        }
      }

      if (processed % 100 === 0) {
        console.log(`[Geocoding] ${table}: ${updated}/${processed} geocodificadas`);
      }
    }

    if (processed > 0) {
      console.log(`[Geocoding] ${table} completado: ${updated}/${processed} geocodificadas`);
    }
  }
}

export function initCronJobs(pool: Pool): void {
  const provider = MAPBOX_TOKEN ? 'Mapbox (~10 req/s)' : 'Nominatim (1 req/s)';
  console.log(`[Geocoding] Servicio iniciado — geocodificando empresas en background (${provider})`);

  setTimeout(() => {
    geocodePendingCompanies(pool).catch(e =>
      console.error('[Geocoding] Error:', e.message)
    );
  }, 10000);

  setInterval(() => {
    geocodePendingCompanies(pool).catch(e =>
      console.error('[Geocoding] Error periódico:', e.message)
    );
  }, GEOCODING_INTERVAL_MS);

  // Campaign automation — check every 15 minutes
  setInterval(() => checkAndRunCampaigns(pool), 15 * 60 * 1000);
  setTimeout(() => checkAndRunCampaigns(pool), 60_000);

  // Workflow automation — check every 15 minutes, runs at 08:00 and 20:00 UTC
  setInterval(() => checkAndRunWorkflow(pool), 15 * 60 * 1000);
  setTimeout(() => checkAndRunWorkflow(pool), 90_000);

  // ── Fast sync: link unlinked jobs every 5 minutes ─────────────────────────
  setInterval(() => {
    runFastSync(pool).catch(e => console.error('[FastSync] Error:', e.message));
  }, 5 * 60 * 1000);
  setTimeout(() => runFastSync(pool), 30_000);

  // ── Enrichment cron: process pending companies every 8 seconds ─────────────
  // Also retries failed companies and unsticks processing ones
  const ENRICH_BATCH = 5;
  setInterval(async () => {
    // Unstick any companies stuck in 'processing' for more than 5 min
    await pool.query(`
      UPDATE ontario_companies SET enrichment_status = 'pending'
      WHERE enrichment_status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'
    `).catch(() => {});
    await pool.query(`
      UPDATE quebec_companies SET enrichment_status = 'pending'
      WHERE enrichment_status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'
    `).catch(() => {});

    // Process batch
    for (let i = 0; i < ENRICH_BATCH; i++) {
      await enrichNextPending(pool).catch(e => console.error('[EnrichCron] Error:', e.message));
      await new Promise(r => setTimeout(r, 1200));
    }
  }, 8_000);
  setTimeout(() => enrichNextPending(pool), 3_000);
}

async function runFastSync(pool: Pool): Promise<void> {
  const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const { rows } = await pool.query(`
    SELECT id, raw_company_name, location FROM jobs
    WHERE province_id IS NULL AND raw_company_name IS NOT NULL AND raw_company_name <> ''
    ORDER BY created_at ASC LIMIT 100
  `);

  let linked = 0;
  for (const job of rows) {
    const name = job.raw_company_name.trim();
    const slug = slugify(name);
    const nameNorm = name.toLowerCase();

    // Determine province from location
    const loc = (job.location || '').toLowerCase();
    const table = (loc.includes('qc') || loc.includes('quebec')) ? 'quebec_companies' : 'ontario_companies';
    const province = table === 'quebec_companies' ? 'quebec' : 'ontario';

    // Check if already exists in either province table
    let companyId: string | null = null;
    const existing = await pool.query(
      `SELECT id FROM ${table} WHERE slug = $1 OR LOWER(TRIM(nombre)) = $2 LIMIT 1`,
      [slug, nameNorm]
    );
    if (existing.rows.length > 0) {
      companyId = existing.rows[0].id;
    } else {
      // Check the other province table too
      const otherTable = table === 'quebec_companies' ? 'ontario_companies' : 'quebec_companies';
      const otherExisting = await pool.query(
        `SELECT id FROM ${otherTable} WHERE slug = $1 OR LOWER(TRIM(nombre)) = $2 LIMIT 1`,
        [slug, nameNorm]
      );
      if (otherExisting.rows.length > 0) {
        companyId = otherExisting.rows[0].id;
      } else {
        // Create new in the detected province table
        const ins = await pool.query(
          `INSERT INTO ${table} (nombre, slug, enrichment_status) VALUES ($1, $2, 'pending'::text) ON CONFLICT DO NOTHING RETURNING id`,
          [name, slug]
        );
        if (ins.rows.length > 0) companyId = ins.rows[0].id;
        else {
          const retry = await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [slug]);
          if (retry.rows.length > 0) companyId = retry.rows[0].id;
        }
      }
    }

    if (companyId) {
      await pool.query('UPDATE jobs SET province_id = $1, province_source = $2, updated_at = NOW() WHERE id = $3',
        [companyId, province, job.id]);
      linked++;
    }
  }

  if (linked > 0) console.log(`[FastSync] ${linked} jobs linked to province companies`);
}

/** Process ONE pending company that HAS a linked job */
async function enrichNextPending(pool: Pool): Promise<void> {
  const { EnrichmentService } = await import('../services/enrichment.service.js');
  const { JobClassifierService } = await import('../services/job-classifier.service.js');

  // Only enrich companies that have at least one job linked (came from webhook/sync)
  let lockResult;
  for (const table of ['ontario_companies', 'quebec_companies'] as const) {
    const src = table === 'ontario_companies' ? 'ontario' : 'quebec';
    lockResult = await pool.query(`
      UPDATE ${table} oc SET enrichment_status = 'processing'
      WHERE oc.id = (
        SELECT oc2.id FROM ${table} oc2
        JOIN jobs j ON j.province_id = oc2.id AND j.province_source = $1
        WHERE oc2.enrichment_status IN ('pending', 'failed')
        ORDER BY oc2.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ) RETURNING oc.id, oc.nombre AS name, $1 AS src
    `, [src]);
    if (lockResult.rows.length > 0) break;
  }
  if (!lockResult || lockResult.rows.length === 0) return;

  const { id: companyId, name: companyName, src: province } = lockResult.rows[0];
  const table = province === 'ontario' ? 'ontario_companies' : 'quebec_companies';

  try {
    const existing = await pool.query(
      `SELECT industry, website, description FROM ${table} WHERE id = $1`, [companyId]
    );
    if (existing.rows[0]?.industry || existing.rows[0]?.website || existing.rows[0]?.description) {
      await pool.query(`UPDATE ${table} SET enrichment_status = 'db_matched', updated_at = NOW() WHERE id = $1`, [companyId]);
      return;
    }

    const data = await EnrichmentService.enrichCompany(companyName);
    const hasData = data.industry || data.description || data.website;
    const newStatus = hasData ? 'scraped' : 'failed';

    const updates: Record<string, any> = { enrichment_status: newStatus };
    if (data.is_closed === true) updates.tipo = 'rojo';
    if (data.industry) updates.industry = data.industry;
    if (data.company_size) updates.company_size = data.company_size;
    if (data.website) updates.dominio_de_pagina = data.website;
    if (data.description) updates.descripcion = (data.description || '').substring(0, 500);
    if (data.hq_city) updates.ciudad = data.hq_city;
    if (data.hq_province) updates.provincia = data.hq_province;
    if (data.exact_address) updates.direccion = data.exact_address;
    if (data.phone) updates.telefono = data.phone;
    if (data.contact_email) updates.correo = data.contact_email;

    const setClauses = Object.keys(updates).map((k, i) => `"${k}" = $${i + 3}`);
    await pool.query(
      `UPDATE ${table} SET ${setClauses.join(', ')}, enrichment_provider = $2, enriched_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [companyId, data._provider ?? 'unknown', ...Object.values(updates)]
    );

    console.log(`[EnrichCron] ${hasData ? '✅' : '❌'} ${companyName} → ${newStatus} (${data._provider ?? 'unknown'})`);

    if (hasData) {
      JobClassifierService.suggestForCompany({
        name: companyName, industry: data.industry, description: data.description,
        company_size: data.company_size, hq_city: data.hq_city, hq_country: data.hq_country,
      }).then(suggestions => pool.query(
        `UPDATE ${table} SET suggested_services=$1, suggested_services_at=NOW() WHERE id=$2`,
        [JSON.stringify(suggestions.suggestions), companyId]
      )).catch(() => {});
    }
  } catch (error: any) {
    console.error(`[EnrichCron] Error enriching ${companyName}:`, error.message);
    await pool.query(`UPDATE ${table} SET enrichment_status = 'pending' WHERE id = $1`, [companyId]).catch(() => {});
  }
}

async function checkAndRunWorkflow(pool: Pool): Promise<void> {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();

    if (!WORKFLOW_HOURS_UTC.includes(currentHour)) return;

    // Build a date string "YYYY-MM-DD-HH" to deduplicate within the same hour
    const slotKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${currentHour}`;
    if (_workflowLastRun[currentHour] === slotKey) return;

    _workflowLastRun[currentHour] = slotKey;
    console.log(`[WorkflowCron] Iniciando ciclo automático (${currentHour}:xx UTC)…`);

    const result = await runWorkflowCycle(pool);
    const ok = result.steps.every(s => s.ok);
    console.log(
      `[WorkflowCron] Ciclo completado en ${(result.durationMs / 1000).toFixed(1)}s — ` +
      `${result.totalNewCompanies} nuevas, ${result.totalEnriched} enriquecidas, ` +
      `${result.totalExported} exportadas [${ok ? 'OK' : 'PARTIAL'}]`
    );
  } catch (e: any) {
    console.error('[WorkflowCron] Error:', e.message);
  }
}

async function checkAndRunCampaigns(pool: Pool): Promise<void> {
  try {
    const cfg = await getAutoConfig(pool);
    if (!cfg?.auto_enabled) return;

    const now = new Date();
    const currentHour = now.getUTCHours(); // compare in UTC
    const scheduleHour = cfg.auto_schedule_hour ?? 8;

    // Only run during the configured hour
    if (currentHour !== scheduleHour) return;

    // Only run once per day — check if last run was today
    if (cfg.auto_last_run_at) {
      const lastRun = new Date(cfg.auto_last_run_at);
      const sameDay =
        lastRun.getUTCFullYear() === now.getUTCFullYear() &&
        lastRun.getUTCMonth()    === now.getUTCMonth()    &&
        lastRun.getUTCDate()     === now.getUTCDate();
      if (sameDay) return;
    }

    console.log('[CampaignAuto] Iniciando envío automático de campañas…');
    const result = await runCampaignAutomation(pool);
    for (const r of result.regions) {
      console.log(`[CampaignAuto] ${r.region}: ${r.sent} enviados, ${r.skipped} omitidos${r.errors.length ? `, errores: ${r.errors.slice(0,3).join(' | ')}` : ''}`);
    }
  } catch (e: any) {
    console.error('[CampaignAuto] Error:', e.message);
  }
}
