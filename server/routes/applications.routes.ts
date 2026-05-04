import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { AutomationService } from '../services/automation.service.js';

const VALID_STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Placed'];

export function createApplicationsRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // POST /api/apply/auto — automated application via Playwright/API
  router.post('/auto', requireAuth, async (req: AuthRequest, res: Response) => {
    const { job, candidate } = req.body;
    if (!job?.id || !candidate?.id) return res.status(400).json({ success: false, message: 'job.id y candidate.id son requeridos.' });
    try {
      const result = await AutomationService.executeApplication(job, candidate);
      const status = result.success ? 'Applied' : 'Saved';

      await pool.query(
        `INSERT INTO applications (job_id, candidate_id, status, notes)
         VALUES ($1, $2, $3::application_status_enum, $4)
         ON CONFLICT (job_id, candidate_id)
         DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()`,
        [job.id, candidate.id, status, JSON.stringify({ logs: result.logs, strategy: result.strategy })],
      );

      return res.json(result);
    } catch (error) {
      console.error('[Automation Error]', error);
      return res.status(500).json({ success: false, message: 'Error en automatización.' });
    }
  });

  // POST /api/apply — manual application record
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const { jobId, candidateId } = req.body;
    if (!jobId || !candidateId) return res.status(400).json({ success: false, message: 'jobId y candidateId requeridos.' });
    try {
      await pool.query(
        `INSERT INTO applications (job_id, candidate_id, status)
         VALUES ($1, $2, 'Applied'::application_status_enum)
         ON CONFLICT (job_id, candidate_id) DO NOTHING`,
        [jobId, candidateId],
      );
      return res.json({ success: true, message: 'Aplicación registrada.' });
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23503') return res.status(404).json({ success: false, message: 'Job o candidato no encontrado.' });
      console.error('[Apply POST Error]:', error);
      return res.status(500).json({ success: false, message: 'Error registrando aplicación.' });
    }
  });

  // PATCH /api/apply/status
  router.patch('/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const { jobId, candidateId, status } = req.body;
    if (!jobId || !candidateId || !status) return res.status(400).json({ success: false, message: 'Faltan campos.' });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Estado inválido.' });
    try {
      const result = await pool.query(
        `UPDATE applications SET status = $1::application_status_enum, updated_at = NOW()
         WHERE job_id = $2 AND candidate_id = $3 RETURNING id`,
        [status, jobId, candidateId],
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Aplicación no encontrada.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Apply PATCH Error]:', error);
      return res.status(500).json({ success: false, message: 'Error actualizando estado.' });
    }
  });

  // GET /api/apply/status
  router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const { jobId, candidateId } = req.query as { jobId?: string; candidateId?: string };
    if (!jobId || !candidateId) return res.status(400).json({ success: false, message: 'Faltan jobId o candidateId.' });
    try {
      const result = await pool.query(
        'SELECT status, notes, updated_at FROM applications WHERE job_id = $1 AND candidate_id = $2',
        [jobId, candidateId],
      );
      if (result.rows.length === 0) return res.json({ success: true, status: 'Saved' });
      return res.json({ success: true, ...result.rows[0] });
    } catch (error) {
      console.error('[Apply GET Error]:', error);
      return res.status(500).json({ success: false, message: 'Error consultando aplicación.' });
    }
  });

  return router;
}
