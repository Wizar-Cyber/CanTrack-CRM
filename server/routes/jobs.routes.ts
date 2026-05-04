import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { GeminiService } from '../services/gemini.service.js';

const ALLOWED_JOB_COLUMNS = new Set([
  'title', 'url', 'location', 'country', 'category',
  'application_type', 'is_easy_apply', 'is_active',
]);

const VALID_SOURCES = ['linkedin', 'indeed', 'glassdoor', 'company_website', 'other'];

export function createJobsRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // GET /api/jobs
  router.get('/', requireAuth, async (req, res: Response) => {
    try {
      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const search = ((req.query.search as string) || '').trim();

      const params: unknown[] = [limit, offset];
      let searchClause = '';
      if (search) {
        searchClause = `AND (j.title ILIKE $3 OR COALESCE(c.name, j.raw_company_name) ILIKE $3 OR j.location ILIKE $3)`;
        params.push(`%${search}%`);
      }

      const baseSelect = `
        SELECT j.*,
          COALESCE(c.name, j.raw_company_name) AS company_name,
          c.industry           AS company_industry,
          c.company_size       AS company_size,
          c.hq_city            AS company_hq_city,
          c.hq_country         AS company_hq_country,
          c.website            AS company_website,
          c.description        AS company_description,
          c.enrichment_status  AS company_enrichment_status
        FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.is_active = true ${searchClause}
      `;

      const [rowsResult, countResult] = await Promise.all([
        pool.query(`${baseSelect} ORDER BY j.created_at DESC LIMIT $1 OFFSET $2`, params),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM jobs j
           LEFT JOIN companies c ON j.company_id = c.id
           WHERE j.is_active = true ${searchClause}`,
          search ? [`%${search}%`] : [],
        ),
      ]);

      return res.json({
        data:       rowsResult.rows,
        total:      countResult.rows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      });
    } catch (error) {
      console.error('[DB Error] Fetching jobs:', error);
      return res.status(500).json({ error: 'Error al obtener trabajos.' });
    }
  });

  // GET /api/jobs/:id
  router.get('/:id', requireAuth, async (req, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name,
                c.industry, c.website, c.description, c.enrichment_status
         FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
         WHERE j.id = $1 AND j.is_active = true`,
        [req.params.id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Job GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener vacante.' });
    }
  });

  // POST /api/jobs
  router.post('/', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply } = req.body;
    if (!title || !source || !url)
      return res.status(400).json({ error: 'title, source y url son requeridos.' });
    if (!company_id && !raw_company_name)
      return res.status(400).json({ error: 'Se requiere company_id o raw_company_name.' });
    if (!VALID_SOURCES.includes(source))
      return res.status(400).json({ error: 'Fuente inválida. Usa: linkedin, indeed, glassdoor, company_website, other.' });
    try {
      const result = await pool.query(
        `INSERT INTO jobs (company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [company_id || null, raw_company_name || null, title.trim(), source, url.trim(),
         location || null, country || null, category || null, application_type || null, is_easy_apply || false],
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23503') return res.status(404).json({ error: 'La empresa especificada no existe.' });
      console.error('[Job POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear vacante.' });
    }
  });

  // PATCH /api/jobs/:id
  router.patch('/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_JOB_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      const result = await pool.query(
        `UPDATE jobs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING *`,
        [id, ...values],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true, job: result.rows[0] });
    } catch (error) {
      console.error('[Job PATCH Error]:', error);
      return res.status(500).json({ error: 'Error al actualizar vacante.' });
    }
  });

  // DELETE /api/jobs/:id — soft delete
  router.delete('/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        'UPDATE jobs SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING id',
        [id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Job DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar vacante.' });
    }
  });

  // GET /api/stats
  router.get('/stats/dashboard', requireAuth, async (_req, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM jobs WHERE is_active = true)::int AS total_jobs,
          (SELECT COUNT(*) FROM companies)::int AS total_companies,
          (SELECT COUNT(*) FROM companies WHERE enrichment_status != 'pending')::int AS enriched_companies,
          (SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending')::int AS pending_enrichment,
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

  // POST /api/mapping/prepare — AI form-fill payload
  router.post('/mapping/prepare', requireAuth, async (req: AuthRequest, res: Response) => {
    const { candidate, job } = req.body;
    if (!candidate || !job) return res.status(400).json({ error: 'candidate y job son requeridos.' });

    if (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY) {
      try {
        const prompt = `You are a recruitment assistant. Return ONLY a valid JSON object (no markdown) with this exact structure:
{
  "personal_info": { "first_name": "...", "last_name": "...", "email": "...", "phone": "...", "location": "..." },
  "links": { "linkedin": "...", "portfolio": "..." },
  "experience_summary": "2-sentence summary tailored for this role",
  "common_questions": [
    { "question": "Years of experience with ${(job.requiredSkills?.[0] || 'relevant tech')}", "answer": "..." },
    { "question": "Why are you a good fit for ${job.companyName}?", "answer": "..." }
  ]
}
Candidate: ${candidate.name}, ${candidate.yearsOfExperience} years exp, skills: ${candidate.skills?.join(', ')}.
Job: ${job.title} at ${job.companyName}. Required: ${job.requiredSkills?.join(', ')}.`;

        const apiKey = process.env.GROQ_API_KEY!;
        const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
        const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 512,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (aiRes.ok) {
          const json = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
          const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
          return res.json({ ...parsed, _provider: 'groq' });
        }
      } catch { /* fall through to fallback */ }
    }

    return res.json({
      personal_info: {
        first_name: candidate.name?.split(' ')[0] ?? '',
        last_name: candidate.name?.split(' ').slice(1).join(' ') ?? '',
        email: candidate.email ?? '',
        phone: candidate.phone ?? '',
        location: candidate.location ?? '',
      },
      links: { linkedin: candidate.linkedinUrl ?? '', portfolio: candidate.portfolioUrl ?? '' },
      _provider: 'fallback',
    });
  });

  // POST /api/gemini/cover-letter — kept on backend, API key never exposed
  router.post('/gemini/cover-letter', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { candidate, job } = req.body;
      if (!candidate || !job) return res.status(400).json({ error: 'candidate y job son requeridos.' });
      const result = await GeminiService.generateCoverLetter(candidate, job);
      return res.json(result);
    } catch (error) {
      console.error('[Cover Letter Error]:', error);
      return res.status(500).json({ error: 'Error generando carta de presentación.' });
    }
  });

  return router;
}
