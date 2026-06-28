import { Router, Response, Request } from 'express';
import { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import {
  REGION_FILTER, isRegionFilterActive, companyRegionClause, jobRegionClause, isRegionMatch,
} from '../utils/region-filter.js';

export function createHealthRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // Health check endpoint (public, with DB connectivity check)
  router.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
    }
  });

  // Mapbox public token for frontend map rendering
  router.get('/config/mapbox', requireAuth, (_req, res) => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_TOKEN || '';
    res.json({ token });
  });

  // GET /api/geocoding/status — cuántas empresas tienen/necesitan coordenadas
  router.get('/geocoding/status', requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT region, total, con_coords, sin_coords FROM (
          SELECT 'ontario' AS region,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int AS con_coords,
            COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) NOT IN ('','null') AND (lat IS NULL OR lng IS NULL))::int AS sin_coords
          FROM ontario_companies
          UNION ALL
          SELECT 'quebec',
            COUNT(*)::int,
            COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int,
            COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) NOT IN ('','null') AND (lat IS NULL OR lng IS NULL))::int
          FROM quebec_companies
        ) t
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Devuelve el estado del filtro regional para que el front lo muestre en UI */
  router.get('/region-filter', requireAuth, async (_req, res) => {
    res.json({
      active:   isRegionFilterActive(),
      province: REGION_FILTER || null,
    });
  });

  // GET /api/stats — real DB counts
  router.get('/stats', requireAuth, async (_req, res) => {
    try {
      // Filtro regional: jobs se cuentan solo si su company (o su location para no vinculadas)
      // cumple la región. Companies se cuentan solo si caen en la región.
      const cRegion = companyRegionClause('c');
      const jRegion = jobRegionClause('j', 'c');
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM jobs j LEFT JOIN companies c ON j.company_id=c.id
            WHERE j.is_active = true AND ${jRegion})::int AS total_jobs,
          (SELECT COUNT(*) FROM companies c WHERE ${cRegion})::int AS total_companies,
          (SELECT COUNT(*) FROM companies c WHERE enrichment_status != 'pending' AND ${cRegion})::int AS enriched_companies,
          (SELECT COUNT(*) FROM companies c WHERE enrichment_status = 'pending' AND ${cRegion})::int AS pending_enrichment,
          (SELECT COUNT(*) FROM applications)::int AS total_applications,
          (SELECT COUNT(*) FROM candidates)::int AS total_candidates,
          (SELECT COUNT(*) FROM candidates WHERE status = 'Available')::int AS active_candidates,
          (SELECT COUNT(*) FROM candidates WHERE status = 'Placed')::int AS placed_candidates
      `);
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Stats Error]:', error);
      return res.status(500).json({ error: 'Error al obtener estadísticas.' });
    }
  });

  /** GET /api/dashboard — datos reales para el dashboard principal */
  router.get('/dashboard', requireAuth, async (_req, res) => {
    try {
      const [main, geo, campaigns, recent, suppression, auto, enrichment] = await Promise.all([
        // Totales Ontario + Quebec
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM ontario_companies WHERE is_duplicate = FALSE) AS ontario_total,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE is_duplicate = FALSE) AS quebec_total,
            (SELECT COUNT(*)::int FROM ontario_companies WHERE is_duplicate = FALSE AND COALESCE(LOWER(status),'') NOT IN ('closed','cerrada','inactive','inactiva')) AS ontario_active,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE is_duplicate = FALSE AND COALESCE(LOWER(status),'') NOT IN ('closed','cerrada','inactive','inactiva')) AS quebec_active,
            (SELECT COUNT(*)::int FROM ontario_companies WHERE is_duplicate = FALSE AND correo IS NOT NULL AND correo <> '' AND correo LIKE '%@%' AND COALESCE(email_status,'unknown') NOT IN ('bounced','invalid','unsubscribed','blocked')) AS ontario_with_email,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE is_duplicate = FALSE AND correo IS NOT NULL AND correo <> '' AND correo LIKE '%@%' AND COALESCE(email_status,'unknown') NOT IN ('bounced','invalid','unsubscribed','blocked')) AS quebec_with_email,
            (SELECT COUNT(*)::int FROM ontario_companies WHERE is_duplicate = FALSE AND lat IS NOT NULL) AS ontario_geocoded,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE is_duplicate = FALSE AND lat IS NOT NULL) AS quebec_geocoded,
            (SELECT COUNT(*)::int FROM ontario_companies WHERE is_duplicate = FALSE AND COALESCE(email_status,'unknown') IN ('bounced','invalid','unsubscribed','blocked')) AS ontario_blocked,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE is_duplicate = FALSE AND COALESCE(email_status,'unknown') IN ('bounced','invalid','unsubscribed','blocked')) AS quebec_blocked
        `),
        // Geocodificación pendiente
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM ontario_companies WHERE lat IS NULL AND direccion IS NOT NULL AND TRIM(direccion) <> '') AS ontario_pending_geo,
            (SELECT COUNT(*)::int FROM quebec_companies  WHERE lat IS NULL AND direccion IS NOT NULL AND TRIM(direccion) <> '') AS quebec_pending_geo
        `),
        // Campañas: historial reciente + totales
        pool.query(`
          SELECT
            COUNT(*)::int AS total_sent,
            COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '30 days')::int AS sent_last_30d,
            COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '7 days')::int  AS sent_last_7d,
            COUNT(DISTINCT company_email)::int AS unique_companies,
            MAX(sent_at) AS last_sent_at
          FROM email_campaign_log
        `),
        // Últimas 6 empresas agregadas (Ontario + Quebec combinadas)
        pool.query(`
          SELECT id, nombre, correo, work, ciudad, provincia, 'ontario' AS region, created_at
          FROM ontario_companies WHERE is_duplicate = FALSE
          UNION ALL
          SELECT id, nombre, correo, work, ciudad, provincia, 'quebec' AS region, created_at
          FROM quebec_companies WHERE is_duplicate = FALSE
          ORDER BY created_at DESC LIMIT 6
        `),
        // Supresión
        pool.query(`SELECT COUNT(*)::int AS total FROM email_suppression`),
        // Automatización
        pool.query(`SELECT auto_enabled, auto_last_run_at FROM campaign_config LIMIT 1`),
        // Enrichment del CRM (companies table)
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE enrichment_status = 'pending')::int   AS pending,
            COUNT(*) FILTER (WHERE enrichment_status != 'pending')::int  AS done
          FROM companies
        `),
      ]);

      return res.json({
        companies: { ...main.rows[0], ...geo.rows[0] },
        campaigns: campaigns.rows[0],
        recent:    recent.rows,
        suppression: suppression.rows[0],
        automation: auto.rows[0] ?? {},
        enrichment: enrichment.rows[0],
      });
    } catch (err: any) {
      console.error('[Dashboard Error]:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  router.get('/service-types', requireAuth, (_req, res) => {
    res.json({ success: true, data: SERVICE_TYPES, total: SERVICE_TYPES.length });
  });

  /** Lista compacta (para selectors en UI) */
  router.get('/service-types/compact', requireAuth, (_req, res) => {
    res.json({ success: true, data: SERVICE_TYPES_COMPACT, total: SERVICE_TYPES_COMPACT.length });
  });

  return router;
}
