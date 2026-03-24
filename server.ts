import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { AutomationService, AutomationLogEntry, VerificationStatus } from "./server/services/automation.service.js";
import { GeminiService } from "./server/services/gemini.service.js";
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole, AuthRequest } from './server/middleware/auth.middleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Validations ───────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET no está configurado en .env");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("❌ FATAL: DATABASE_URL no está configurado en .env");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

// ── PostgreSQL Pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.connect((err) => {
  if (err) {
    console.error("❌ Error conectando a PostgreSQL:", err.message);
  } else {
    console.log("✅ PostgreSQL conectado correctamente.");
  }
});

// ── Slug generator (handles accents + special chars) ─────────────────────────
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Column allowlist for safe dynamic updates ─────────────────────────────────
const ALLOWED_COMPANY_COLUMNS = new Set([
  'enrichment_status', 'industry', 'sector', 'hq_city', 'hq_province',
  'hq_country', 'exact_address', 'website', 'description', 'known_ats_portal',
  'confidence_score', 'needs_manual_review', 'company_size', 'is_publicly_traded',
  'stock_ticker', 'legal_name', 'name',
]);

const ALLOWED_JOB_COLUMNS = new Set([
  'title', 'url', 'location', 'country', 'category',
  'application_type', 'is_easy_apply', 'is_active', 'raw_company_name',
]);

interface ApplicationData {
  jobId: string;
  candidateId: string;
  status: string;
  logs?: AutomationLogEntry[];
  verification?: VerificationStatus;
  applicationId?: string;
  strategy?: string;
  updatedAt: string;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // ── Rate limiters ───────────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const setupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Límite de configuración alcanzado.' },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function signToken(payload: object) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  function sanitizeUser(row: any) {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  // ==========================================================================
  // AUTH ROUTES (public)
  // ==========================================================================

  // POST /api/auth/setup — Create first admin (only if no users exist)
  app.post('/api/auth/setup', setupLimiter, async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName)
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Email inválido.' });

    try {
      const existing = await pool.query('SELECT id FROM users LIMIT 1');
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'Ya existe un usuario. Usa el login.' });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim()]
      );
      const user = sanitizeUser(result.rows[0]);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      console.log(`✅ Admin inicial creado: ${email}`);
      return res.status(201).json({ token, user });
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Setup Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()]
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: 'Credenciales inválidas.' });

      const row = result.rows[0];
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

      const user = sanitizeUser(row);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      return res.json({ token, user });
    } catch (error) {
      console.error('[Login Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ==========================================================================
  // AUTH ROUTES (protected)
  // ==========================================================================

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [req.user!.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Me Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nombre y apellido requeridos.' });
    try {
      const result = await pool.query(
        'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [firstName.trim(), lastName.trim(), req.user!.id]
      );
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Profile Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  app.patch('/api/auth/password', requireAuth, async (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Ambas contraseñas son requeridas.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'Nueva contraseña mínimo 8 caracteres.' });
    try {
      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Password Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ==========================================================================
  // USER MANAGEMENT (admin only)
  // ==========================================================================

  app.get('/api/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at ASC'
      );
      return res.json(result.rows.map(sanitizeUser));
    } catch (error) {
      console.error('[Users List Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  app.post('/api/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { email, password, firstName, lastName, role } = req.body;
    const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];
    if (!email || !password || !firstName || !lastName || !role)
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido.' });
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim(), role]
      );
      return res.status(201).json(sanitizeUser(result.rows[0]));
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Create User Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  app.patch('/api/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol.' });
    if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    try {
      const result = await pool.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [role, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Update Role Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    try {
      const result = await pool.query(
        'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Delete User Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ==========================================================================
  // DATA ROUTES (protected)
  // ==========================================================================

  app.get('/api/companies', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM companies ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (error) {
      console.error('[DB Error] Fetching companies:', error);
      res.status(500).json({ error: 'Error al obtener empresas.' });
    }
  });

  app.get('/api/jobs', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          j.*,
          COALESCE(c.name, j.raw_company_name) AS company_name,
          c.industry           AS company_industry,
          c.sector             AS company_sector,
          c.company_size       AS company_size,
          c.hq_city            AS company_hq_city,
          c.hq_country         AS company_hq_country,
          c.website            AS company_website,
          c.description        AS company_description,
          c.enrichment_status  AS company_enrichment_status,
          c.confidence_score   AS company_confidence_score
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.is_active = true
        ORDER BY j.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('[DB Error] Fetching jobs:', error);
      res.status(500).json({ error: 'Error al obtener trabajos.' });
    }
  });

  // GET /api/stats — real DB counts
  app.get('/api/stats', requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM jobs WHERE is_active = true)::int AS total_jobs,
          (SELECT COUNT(*) FROM companies)::int AS total_companies,
          (SELECT COUNT(*) FROM companies WHERE enrichment_status != 'pending')::int AS enriched_companies,
          (SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending')::int AS pending_enrichment,
          (SELECT COUNT(*) FROM companies WHERE needs_manual_review = true)::int AS needs_review,
          (SELECT COUNT(*) FROM applications)::int AS total_applications
      `);
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Stats Error]:', error);
      return res.status(500).json({ error: 'Error al obtener estadísticas.' });
    }
  });

  // GET /api/companies/:id — single company
  app.get('/api/companies/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Company GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener empresa.' });
    }
  });

  // POST /api/companies — create company
  app.post('/api/companies', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { name, legal_name, website, industry } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido.' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    try {
      const result = await pool.query(
        `INSERT INTO companies (name, slug, legal_name, website, industry, enrichment_status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [name.trim(), slug, legal_name || null, website || null, industry || null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una empresa con ese nombre.' });
      console.error('[Company POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear empresa.' });
    }
  });

  // GET /api/jobs/:id — single job
  app.get('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name,
                c.industry, c.website, c.description, c.enrichment_status
         FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
         WHERE j.id = $1 AND j.is_active = true`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('[Job GET Error]:', error);
      return res.status(500).json({ error: 'Error al obtener vacante.' });
    }
  });

  // POST /api/jobs — create job
  // Acepta dos modos:
  //   A) company_id + title + source + url  → vacante completa vinculada
  //   B) raw_company_name + title + source + url → scraper inserta sin company (sync la vinculará)
  app.post('/api/jobs', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply } = req.body;
    const VALID_SOURCES = ['linkedin', 'indeed', 'glassdoor', 'company_website', 'other'];
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
         location || null, country || null, category || null, application_type || null, is_easy_apply || false]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23503') return res.status(404).json({ error: 'La empresa especificada no existe.' });
      console.error('[Job POST Error]:', error);
      return res.status(500).json({ error: 'Error al crear vacante.' });
    }
  });

  // PATCH /api/jobs/:id — update job fields
  app.patch('/api/jobs/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_JOB_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      const result = await pool.query(
        `UPDATE jobs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING *`,
        [id, ...values]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true, job: result.rows[0] });
    } catch (error) {
      console.error('[Job PATCH Error]:', error);
      return res.status(500).json({ error: 'Error al actualizar vacante.' });
    }
  });

  // DELETE /api/jobs/:id — soft delete (is_active = false)
  app.delete('/api/jobs/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        'UPDATE jobs SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING id',
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vacante no encontrada.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Job DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar vacante.' });
    }
  });

  // POST /api/gemini/enrich — enriquece una empresa específica (comprueba datos antes de llamar a Gemini)
  app.post('/api/gemini/enrich', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { companyId, companyName } = req.body;
    if (!companyId || !companyName) return res.status(400).json({ error: 'companyId y companyName son requeridos.' });
    try {
      // 1. Verificar si ya tiene datos en BD (no desperdiciar llamadas Gemini)
      const existing = await pool.query(
        'SELECT industry, website, description, enrichment_status FROM companies WHERE id = $1',
        [companyId]
      );
      const row = existing.rows[0];
      if (row && (row.industry || row.website || row.description) && row.enrichment_status !== 'pending') {
        // Ya tiene datos — solo confirmar como db_matched
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId]
        );
        return res.json({ success: true, source: 'db_matched', data: row });
      }

      // 2. No tiene datos → llamar a Gemini
      const data = await GeminiService.enrichCompany(companyName);
      const updatePayload: Record<string, any> = { enrichment_status: 'scraped' };
      if (data.industry) updatePayload.industry = data.industry;
      if (data.sector) updatePayload.sector = data.sector;
      if (data.company_size) updatePayload.company_size = data.company_size;
      if (data.hq_city) updatePayload.hq_city = data.hq_city;
      if (data.hq_country) updatePayload.hq_country = data.hq_country;
      if (data.website) updatePayload.website = data.website;
      if (data.description) updatePayload.description = data.description;
      if (data.is_publicly_traded !== undefined) updatePayload.is_publicly_traded = data.is_publicly_traded;
      if (data.confidence_score !== undefined) {
        updatePayload.confidence_score = data.confidence_score;
        updatePayload.needs_manual_review = data.confidence_score < 60;
      }
      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values]
      );
      return res.json({ success: true, source: 'gemini', data });
    } catch (error) {
      console.error('[Gemini Enrich Error]:', error);
      return res.status(500).json({ error: 'Error en enriquecimiento con Gemini.' });
    }
  });

  // POST /api/enrichment/process-next — procesa UNA empresa pending de la cola (llama el frontend cada N segundos)
  app.post('/api/enrichment/process-next', requireAuth, async (req: AuthRequest, res) => {
    try {
      // Tomar la siguiente empresa pending (con lock para evitar race conditions)
      const lockResult = await pool.query(
        `UPDATE companies SET enrichment_status = 'processing'
         WHERE id = (
           SELECT id FROM companies WHERE enrichment_status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
         ) RETURNING id, name`
      );
      if (lockResult.rows.length === 0) return res.json({ done: true, message: 'No hay empresas pendientes.' });

      const { id: companyId, name: companyName } = lockResult.rows[0];

      // Verificar si ya tiene datos en BD
      const existing = await pool.query(
        'SELECT industry, website, description FROM companies WHERE id = $1',
        [companyId]
      );
      const row = existing.rows[0];

      if (row && (row.industry || row.website || row.description)) {
        // Ya tiene datos — db_matched
        await pool.query(
          `UPDATE companies SET enrichment_status = 'db_matched', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [companyId]
        );
        return res.json({ done: false, source: 'db_matched', companyId, companyName });
      }

      // Llamar a Gemini para enriquecer
      const data = await GeminiService.enrichCompany(companyName);
      const updatePayload: Record<string, any> = { enrichment_status: 'scraped' };
      if (data.industry) updatePayload.industry = data.industry;
      if (data.sector) updatePayload.sector = data.sector;
      if (data.company_size) updatePayload.company_size = data.company_size;
      if (data.hq_city) updatePayload.hq_city = data.hq_city;
      if (data.hq_country) updatePayload.hq_country = data.hq_country;
      if (data.website) updatePayload.website = data.website;
      if (data.description) updatePayload.description = data.description;
      if (data.is_publicly_traded !== undefined) updatePayload.is_publicly_traded = data.is_publicly_traded;
      if (data.confidence_score !== undefined) {
        updatePayload.confidence_score = data.confidence_score;
        updatePayload.needs_manual_review = data.confidence_score < 60;
      }
      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values]
      );

      // Cuántas quedan
      const countResult = await pool.query(`SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending'`);
      const remaining = parseInt(countResult.rows[0].count, 10);
      return res.json({ done: remaining === 0, source: 'gemini', companyId, companyName, data, remaining });
    } catch (error: any) {
      // Si la transacción falló, liberar el lock
      console.error('[process-next Error]:', error);
      await pool.query(
        `UPDATE companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`
      ).catch(() => {});
      return res.status(500).json({ error: 'Error procesando cola de enriquecimiento.' });
    }
  });

  // GET /api/enrichment/status — cuántas empresas pending/processing quedan
  app.get('/api/enrichment/status', requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE enrichment_status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE enrichment_status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE enrichment_status = 'scraped') AS scraped,
          COUNT(*) FILTER (WHERE enrichment_status = 'db_matched') AS db_matched
        FROM companies
      `);
      const row = result.rows[0];
      return res.json({
        pending: parseInt(row.pending, 10),
        processing: parseInt(row.processing, 10),
        scraped: parseInt(row.scraped, 10),
        db_matched: parseInt(row.db_matched, 10),
      });
    } catch (error) {
      console.error('[Enrichment Status Error]:', error);
      return res.status(500).json({ error: 'Error al obtener estado.' });
    }
  });

  // POST /api/sync/scraped-jobs
  // Lee vacantes en jobs donde company_id IS NULL (scraper insertó con raw_company_name),
  // crea/vincula la empresa y la deja pending para el queue de enriquecimiento.
  // También absorbe scraped_jobs legacy para compatibilidad hacia atrás.
  app.post('/api/sync/scraped-jobs', requireAuth, async (_req: AuthRequest, res) => {
    let linkedJobs  = 0;
    let newCompanies = 0;

    try {
      // ── Paso 1: jobs directos del scraper (company_id IS NULL, tienen raw_company_name) ──
      const unlinkedResult = await pool.query(`
        SELECT id, raw_company_name, source, url, created_at
        FROM jobs
        WHERE company_id IS NULL
          AND raw_company_name IS NOT NULL
          AND raw_company_name <> ''
        ORDER BY created_at ASC
        LIMIT 200
      `);

      for (const job of unlinkedResult.rows) {
        const name = job.raw_company_name as string;
        const slug = slugify(name);

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
          await pool.query(
            `INSERT INTO jobs (company_id, title, source, url, raw_company_name, created_at)
             VALUES ($1, $2, $3::job_source_enum, $4, $5, $6)`,
            [companyId, sj.titulo, source, sj.url_postulacion, sj.empresa, sj.fecha_creacion ?? new Date()]
          );
          linkedJobs++;
        } catch { /* duplicado — ignorar */ }
      }

      const total = linkedJobs;
      console.log(`[Sync] ${total} vacantes vinculadas, ${newCompanies} empresas nuevas.`);
      return res.json({
        synced: total,
        newCompanies,
        message: total === 0
          ? 'Todo al día — no hay vacantes sin empresa.'
          : `${total} vacantes sincronizadas, ${newCompanies} empresas nuevas para enriquecer.`,
      });
    } catch (error) {
      console.error('[Sync Error]:', error);
      return res.status(500).json({ error: 'Error sincronizando vacantes.' });
    }
  });

  // Webhook — protected by WEBHOOK_SECRET header (called by external scrapers)
  app.post('/api/webhook/scraper', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    const { fuente, titulo, empresa, url_postulacion } = req.body;
    if (!empresa || !titulo || !url_postulacion)
      return res.status(400).json({ error: 'Campos requeridos: empresa, titulo, url_postulacion.' });

    try {
      // Insertar la vacante con raw_company_name; sync la vinculará con la empresa
      const validSources = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);
      const source = validSources.has((fuente || '').toLowerCase()) ? fuente.toLowerCase() : 'other';
      await pool.query(
        `INSERT INTO jobs (raw_company_name, title, source, url)
         VALUES ($1, $2, $3::job_source_enum, $4)
         ON CONFLICT DO NOTHING`,
        [empresa, titulo, source, url_postulacion]
      );
      return res.json({ success: true });
    } catch (error) {
      console.error('[Webhook Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // PATCH /api/companies/:id — Enrich (editor+ only, column allowlist prevents SQL injection)
  app.patch('/api/companies/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });

    const setClause = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    try {
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, ...values]
      );
      return res.json({ success: true });
    } catch (error) {
      console.error('[DB Error] Updating company:', error);
      return res.status(500).json({ error: 'Error al actualizar empresa.' });
    }
  });

  // DELETE /api/companies/:id — hard delete (restricts if has jobs)
  app.delete('/api/companies/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });
      return res.json({ success: true });
    } catch (error: any) {
      if (error.code === '23503') return res.status(409).json({ error: 'No se puede eliminar: la empresa tiene vacantes asociadas.' });
      console.error('[Company DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar empresa.' });
    }
  });

  // ── Applications (in-memory, protected) ────────────────────────────────────
  const applications: ApplicationData[] = [];

  app.post('/api/apply/auto', requireAuth, async (req: AuthRequest, res) => {
    const { job, candidate } = req.body;
    if (!job || !candidate) return res.status(400).json({ success: false, message: 'Faltan datos.' });
    try {
      const result = await AutomationService.executeApplication(job, candidate);
      const status = result.success ? 'Applied' : result.requiresExtension ? 'Needs Extension' : 'Failed';
      const appData: ApplicationData = {
        jobId: job.id, candidateId: candidate.id, status,
        logs: result.logs, verification: result.verification,
        applicationId: result.applicationId, strategy: result.strategy,
        updatedAt: new Date().toISOString(),
      };
      const idx = applications.findIndex(a => a.jobId === job.id && a.candidateId === candidate.id);
      idx !== -1 ? (applications[idx] = appData) : applications.push(appData);
      return res.json(result);
    } catch (error) {
      console.error('[Automation Error]', error);
      return res.status(500).json({ success: false, message: 'Error en automatización.' });
    }
  });

  app.post('/api/apply', requireAuth, (req: AuthRequest, res) => {
    const { jobId, candidateId } = req.body;
    if (!jobId || !candidateId) return res.status(400).json({ success: false, message: 'jobId y candidateId requeridos.' });
    const idx = applications.findIndex(a => a.jobId === jobId && a.candidateId === candidateId);
    if (idx !== -1 && applications[idx].status === 'Applied')
      return res.status(400).json({ success: false, message: 'Candidato ya aplicado.' });
    const appData: ApplicationData = { jobId, candidateId, status: 'Applied', updatedAt: new Date().toISOString() };
    idx !== -1 ? (applications[idx] = appData) : applications.push(appData);
    setTimeout(() => res.json({ success: true, message: 'Aplicación enviada.' }), 500);
  });

  app.patch('/api/apply/status', requireAuth, (req: AuthRequest, res) => {
    const { jobId, candidateId, status } = req.body;
    if (!jobId || !candidateId || !status) return res.status(400).json({ success: false, message: 'Faltan campos.' });
    const idx = applications.findIndex(a => a.jobId === jobId && a.candidateId === candidateId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Aplicación no encontrada.' });
    applications[idx].status = status;
    applications[idx].updatedAt = new Date().toISOString();
    return res.json({ success: true });
  });

  app.get('/api/apply/status', requireAuth, (req: AuthRequest, res) => {
    const { jobId, candidateId } = req.query as { jobId?: string; candidateId?: string };
    if (!jobId || !candidateId) return res.status(400).json({ success: false, message: 'Faltan jobId o candidateId.' });
    const application = applications.find(a => a.jobId === jobId && a.candidateId === candidateId);
    return res.json({ success: true, status: application?.status ?? 'Saved', ...application });
  });

  // ── Vite / Static ────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server en http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
