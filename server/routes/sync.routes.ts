import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { EnrichmentService } from '../services/enrichment.service.js';
import { JobClassifierService } from '../services/job-classifier.service.js';
import { REGION_FILTER, isRegionFilterActive, isRegionMatch } from '../utils/region-filter.js';
import { slugify } from '../utils/slug.js';

export function createSyncRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // POST /api/sync/scraped-jobs
  // Lee vacantes en jobs donde company_id IS NULL (scraper insertó con raw_company_name),
  // crea/vincula la empresa y la deja pending para el queue de enriquecimiento.
  // También absorbe scraped_jobs legacy para compatibilidad hacia atrás.
  router.post('/scraped-jobs', requireAuth, async (_req: AuthRequest, res) => {
    let linkedJobs  = 0;
    let newCompanies = 0;

    try {
      // ── Paso 1: jobs directos del scraper (company_id IS NULL, tienen raw_company_name) ──
      const unlinkedResult = await pool.query(`
        SELECT id, raw_company_name, title, source, url, location, country, created_at, service_type_id
        FROM jobs
        WHERE company_id IS NULL
          AND raw_company_name IS NOT NULL
          AND raw_company_name <> ''
        ORDER BY created_at ASC
        LIMIT 200
      `);

      let skippedRegion = 0;
      for (const job of unlinkedResult.rows) {
        const name = job.raw_company_name as string;
        // Filtro regional: si la vacante tiene location/country y NO coincide con la región → skip.
        // Si no tiene location, lo dejamos pasar (la región se filtrará tras enriquecimiento).
        if (isRegionFilterActive() && (job.location || job.country)) {
          if (!isRegionMatch(job.location, job.country, job.title, name)) {
            skippedRegion++;
            // Marcar como is_active=false para no re-procesar
            await pool.query(`UPDATE jobs SET is_active=false, updated_at=NOW() WHERE id=$1`, [job.id]);
            continue;
          }
        }
        const slug = slugify(name);
        // Clasificar la vacante si aún no lo está
        if (!job.service_type_id && job.title) {
          JobClassifierService.classifyJob(job.title, '', name, '')
            .then(r => pool.query(
              `UPDATE jobs SET service_type_id=$1, service_match_confidence=$2, service_match_reasoning=$3, service_match_provider=$4 WHERE id=$5`,
              [r.service_id, r.confidence, r.reasoning, r._provider, job.id]
            ))
            .catch(err => console.warn('[Sync Classify unlinked]', err.message));
        }

        // Buscar o crear la empresa
        const insertComp = await pool.query(
          `INSERT INTO companies (name, slug, enrichment_status)
           VALUES ($1, $2, 'pending'::enrichment_status_enum)
           ON CONFLICT (slug) DO NOTHING
           RETURNING id`,
          [name, slug]
        );

        let companyId: string;
        if (insertComp.rows.length > 0) {
          companyId = insertComp.rows[0].id;
          newCompanies++;
        } else {
          const found = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
          if (found.rows.length === 0) continue;
          companyId = found.rows[0].id;
        }

        // Vincular la vacante a la empresa
        await pool.query(
          `UPDATE jobs SET company_id = $1, updated_at = NOW() WHERE id = $2`,
          [companyId, job.id]
        );
        linkedJobs++;
      }

      // ── Paso 2: scraped_jobs legacy que aún no tienen vacante en jobs (por URL) ──
      const legacyResult = await pool.query(`
        SELECT DISTINCT ON (sj.url_postulacion)
          sj.fuente, sj.titulo, sj.empresa, sj.url_postulacion, sj.fecha_creacion
        FROM scraped_jobs sj
        WHERE sj.empresa IS NOT NULL AND sj.titulo IS NOT NULL AND sj.url_postulacion IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.url = sj.url_postulacion)
        ORDER BY sj.url_postulacion, sj.fecha_creacion DESC
        LIMIT 200
      `);

      const VALID_SOURCES = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);
      for (const sj of legacyResult.rows) {
        // Filtro regional: scraped_jobs legacy no tiene location, así que solo
        // podemos inspeccionar título + empresa. Si el filtro está activo y no
        // hay coincidencia, skip — no se crea ni la vacante ni la empresa.
        if (isRegionFilterActive() && !isRegionMatch(sj.titulo, sj.empresa)) {
          skippedRegion++;
          continue;
        }
        const slug = slugify(sj.empresa);
        const insertComp = await pool.query(
          `INSERT INTO companies (name, slug, enrichment_status)
           VALUES ($1, $2, 'pending'::enrichment_status_enum)
           ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [sj.empresa, slug]
        );
        let companyId: string;
        if (insertComp.rows.length > 0) {
          companyId = insertComp.rows[0].id;
          newCompanies++;
        } else {
          const found = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
          if (found.rows.length === 0) continue;
          companyId = found.rows[0].id;
        }
        const source = VALID_SOURCES.has(sj.fuente?.toLowerCase()) ? sj.fuente.toLowerCase() : 'other';
        try {
          const ins = await pool.query(
            `INSERT INTO jobs (company_id, title, source, url, raw_company_name, created_at)
             VALUES ($1, $2, $3::job_source_enum, $4, $5, $6)
             RETURNING id`,
            [companyId, sj.titulo, source, sj.url_postulacion, sj.empresa, sj.fecha_creacion ?? new Date()]
          );
          linkedJobs++;
          // Clasificar la vacante en background — mapea a uno de los 52 servicios
          if (ins.rowCount) {
            const newJobId = ins.rows[0].id;
            JobClassifierService.classifyJob(sj.titulo, '', sj.empresa, '')
              .then(r => pool.query(
                `UPDATE jobs SET service_type_id=$1, service_match_confidence=$2, service_match_reasoning=$3, service_match_provider=$4 WHERE id=$5`,
                [r.service_id, r.confidence, r.reasoning, r._provider, newJobId]
              ))
              .catch(err => console.warn('[Sync Classify]', err.message));
          }
        } catch { /* duplicado — ignorar */ }
      }

      const total = linkedJobs;
      console.log(`[Sync] ${total} vacantes vinculadas, ${newCompanies} empresas nuevas${skippedRegion ? `, ${skippedRegion} descartadas por región (${REGION_FILTER})` : ''}.`);
      const regionNote = skippedRegion ? ` · ${skippedRegion} descartadas fuera de ${REGION_FILTER}` : '';
      return res.json({
        synced: total,
        newCompanies,
        skippedRegion,
        regionFilter: isRegionFilterActive() ? REGION_FILTER : null,
        message: total === 0
          ? `Todo al día — no hay vacantes sin empresa${regionNote}.`
          : `${total} vacantes sincronizadas, ${newCompanies} empresas nuevas para enriquecer${regionNote}.`,
      });
    } catch (error) {
      console.error('[Sync Error]:', error);
      return res.status(500).json({ error: 'Error sincronizando vacantes.' });
    }
  });



  return router;
}
