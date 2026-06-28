import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';

export function createWorkflowRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  router.post('/run-now', requireAuth, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
    try {
      const { runWorkflowCycle } = await import('../services/workflow.service.js');
      const result = await runWorkflowCycle(pool);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/status', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT job, status, message, created_at
        FROM automation_log
        WHERE job = 'workflow_cycle'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      const last = rows[0] ?? null;
      res.json({
        lastRun: last ? {
          at:      last.created_at,
          status:  last.status,
          message: last.message,
        } : null,
        history: rows,
        nextRunsUTC: ['08:00', '20:00'],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
