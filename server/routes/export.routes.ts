import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';
import { REGION_FILTER, isRegionFilterActive, companyRegionClause } from '../utils/region-filter.js';
import { runFlushNow, getExportRunning, isExportPending } from '../utils/export-helpers.js';

export function createExportRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);



  router.post('/api/export/companies-to-excel', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { limit = 1000, dryRun = false, excelPath } = req.body ?? {};

    const excelFilePath = excelPath || process.env.EXCEL_PATH ||
      'C:\\Users\\ripre\\OneDrive\\SmartFlow\\Proyecto Canada\\MUESTRA  LISTA QUEBEC.xlsx';

    try {
      // Contar cuántas empresas hay listas para exportar
      const countRes = await pool.query(`
        SELECT COUNT(*) FROM companies
        WHERE excel_exported_at IS NULL
          AND enrichment_status IN ('scraped', 'db_matched', 'verified')
          AND name IS NOT NULL
      `);
      const pending = parseInt(countRes.rows[0].count, 10);

      if (pending === 0) {
        return res.json({ success: true, message: 'No hay empresas nuevas para exportar.', pending: 0 });
      }

      // Importar el script dinámicamente y ejecutarlo en el mismo proceso
      const { runExport } = await import('../../scripts/export-to-excel.js').catch(() => ({ runExport: null })) as any;
      if (!runExport) {
        return res.status(500).json({ success: false, message: 'Script de exportación no disponible.' });
      }

      // Ejecutar de forma asíncrona sin bloquear
      const exportPromise = runExport({ limit, dryRun, excelFilePath, pool });
      exportPromise
        .then((result: any) => console.log('[Export] Completado:', result))
        .catch((err: Error) => console.error('[Export] Error:', err.message));

      return res.json({
        success: true,
        message: `Exportación iniciada. ${pending} empresas candidatas.`,
        pending,
        excelPath: excelFilePath,
        dryRun,
      });
    } catch (err: any) {
      console.error('[/api/export/companies-to-excel]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get('/api/export/stats', requireAuth, async (_req, res) => {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE excel_exported_at IS NULL AND enrichment_status IN ('scraped','db_matched','verified')) AS pending_export,
        COUNT(*) FILTER (WHERE excel_exported_at IS NOT NULL) AS already_exported,
        COUNT(*) FILTER (WHERE google_maps_status = 'closed') AS closed_companies
      FROM companies
    `);
    return res.json({ success: true, data: result.rows[0] });
  });

  router.get('/api/export/auto-status', requireAuth, async (_req, res) => {
    try {
      const target = (process.env.EXPORT_TARGET || 'excel').toLowerCase();
      const statsRes = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE excel_exported_at IS NULL AND sheets_exported_at IS NULL AND enrichment_status IN ('scraped','db_matched','verified') AND name IS NOT NULL) AS pending,
          COUNT(*) FILTER (WHERE excel_exported_at IS NOT NULL) AS exported_excel,
          COUNT(*) FILTER (WHERE sheets_exported_at IS NOT NULL) AS exported_sheets,
          GREATEST(MAX(excel_exported_at), MAX(sheets_exported_at)) AS last_exported_at
        FROM companies
      `);
      return res.json({
        success: true,
        target,
        running: getExportRunning(),
        pendingFlush: isExportPending(),
        sheetsConfigured: !!(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
        stats: statsRes.rows[0],
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/export/test-sheets', requireAuth, requireRole('admin'), async (_req, res) => {
    const sheetsId = process.env.GOOGLE_SHEETS_ID;
    const keyPath  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!sheetsId || !keyPath) {
      return res.status(400).json({ success: false, message: 'GOOGLE_SHEETS_ID y GOOGLE_SERVICE_ACCOUNT_KEY_PATH deben estar en .env' });
    }
    try {
      const { runSheetsExport } = await import('../../scripts/export-to-sheets.js') as any;
      // dry run — lee el sheet pero no escribe nada
      const r = await runSheetsExport({ limit: 0, dryRun: true, pool });
      return res.json({ success: true, message: `Conexión OK. El Sheet tiene ${r.totalRowsInSheet} filas.`, rows: r.totalRowsInSheet });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/export/run-now', requireAuth, requireRole('admin'), async (_req, res) => {
    if (getExportRunning()) {
      return res.json({ success: false, message: 'Ya hay una exportación en curso.' });
    }
    const countRes = await pool.query(`
      SELECT COUNT(*) AS n FROM companies
      WHERE excel_exported_at IS NULL
        AND enrichment_status IN ('scraped','db_matched','verified')
        AND name IS NOT NULL
    `);
    const pending = parseInt(countRes.rows[0].n, 10);
    if (pending === 0) {
      return res.json({ success: true, message: 'No hay empresas nuevas para exportar.', pending: 0 });
    }
    runFlushNow(pool);
    return res.json({ success: true, message: `Exportación iniciada. ${pending} empresas candidatas.`, pending });
  });

  router.post('/api/export/province-sheets', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const province = String(req.body.province ?? '').toLowerCase();
    if (province && province !== 'ontario' && province !== 'quebec') {
      return res.status(400).json({ error: 'province debe ser ontario, quebec o vacío para ambas' });
    }
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const args = ['scripts/export-province-sheets.ts'];
      if (province) args.push(province);

      // Run in background — respond immediately
      execFileAsync('npx', ['ts-node', ...args], {
        cwd: process.cwd(),
        env: process.env,
        timeout: 120_000,
      }).then(({ stdout }) => {
        console.log('[ProvinceSheets] Export done:', stdout.slice(-200));
      }).catch(err => {
        console.error('[ProvinceSheets] Export error:', err.message);
      });

      return res.json({
        success: true,
        message: `Export a Google Sheets iniciado para: ${province || 'ontario + quebec'}. Revisa los logs del servidor.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
