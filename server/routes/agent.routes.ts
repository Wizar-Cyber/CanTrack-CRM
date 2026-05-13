import { Router } from 'express';
import { Pool } from 'pg';
import { ApplicationAgentService } from '../services/application-agent.service';
import { createRequireAuth, requireRole } from '../middleware/auth.middleware';

export function createAgentRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  router.get('/agent/status', requireAuth, (_req, res) => {
    const state = ApplicationAgentService.getState();
    const isBusinessHours = ApplicationAgentService.isBusinessHours();
    res.json({
      ...state,
      isBusinessHours,
      maxPerHour: parseInt(process.env.AGENT_MAX_PER_HOUR || '8'),
    });
  });

  router.post('/agent/start', requireAuth, requireRole('admin'), async (_req, res) => {
    try {
      await ApplicationAgentService.start(pool);
      res.json({ success: true, message: 'Agent started' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/agent/stop', requireAuth, requireRole('admin'), async (_req, res) => {
    try {
      ApplicationAgentService.stop();
      res.json({ success: true, message: 'Agent stopped' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/agent/stats', requireAuth, async (_req, res) => {
    try {
      const stats = await ApplicationAgentService.getStats(pool);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
