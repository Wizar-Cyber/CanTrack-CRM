import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';

const ALLOWED_CANDIDATE_FIELDS = [
  'name', 'role', 'email', 'phone', 'location',
  'linkedin_url', 'resume_url', 'years_of_experience', 'bio', 'status',
];

export function createCandidatesRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // GET /api/candidates
  router.get('/', requireAuth, async (_req, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT c.*,
               COALESCE(json_agg(cs.skill ORDER BY cs.skill)
                        FILTER (WHERE cs.skill IS NOT NULL), '[]') AS skills
        FROM candidates c
        LEFT JOIN candidate_skills cs ON cs.candidate_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);
      return res.json(result.rows);
    } catch (error) {
      console.error('[Candidates GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener candidatos.' });
    }
  });

  // GET /api/candidates/:id
  router.get('/:id', requireAuth, async (req, res: Response) => {
    try {
      const { id } = req.params;
      const [cRes, appRes] = await Promise.all([
        pool.query(`
          SELECT c.*,
                 COALESCE(json_agg(cs.skill ORDER BY cs.skill)
                          FILTER (WHERE cs.skill IS NOT NULL), '[]') AS skills
          FROM candidates c
          LEFT JOIN candidate_skills cs ON cs.candidate_id = c.id
          WHERE c.id = $1
          GROUP BY c.id
        `, [id]),
        pool.query(`
          SELECT a.*, j.title AS job_title,
                 COALESCE(co.name, j.raw_company_name) AS company_name
          FROM applications a
          JOIN jobs j ON a.job_id = j.id
          LEFT JOIN companies co ON j.company_id = co.id
          WHERE a.candidate_id = $1
          ORDER BY a.created_at DESC
        `, [id]),
      ]);
      if (cRes.rows.length === 0) return res.status(404).json({ error: 'Candidato no encontrado.' });
      return res.json({ ...cRes.rows[0], applications: appRes.rows });
    } catch (error) {
      console.error('[Candidate GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener candidato.' });
    }
  });

  // POST /api/candidates
  router.post('/', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, bio, skills } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO candidates (name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name.trim(), role || null, email || null, phone || null, location || null,
         linkedin_url || null, resume_url || null, years_of_experience || null, bio || null],
      );
      const candidate = result.rows[0];
      if (Array.isArray(skills)) {
        for (const skill of skills) {
          if (skill?.trim()) {
            await client.query(
              'INSERT INTO candidate_skills (candidate_id, skill) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [candidate.id, skill.trim()],
            );
          }
        }
      }
      await client.query('COMMIT');
      return res.status(201).json({ ...candidate, skills: skills || [] });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un candidato con ese email.' });
      console.error('[Candidate POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear candidato.' });
    } finally {
      client.release();
    }
  });

  // PATCH /api/candidates/:id
  router.patch('/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const updates = Object.entries(req.body).filter(([k]) => ALLOWED_CANDIDATE_FIELDS.includes(k));

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      if (updates.length > 0) {
        const set = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
        await dbClient.query(
          `UPDATE candidates SET ${set}, updated_at = NOW() WHERE id = $1`,
          [id, ...updates.map(([, v]) => v)],
        );
      }
      if (Array.isArray(req.body.skills)) {
        await dbClient.query('DELETE FROM candidate_skills WHERE candidate_id = $1', [id]);
        for (const skill of req.body.skills) {
          if (skill?.trim()) {
            await dbClient.query(
              'INSERT INTO candidate_skills (candidate_id, skill) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [id, skill.trim()],
            );
          }
        }
      }
      const r = await dbClient.query(`
        SELECT c.*, COALESCE(json_agg(cs.skill ORDER BY cs.skill)
               FILTER (WHERE cs.skill IS NOT NULL), '[]') AS skills
        FROM candidates c LEFT JOIN candidate_skills cs ON cs.candidate_id = c.id
        WHERE c.id = $1 GROUP BY c.id
      `, [id]);
      if (r.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(404).json({ error: 'Candidato no encontrado.' });
      }
      await dbClient.query('COMMIT');
      return res.json(r.rows[0]);
    } catch (error: any) {
      await dbClient.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'Email ya en uso.' });
      console.error('[Candidate PATCH Error]:', error);
      return res.status(500).json({ error: 'Error al actualizar candidato.' });
    } finally {
      dbClient.release();
    }
  });

  // DELETE /api/candidates/:id
  router.delete('/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
    try {
      const r = await pool.query('DELETE FROM candidates WHERE id = $1 RETURNING id', [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Candidato no encontrado.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Candidate DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar candidato.' });
    }
  });

  return router;
}
