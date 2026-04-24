// ⚠️ dotenv DEBE cargarse antes que cualquier otro import que lea process.env
// (ej: server/utils/region-filter.ts evalúa REGION_FILTER al ser importado).
import 'dotenv/config';

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from 'exceljs';
import { ApplicationAgentService } from "./server/services/application-agent.service.js";
import { EnrichmentService } from "./server/services/enrichment.service.js";
import { GeminiService } from "./server/services/gemini.service.js";  // coverLetter directo
import { JobClassifierService } from "./server/services/job-classifier.service.js";
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from "./server/data/serviceTypes.js";
import {
  REGION_FILTER,
  isRegionFilterActive,
  companyRegionClause,
  jobRegionClause,
  isRegionMatch,
} from "./server/utils/region-filter.js";
import { GoogleSheetsService } from "./server/services/google-sheets.service.js";
import { MDirectorService } from "./server/services/mdirector.service.js";
import { EmailCampaignService } from "./server/services/email-campaign.service.js";
import { spawn } from 'child_process';
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
    runMigrations();
  }
});

// ── Auto-export al Excel cuando se enriche una empresa ───────────────────────
// Debounced: acumula IDs por 10s y los vuelca todos de una sola vez al Excel.
let _exportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _exportRunning = false;

async function _flushToExcel() {
  if (_exportRunning) {
    _exportDebounceTimer = setTimeout(_flushToExcel, 5000);
    return;
  }
  _exportRunning = true;
  const target = (process.env.EXPORT_TARGET || 'excel').toLowerCase();

  try {
    // ── Exportar a Excel (local / OneDrive / Google Drive for Desktop) ──────
    if (target === 'excel' || target === 'both') {
      const { runExport } = await import('./scripts/export-to-excel.js')
        .catch(() => ({ runExport: null })) as any;
      if (runExport) {
        const r = await runExport({ limit: 2000, dryRun: false, pool });
        if (r.added > 0)
          console.log(`[AutoExport/Excel] ✅ +${r.added} nuevas · ${r.skipped} duplicadas · ${r.totalRowsInExcel} total`);
      }
    }

    // ── Exportar a Google Sheets ────────────────────────────────────────────
    if (target === 'sheets' || target === 'both') {
      const sheetsId = process.env.GOOGLE_SHEETS_ID;
      const keyPath  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
      if (!sheetsId || !keyPath) {
        console.warn('[AutoExport/Sheets] GOOGLE_SHEETS_ID o GOOGLE_SERVICE_ACCOUNT_KEY_PATH no configurados — omitiendo.');
      } else {
        const { runSheetsExport } = await import('./scripts/export-to-sheets.js')
          .catch(() => ({ runSheetsExport: null })) as any;
        if (runSheetsExport) {
          const r = await runSheetsExport({ limit: 2000, dryRun: false, pool });
          if (r.added > 0)
            console.log(`[AutoExport/Sheets] ✅ +${r.added} nuevas · ${r.skipped} duplicadas · ${r.totalRowsInSheet} total`);
        }
      }
    }
  } catch (err: any) {
    console.error('[AutoExport] Error:', err.message);
  } finally {
    _exportRunning = false;
  }
}

/** Llamar esto después de enriquecer una empresa. El export real ocurre 10s después,
 *  agrupando todas las empresas que lleguen en ese ventana. */
function scheduleExcelExport() {
  if (_exportDebounceTimer) clearTimeout(_exportDebounceTimer);
  _exportDebounceTimer = setTimeout(_flushToExcel, 10_000);
}

// ── Migraciones automáticas ───────────────────────────────────────────────────
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE companies DROP COLUMN IF EXISTS sector;
      ALTER TABLE companies DROP COLUMN IF EXISTS is_publicly_traded;
      ALTER TABLE companies DROP COLUMN IF EXISTS stock_ticker;
      ALTER TABLE companies DROP COLUMN IF EXISTS confidence_score;
      ALTER TABLE companies DROP COLUMN IF EXISTS needs_manual_review;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(60);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
    `);
    // Migración: columnas de clasificación en jobs
    await client.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_type_id VARCHAR(30);
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_match_confidence DECIMAL(3,2);
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_match_reasoning TEXT;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_match_provider VARCHAR(30);
    `);
    // Migración: sugerencias de servicios en companies
    await client.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS suggested_services JSONB;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS suggested_services_summary TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS suggested_services_at TIMESTAMP WITH TIME ZONE;
    `);
    // Migración: exportación a Excel/Sheets + estado Google Maps
    await client.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_maps_status VARCHAR(20) DEFAULT 'unknown';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS excel_exported_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS sheets_exported_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_region VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_town VARCHAR(100);
    `);
    // Migración: cola de aplicaciones automáticas
    await client.query(`
      CREATE TABLE IF NOT EXISTS application_queue (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        status        VARCHAR(20) NOT NULL DEFAULT 'queued',
        priority      INTEGER NOT NULL DEFAULT 5,
        queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at    TIMESTAMPTZ,
        applied_at    TIMESTAMPTZ,
        failed_at     TIMESTAMPTZ,
        error_message TEXT,
        notes         TEXT,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_app_queue_status   ON application_queue(status);
      CREATE INDEX IF NOT EXISTS idx_app_queue_job_id   ON application_queue(job_id);
    `);
    // Migración: historial de envíos de campañas de email
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_campaign_log (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
        company_name    VARCHAR(255) NOT NULL,
        company_email   VARCHAR(255) NOT NULL,
        service_type_id VARCHAR(30),
        work_label      VARCHAR(100),
        mdirector_campaign_id VARCHAR(100),
        mdirector_list_id     VARCHAR(100),
        status          VARCHAR(20) NOT NULL DEFAULT 'sent',
        sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes           TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ecl_company_id  ON email_campaign_log(company_id);
      CREATE INDEX IF NOT EXISTS idx_ecl_sent_at     ON email_campaign_log(sent_at);
      CREATE INDEX IF NOT EXISTS idx_ecl_service     ON email_campaign_log(service_type_id);

      -- Configuración global de campañas (una fila por workspace)
      CREATE TABLE IF NOT EXISTS campaign_config (
        id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        new_company_days      INTEGER NOT NULL DEFAULT 15,
        resend_interval_days  INTEGER NOT NULL DEFAULT 90,
        mdirector_api_key     TEXT,
        mdirector_api_secret  TEXT,
        mdirector_from_email  VARCHAR(255),
        mdirector_from_name   VARCHAR(255) DEFAULT 'CanTrack Staffing',
        -- Mapeo service_type_id → mdirector_template_id (JSON object)
        service_template_map  JSONB NOT NULL DEFAULT '{}',
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO campaign_config (id) VALUES ('00000000-0000-0000-0000-000000000001')
        ON CONFLICT (id) DO NOTHING;

      -- Columna en companies para fecha último envío de campaña
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_campaign_sent_at TIMESTAMPTZ;

      -- Clasificación comercial TIPO
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_tipo') THEN
          CREATE TYPE company_tipo AS ENUM ('verde','naranja','morado','rojo');
        END IF;
      END $$;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tipo company_tipo;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tipo_updated_at TIMESTAMPTZ;
    `);

    // Migración: plantillas de servicios
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        service_type_id VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        variables JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ Migraciones aplicadas correctamente.");
  } catch (err: any) {
    console.error("⚠️ Error en migraciones (puede ignorarse si ya aplicadas):", err.message);
  } finally {
    client.release();
  }
}

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
  'enrichment_status', 'industry', 'company_size',
  'hq_city', 'hq_province', 'hq_country', 'hq_region', 'hq_town', 'exact_address',
  'phone', 'contact_email', 'website', 'description',
  'known_ats_portal', 'legal_name', 'name', 'tipo', 'tipo_updated_at',
]);

const ALLOWED_JOB_COLUMNS = new Set([
  'title', 'url', 'location', 'country', 'category',
  'application_type', 'is_easy_apply', 'is_active', 'raw_company_name',
]);


async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

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
      const regionSQL = companyRegionClause('c');
      // Por defecto solo mostramos empresas con dirección real (enriquecidas).
      // ?includeUnenriched=1 permite verlas todas (para panel admin / enrichment queue).
      const includeUnenriched = req.query.includeUnenriched === '1' || req.query.includeUnenriched === 'true';
      const addressClause = includeUnenriched
        ? 'TRUE'
        : `(
            c.exact_address IS NOT NULL AND TRIM(c.exact_address) <> ''
            AND c.enrichment_status IN ('enriched','db_matched','scraped')
          )`;
      const result = await pool.query(
        `SELECT c.* FROM companies c
         WHERE ${regionSQL} AND ${addressClause}
         ORDER BY c.created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[DB Error] Fetching companies:', error);
      res.status(500).json({ error: 'Error al obtener empresas.' });
    }
  });

  /** Devuelve el estado del filtro regional para que el front lo muestre en UI */
  app.get('/api/region-filter', requireAuth, async (_req, res) => {
    res.json({
      active:   isRegionFilterActive(),
      province: REGION_FILTER || null,
    });
  });

  app.get('/api/jobs', requireAuth, async (req, res) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const search = ((req.query.search as string) || '').trim();

      const params: any[] = [limit, offset];
      let searchClause = '';
      if (search) {
        searchClause = `AND (
          j.title ILIKE $3
          OR COALESCE(c.name, j.raw_company_name) ILIKE $3
          OR j.location ILIKE $3
        )`;
        params.push(`%${search}%`);
      }

      const regionSQL = jobRegionClause('j', 'c');
      const baseSelect = `
        SELECT
          j.*,
          COALESCE(c.name, j.raw_company_name) AS company_name,
          c.industry           AS company_industry,
          c.company_size       AS company_size,
          c.hq_city            AS company_hq_city,
          c.hq_country         AS company_hq_country,
          c.website            AS company_website,
          c.description        AS company_description,
          c.enrichment_status  AS company_enrichment_status
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.is_active = true AND ${regionSQL} ${searchClause}
      `;

      const [rowsResult, countResult] = await Promise.all([
        pool.query(`${baseSelect} ORDER BY j.created_at DESC LIMIT $1 OFFSET $2`, params),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM jobs j
           LEFT JOIN companies c ON j.company_id = c.id
           WHERE j.is_active = true AND ${regionSQL} ${searchClause}`,
          search ? [`%${search}%`] : [],
        ),
      ]);

      // Enriquecer cada vacante con el nombre legible del servicio CanTrack
      // y un title_display que prioriza el servicio sobre el título crudo.
      const enriched = rowsResult.rows.map((j: any) => {
        const svc = j.service_type_id ? SERVICE_TYPE_BY_ID[j.service_type_id] : null;
        return {
          ...j,
          service_name:    svc?.name    ?? null,
          service_number:  svc?.number  ?? null,
          service_category: svc?.category ?? null,
          // title_display: servicio mapeado si existe, si no el título original
          title_display:   svc?.name    ?? j.title,
          // has_direct_service_match: false si el clasificador no encontró ningún servicio
          has_direct_service_match: !!svc,
        };
      });

      res.json({
        data:       enriched,
        total:      countResult.rows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      });
    } catch (error) {
      console.error('[DB Error] Fetching jobs:', error);
      res.status(500).json({ error: 'Error al obtener trabajos.' });
    }
  });

  // GET /api/stats — real DB counts
  app.get('/api/stats', requireAuth, async (_req, res) => {
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
      const j: any = result.rows[0];
      const svc = j.service_type_id ? SERVICE_TYPE_BY_ID[j.service_type_id] : null;
      return res.json({
        ...j,
        service_name:    svc?.name    ?? null,
        service_number:  svc?.number  ?? null,
        service_category: svc?.category ?? null,
        title_display:   svc?.name    ?? j.title,
        has_direct_service_match: !!svc,
      });
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

      // 2. No tiene datos → enriquecer (Gemini → Groq → Ollama → WebSearch)
      const data = await EnrichmentService.enrichCompany(companyName);
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';
      const updatePayload: Record<string, any> = { enrichment_status: newStatus };
      if (data.industry) updatePayload.industry = data.industry;
      if (data.company_size) updatePayload.company_size = data.company_size;
      if (data.hq_city) updatePayload.hq_city = data.hq_city;
      if (data.hq_province) updatePayload.hq_province = data.hq_province;
      if (data.hq_country) updatePayload.hq_country = data.hq_country;
      if (data.exact_address) updatePayload.exact_address = data.exact_address;
      if (data.phone) updatePayload.phone = data.phone;
      if (data.contact_email) updatePayload.contact_email = data.contact_email;
      if (data.website) updatePayload.website = data.website;
      if (data.description) updatePayload.description = data.description;
      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values]
      );
      // Disparar export al Excel en background (debounced 10s)
      if (hasData) scheduleExcelExport();
      return res.json({ success: true, source: data._provider ?? 'unknown', data });
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
        scheduleExcelExport(); // también exportar empresas db_matched
        return res.json({ done: false, source: 'db_matched', companyId, companyName });
      }

      // Enriquecer con proveedor disponible (Gemini → Groq → Ollama → WebSearch)
      const data = await EnrichmentService.enrichCompany(companyName);

      // Si ningún proveedor devolvió datos reales, marcar como failed (no scraped)
      const hasData = data.industry || data.description || data.website;
      const newStatus = hasData ? 'scraped' : 'failed';

      // Auto-rojo: si el modelo detecta que la empresa está cerrada, marcarla como rojo
      const autoRojo = data.is_closed === true;

      const updatePayload: Record<string, any> = { enrichment_status: newStatus };
      if (autoRojo) {
        updatePayload.tipo = 'rojo';
        updatePayload.tipo_updated_at = new Date().toISOString();
        console.info(`[Auto-rojo] "${companyName}" detectada como cerrada por el modelo de IA`);
      }
      if (data.industry) updatePayload.industry = data.industry;
      if (data.company_size) updatePayload.company_size = data.company_size;
      if (data.hq_city) updatePayload.hq_city = data.hq_city;
      if (data.hq_province) updatePayload.hq_province = data.hq_province;
      if (data.hq_country) updatePayload.hq_country = data.hq_country;
      if (data.exact_address) updatePayload.exact_address = data.exact_address;
      if (data.phone) updatePayload.phone = data.phone;
      if (data.contact_email) updatePayload.contact_email = data.contact_email;
      if (data.website) updatePayload.website = data.website;
      if (data.description) updatePayload.description = data.description;
      const keys = Object.keys(updatePayload).filter(k => ALLOWED_COMPANY_COLUMNS.has(k));
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const values = keys.map(k => updatePayload[k]);
      await pool.query(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [companyId, ...values]
      );

      // Disparar export al Excel en background (debounced 10s)
      if (hasData) scheduleExcelExport();

      // Auto-sugerir servicios si la empresa tiene datos suficientes (background)
      if (hasData) {
        JobClassifierService.suggestForCompany({
          name: companyName,
          industry: data.industry,
          description: data.description,
          company_size: data.company_size,
          hq_city: data.hq_city,
          hq_country: data.hq_country,
        }).then(suggestions => pool.query(
          `UPDATE companies SET suggested_services=$1, suggested_services_summary=$2, suggested_services_at=NOW() WHERE id=$3`,
          [JSON.stringify(suggestions.suggestions), suggestions.company_summary, companyId]
        )).catch(err => console.warn('[Auto-suggest]', err.message));
      }

      // Cuántas quedan
      const countResult = await pool.query(`SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending'`);
      const remaining = parseInt(countResult.rows[0].count, 10);
      return res.json({ done: remaining === 0, source: data._provider ?? 'unknown', companyId, companyName, data, remaining });
    } catch (error: any) {
      // Si la transacción falló, liberar el lock
      console.error('[process-next Error]:', error);
      await pool.query(
        `UPDATE companies SET enrichment_status = 'pending' WHERE enrichment_status = 'processing'`
      ).catch(() => {});
      return res.status(500).json({ error: 'Error procesando cola de enriquecimiento.' });
    }
  });

  // DELETE /api/companies/all — borra datos de enriquecimiento de TODAS las empresas para re-scrapar
  // Mantiene las empresas (nombre/slug) pero resetea todos los campos enriquecidos a NULL y status a 'pending'
  // Opcional: ?limit=20  → solo las primeras N quedan como 'pending', el resto como 'skipped'
  app.delete('/api/companies/all', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;

      // 1. Resetear todo a NULL primero
      await pool.query(`
        UPDATE companies SET
          industry       = NULL,
          company_size   = NULL,
          hq_city        = NULL,
          hq_province    = NULL,
          hq_country     = NULL,
          exact_address  = NULL,
          phone          = NULL,
          contact_email  = NULL,
          website        = NULL,
          description    = NULL,
          known_ats_portal = NULL,
          legal_name     = NULL,
          enrichment_status = 'skipped',
          enriched_at    = NULL,
          updated_at     = CURRENT_TIMESTAMP
      `);

      if (limit && limit > 0) {
        // 2a. Solo las primeras N (por fecha de creación) quedan como 'pending'
        await pool.query(
          `UPDATE companies SET enrichment_status = 'pending'
           WHERE id IN (
             SELECT id FROM companies ORDER BY created_at ASC LIMIT $1
           )`,
          [limit]
        );
        return res.json({ success: true, message: `Reset done. First ${limit} companies queued for enrichment, rest skipped.` });
      } else {
        // 2b. Sin límite — todas como pending
        await pool.query(`UPDATE companies SET enrichment_status = 'pending'`);
        return res.json({ success: true, message: 'All company enrichment data cleared. Ready to re-scrape.' });
      }
    } catch (error) {
      console.error('[Clear Companies Error]:', error);
      return res.status(500).json({ error: 'Error clearing company data.' });
    }
  });

  // POST /api/companies/export — exporta empresas seleccionadas a Excel
  /**
   * POST /api/companies/export
   * Descarga un Excel en el formato Acton Vale: 3 columnas → Empresa | DIRECCION | WORK
   *
   * WORK = nombre del servicio CanTrack al que la empresa fue clasificada por la IA,
   *        priorizando:
   *          1. service_type_id de la primera vacante clasificada
   *          2. Primer suggested_services[0]
   *          3. El nombre legible del servicio si el filtro fija uno
   *          4. 'GENERAL' como último fallback
   *
   * Body: { ids?: string[], serviceId?: string }
   *   - ids:       array de UUIDs de companies (opcional)
   *   - serviceId: si se pasa, filtra empresas que tienen ese servicio ya sea
   *                por job.service_type_id o por suggested_services.
   */
  app.post('/api/companies/export', requireAuth, async (req, res) => {
    try {
      const { ids, serviceId } = req.body as { ids?: string[]; serviceId?: string };

      const where: string[] = [];
      const params: any[] = [];
      if (Array.isArray(ids) && ids.length > 0) {
        params.push(ids);
        where.push(`c.id = ANY($${params.length}::uuid[])`);
      }
      if (serviceId) {
        params.push(serviceId);
        where.push(`(
          EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.service_type_id = $${params.length})
          OR c.suggested_services::jsonb @> jsonb_build_array(jsonb_build_object('service_id', $${params.length}::text))
        )`);
      }
      // Inyectar filtro regional (no-op si REGION_FILTER vacío)
      where.push(companyRegionClause('c'));
      const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const q = `
        SELECT
          c.id, c.name, c.exact_address, c.hq_city, c.hq_province, c.hq_country,
          c.suggested_services,
          (SELECT j.service_type_id FROM jobs j
            WHERE j.company_id = c.id AND j.service_type_id IS NOT NULL
            ORDER BY j.created_at DESC LIMIT 1) AS job_service_type_id
        FROM companies c
        ${whereSQL}
        ORDER BY c.name
      `;
      const { rows } = await pool.query(q, params);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'CanTrack CRM';
      const ws = wb.addWorksheet('Hoja1');

      // Formato exacto Acton Vale: 3 columnas sin estilo extra.
      ws.columns = [
        { header: 'Empresa',    key: 'empresa',   width: 38 },
        { header: 'DIRECCION',  key: 'direccion', width: 55 },
        { header: 'WORK',       key: 'work',      width: 24 },
      ];

      // Solo negrita en encabezado — el archivo de referencia es muy simple.
      ws.getRow(1).font = { bold: true };

      // Resolver el WORK para cada empresa
      const resolveWork = (r: any): string => {
        // 1. Servicio derivado de la vacante clasificada
        const jobSvc = r.job_service_type_id;
        if (jobSvc && SERVICE_TYPE_BY_ID[jobSvc]) return SERVICE_TYPE_BY_ID[jobSvc].name;
        // 2. Filtro explícito por servicio
        if (serviceId && SERVICE_TYPE_BY_ID[serviceId]) return SERVICE_TYPE_BY_ID[serviceId].name;
        // 3. Primera sugerencia AI sobre la empresa
        const ss = Array.isArray(r.suggested_services) ? r.suggested_services : null;
        if (ss && ss.length && ss[0]?.service_id && SERVICE_TYPE_BY_ID[ss[0].service_id]) {
          return SERVICE_TYPE_BY_ID[ss[0].service_id].name;
        }
        // 4. Fallback
        return 'General';
      };

      // Componer dirección Acton Vale-style si exact_address está vacío
      const resolveAddress = (r: any): string => {
        if (r.exact_address) return r.exact_address;
        const parts = [r.hq_city, r.hq_province, r.hq_country].filter(Boolean);
        return parts.join(', ');
      };

      for (const r of rows) {
        ws.addRow({
          empresa:   r.name ?? '',
          direccion: resolveAddress(r),
          work:      resolveWork(r),
        });
      }

      const filename = serviceId && SERVICE_TYPE_BY_ID[serviceId]
        ? `cantrack-${SERVICE_TYPE_BY_ID[serviceId].id}-${new Date().toISOString().slice(0,10)}.xlsx`
        : `cantrack-empresas-${new Date().toISOString().slice(0,10)}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('[Export Error]:', error);
      res.status(500).json({ error: 'Error al exportar Excel.' });
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

  // Webhook — protected by WEBHOOK_SECRET header (called by external scrapers)
  app.post('/api/webhook/scraper', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    const { fuente, titulo, empresa, url_postulacion, location, country } = req.body;
    if (!empresa || !titulo || !url_postulacion)
      return res.status(400).json({ error: 'Campos requeridos: empresa, titulo, url_postulacion.' });

    // Filtro regional: descartamos vacantes fuera de la provincia configurada.
    // Respondemos 200 para que el scraper no reintente (no es un error real).
    if (isRegionFilterActive() && !isRegionMatch(location, country, titulo, empresa, url_postulacion)) {
      return res.json({ success: true, skipped: true, reason: `Fuera de región ${REGION_FILTER}` });
    }

    try {
      // Insertar la vacante con raw_company_name; sync la vinculará con la empresa
      const validSources = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website']);
      const source = validSources.has((fuente || '').toLowerCase()) ? fuente.toLowerCase() : 'other';
      const insertResult = await pool.query(
        `INSERT INTO jobs (raw_company_name, title, source, url)
         VALUES ($1, $2, $3::job_source_enum, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [empresa, titulo, source, url_postulacion]
      );
      // Clasificar la vacante en background (no bloquea la respuesta)
      if (insertResult.rowCount && insertResult.rowCount > 0) {
        const newJobId = insertResult.rows[0].id;
        JobClassifierService.classifyJob(titulo, '', empresa, '')
          .then(result => pool.query(
            `UPDATE jobs SET service_type_id=$1, service_match_confidence=$2, service_match_reasoning=$3, service_match_provider=$4 WHERE id=$5`,
            [result.service_id, result.confidence, result.reasoning, result._provider, newJobId]
          ))
          .catch(err => console.warn('[Webhook Classify]', err.message));
      }
      return res.json({ success: true });
    } catch (error) {
      console.error('[Webhook Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Webhook — dispara un batch de enriquecimiento sobre empresas pending.
  // Pensado para ser invocado por un cron externo (Task Scheduler / cron / n8n).
  //
  // Uso:
  //   POST /api/webhook/enrich
  //   Header: x-webhook-secret: <WEBHOOK_SECRET>
  //   Body (opcional): { "limit": 20, "delay": 1200, "sync": true }
  //
  // Si `sync:true`, primero corre /api/sync/scraped-jobs para absorber lo nuevo.
  // El proceso corre en background y el webhook responde inmediatamente.
  // ──────────────────────────────────────────────────────────────────────────
  let enrichRunning = false;
  let enrichLastRun: { startedAt: string; finishedAt?: string; exitCode?: number | null; pid?: number } | null = null;

  app.post('/api/webhook/enrich', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    if (enrichRunning) {
      return res.status(409).json({
        error: 'Ya hay un batch de enriquecimiento en curso.',
        lastRun: enrichLastRun,
      });
    }

    const limit = Math.max(1, Math.min(200, parseInt(req.body?.limit, 10) || 20));
    const delay = Math.max(200, Math.min(10_000, parseInt(req.body?.delay, 10) || 1200));
    const runSync = req.body?.sync === true || req.body?.sync === 'true';

    // Lanzamos el script como child process (npx tsx) para no bloquear el servidor.
    const scriptArgs = ['tsx', 'scripts/enrich-companies.ts', '--limit', String(limit), '--delay', String(delay)];
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', scriptArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    enrichRunning = true;
    enrichLastRun = { startedAt: new Date().toISOString(), pid: child.pid };

    child.stdout?.on('data', d => process.stdout.write(`[Enrich] ${d}`));
    child.stderr?.on('data', d => process.stderr.write(`[Enrich err] ${d}`));
    child.on('close', code => {
      enrichRunning = false;
      enrichLastRun = { ...enrichLastRun!, finishedAt: new Date().toISOString(), exitCode: code };
      console.log(`[Webhook Enrich] terminó con código ${code}`);
    });

    // Si además piden sincronizar, lanzamos en paralelo una llamada interna al sync.
    if (runSync) {
      pool.query(`
        SELECT COUNT(*)::int AS n FROM jobs WHERE company_id IS NULL AND raw_company_name IS NOT NULL
      `).then(r => console.log(`[Webhook Enrich] jobs pendientes de sync: ${r.rows[0].n}`))
        .catch(() => {});
    }

    return res.json({
      success: true,
      message: `Batch de enriquecimiento lanzado (limit=${limit}, delay=${delay}ms).`,
      pid: child.pid,
      startedAt: enrichLastRun.startedAt,
    });
  });

  /** Estado del último batch de enriquecimiento disparado vía webhook */
  app.get('/api/webhook/enrich/status', requireAuth, async (_req, res) => {
    res.json({ running: enrichRunning, lastRun: enrichLastRun });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO CAMPAÑAS DE EMAIL
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/campaigns/config — lee la configuración actual */
  app.get('/api/campaigns/config', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const cfg = await EmailCampaignService.getConfig(pool);
      // No exponer las credenciales completas al frontend — solo indicar si están configuradas
      res.json({
        newCompanyDays:      cfg.newCompanyDays,
        resendIntervalDays:  cfg.resendIntervalDays,
        mdirectorConfigured: !!(cfg.mdirectorApiKey && cfg.mdirectorFromEmail),
        mdirectorFromEmail:  cfg.mdirectorFromEmail,
        mdirectorFromName:   cfg.mdirectorFromName,
        serviceTemplateMap:  cfg.serviceTemplateMap,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** PATCH /api/campaigns/config — actualiza la configuración */
  app.patch('/api/campaigns/config', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const {
        newCompanyDays, resendIntervalDays,
        mdirectorApiKey, mdirectorApiSecret, mdirectorFromEmail, mdirectorFromName,
        serviceTemplateMap,
      } = req.body;
      await EmailCampaignService.saveConfig(pool, {
        newCompanyDays, resendIntervalDays,
        mdirectorApiKey, mdirectorApiSecret, mdirectorFromEmail, mdirectorFromName,
        serviceTemplateMap,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaigns/preview — vista previa sin enviar */
  app.get('/api/campaigns/preview', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const preview = await EmailCampaignService.buildPreview(pool);
      res.json(preview);
    } catch (err: any) {
      console.error('[Campaign Preview]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/campaigns/send — lanza la campaña con los contactos del preview */
  app.post('/api/campaigns/send', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const { contacts } = req.body;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Envía contacts[] del preview antes de disparar.' });
      }
      const result = await EmailCampaignService.sendCampaign(pool, contacts, req.user!.id);
      res.json(result);
    } catch (err: any) {
      console.error('[Campaign Send]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/campaigns/history — historial de envíos */
  app.get('/api/campaigns/history', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
      const history = await EmailCampaignService.getHistory(pool, limit);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Normaliza el campo TIPO del Sheet a enum del CRM */
  function sheetTipo(raw: string): 'verde'|'naranja'|'morado'|'rojo'|null {
    const v = (raw || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (v.includes('verde')  || v === 'v') return 'verde';
    if (v.includes('naranja')|| v === 'n') return 'naranja';
    if (v.includes('morado') || v.includes('lila') || v === 'm') return 'morado';
    if (v.includes('rojo')   || v.includes('red')  || v === 'r') return 'rojo';
    return null;
  }

  /** GET /api/campaigns/sheet-companies — empresas del Google Sheet con estado de campaña */
  app.get('/api/campaigns/sheet-companies', requireAuth, async (_req, res) => {
    try {
      // Si Google Sheets no está configurado o falla, devolvemos array vacío
      // en lugar de 500 para no romper la carga inicial del CRM.
      let rows: Awaited<ReturnType<typeof GoogleSheetsService.readRows>> = [];
      try {
        await GoogleSheetsService.init();
        rows = await GoogleSheetsService.readRows();
      } catch (sheetsErr: any) {
        console.warn('[sheet-companies] Google Sheets no disponible:', sheetsErr.message);
        return res.json({ total: 0, companies: [], sheetsError: sheetsErr.message });
      }
      // Cruzar con DB para obtener email y fechas
      const names = rows.map(r => r.empresa);
      const dbRes = await pool.query(`
        SELECT id, name, contact_email, phone, website, industry, company_size,
               hq_city, hq_province, hq_region, hq_town, hq_country, exact_address,
               description, known_ats_portal,
               sheets_exported_at, last_campaign_sent_at, enrichment_status,
               tipo, tipo_updated_at
        FROM companies WHERE name = ANY($1::text[])
      `, [names]);
      const dbMap = new Map(dbRes.rows.map(r => [r.name, r]));

      const result = rows.map(row => {
        const db = dbMap.get(row.empresa);
        return {
          companyId:        db?.id                  || null,
          empresa:          row.empresa,
          // Contacto — Sheet tiene datos directos
          email:            row.correo              || db?.contact_email || null,
          hasEmail:         !!(row.correo || db?.contact_email),
          phone:            row.telefono            || db?.phone         || null,
          // Dirección — Sheet tiene columnas separadas
          direccion:        row.direccion,
          exactAddress:     row.direccion           || db?.exact_address || null,
          provincia:        row.provincia,
          region:           row.region,
          ciudad:           row.ciudad,
          pueblo:           row.pueblo,
          hqCity:           row.ciudad              || db?.hq_city       || null,
          hqProvince:       row.provincia           || db?.hq_province   || null,
          hqRegion:         row.region              || db?.hq_region     || null,
          hqTown:           row.pueblo              || db?.hq_town       || null,
          hqCountry:        'Canada',
          // Servicio y descripción
          work:             row.work,
          descripcion:      row.descripcion         || db?.description   || null,
          dominio:          row.dominio             || db?.website       || null,
          // Enriquecimiento adicional de DB
          industry:         db?.industry            || null,
          companySize:      db?.company_size        || null,
          website:          row.dominio             || db?.website       || null,
          description:      row.descripcion         || db?.description   || null,
          knownAtsPortal:   row.work                || db?.known_ats_portal || null,
          // Fechas
          addedToSheetAt:   row.fecha               || db?.sheets_exported_at  || null,
          lastCampaignAt:   db?.last_campaign_sent_at || null,
          enrichmentStatus: db?.enrichment_status   || 'unknown',
          // Tipo: DB tiene prioridad; si no hay, usar el color detectado del Sheet
          tipo:             db?.tipo                || row.tipo          || null,
          tipoUpdatedAt:    db?.tipo_updated_at     || null,
        };
      });
      res.json({ total: result.length, companies: result });
    } catch (err: any) {
      console.error('[Sheet Companies]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** PATCH /api/companies/:id/tipo — actualiza clasificación comercial */
  app.patch('/api/companies/:id/tipo', requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { tipo } = req.body;
    const valid = ['verde','naranja','morado','rojo',null];
    if (!valid.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    try {
      await pool.query(
        `UPDATE companies SET tipo=$1, tipo_updated_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [tipo, id]
      );
      return res.json({ success: true, tipo });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
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

  // POST /api/companies/:id/send-offer — Envía correo de oferta de personal via mDirector
  app.post('/api/companies/:id/send-offer', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id: companyId } = req.params;
    const { toEmail, toName, employeeTypeId, employeeTypeName, employeeTypeDescription, subject, customMessage } = req.body;

    if (!toEmail || !employeeTypeId || !employeeTypeName || !subject)
      return res.status(400).json({ error: 'toEmail, employeeTypeId, employeeTypeName y subject son requeridos.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail))
      return res.status(400).json({ error: 'Email de destino inválido.' });

    try {
      const companyRes = await pool.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
      if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada.' });

      const company = companyRes.rows[0];
      const senderName = `${req.user!.firstName} ${req.user!.lastName}`;

      const htmlBody = MDirectorService.buildOfferEmailHtml({
        companyName: company.name,
        contactName: toName || undefined,
        employeeTypeName,
        employeeTypeDescription: employeeTypeDescription || '',
        customMessage: customMessage || '',
        senderName,
      });

      const result = await MDirectorService.sendEmail({
        toEmail,
        toName: toName || company.name,
        subject,
        htmlBody,
        companyId,
        employeeTypeId,
        sentByUserId: req.user!.id,
      });

      if (!result.success) return res.status(502).json({ error: result.error || 'Error al enviar el correo.' });

      // Registrar en historial
      await pool.query(
        `INSERT INTO email_logs (company_id, sent_by, to_email, to_name, subject, employee_type_id, employee_type_name, mdirector_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [companyId, req.user!.id, toEmail, toName || null, subject, employeeTypeId, employeeTypeName, result.messageId || null]
      );

      console.log(`[mDirector] Oferta enviada → ${toEmail} | empresa: ${company.name} | perfil: ${employeeTypeName}`);
      return res.json({ success: true, messageId: result.messageId });
    } catch (error: any) {
      console.error('[Send Offer Error]:', error);
      return res.status(500).json({ error: 'Error interno al enviar la oferta.' });
    }
  });

  // GET /api/companies/:id/email-logs — historial de correos enviados
  app.get('/api/companies/:id/email-logs', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT el.*, u.first_name || ' ' || u.last_name AS sent_by_name
         FROM email_logs el
         LEFT JOIN users u ON el.sent_by = u.id
         WHERE el.company_id = $1
         ORDER BY el.sent_at DESC
         LIMIT 50`,
        [req.params.id]
      );
      return res.json(result.rows);
    } catch (error) {
      console.error('[Email Logs Error]:', error);
      return res.status(500).json({ error: 'Error al obtener historial.' });
    }
  });

  // ── Candidates ───────────────────────────────────────────────────────────────

  // GET /api/candidates — list with skills
  app.get('/api/candidates', requireAuth, async (_req, res) => {
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

  // GET /api/candidates/:id — single candidate + applications
  app.get('/api/candidates/:id', requireAuth, async (req, res) => {
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

  // POST /api/candidates — create
  app.post('/api/candidates', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, bio, skills } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO candidates (name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name.trim(), role||null, email||null, phone||null, location||null, linkedin_url||null, resume_url||null, years_of_experience||null, bio||null],
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

  // PATCH /api/candidates/:id — update
  app.patch('/api/candidates/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const ALLOWED = ['name','role','email','phone','location','linkedin_url','resume_url','years_of_experience','bio','status'];
    const updates = Object.entries(req.body).filter(([k]) => ALLOWED.includes(k));

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
  app.delete('/api/candidates/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const r = await pool.query('DELETE FROM candidates WHERE id = $1 RETURNING id', [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Candidato no encontrado.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Candidate DELETE Error]:', error);
      return res.status(500).json({ error: 'Error al eliminar candidato.' });
    }
  });

  // ── Application Agent ─────────────────────────────────────────────────────

  // GET /api/agent/status
  app.get('/api/agent/status', requireAuth, (_req, res) => {
    res.json(ApplicationAgentService.getState());
  });

  // POST /api/agent/start
  app.post('/api/agent/start', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      await ApplicationAgentService.start(pool);
      res.json({ success: true, state: ApplicationAgentService.getState() });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  // POST /api/agent/stop
  app.post('/api/agent/stop', requireAuth, requireRole('admin', 'editor'), (_req, res) => {
    ApplicationAgentService.stop();
    res.json({ success: true, state: ApplicationAgentService.getState() });
  });

  // ── Application Queue ─────────────────────────────────────────────────────

  // GET /api/application-queue — lista completa con info de job
  app.get('/api/application-queue', requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          aq.id, aq.job_id, aq.status, aq.priority,
          aq.queued_at, aq.started_at, aq.applied_at, aq.failed_at,
          aq.error_message, aq.notes,
          j.title  AS job_title,
          j.source,
          COALESCE(c.name, j.raw_company_name, '') AS company_name
        FROM application_queue aq
        JOIN jobs j ON j.id = aq.job_id
        LEFT JOIN companies c ON c.id = j.company_id
        ORDER BY
          CASE aq.status WHEN 'queued' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
          aq.priority DESC,
          aq.queued_at ASC
      `);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/application-queue/stats
  app.get('/api/application-queue/stats', requireAuth, async (_req, res) => {
    try {
      const stats = await ApplicationAgentService.getStats(pool);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/application-queue — añadir vacante(s) a la cola
  app.post('/api/application-queue', requireAuth, async (req: AuthRequest, res) => {
    const { jobId, jobIds, priority = 5 } = req.body ?? {};
    const ids: string[] = jobIds ?? (jobId ? [jobId] : []);
    if (ids.length === 0) return res.status(400).json({ error: 'jobId o jobIds requerido.' });

    try {
      // Verificar que los jobs existen y son de LinkedIn/Indeed
      const { rows: jobs } = await pool.query(
        `SELECT id, source FROM jobs WHERE id = ANY($1::uuid[]) AND source IN ('linkedin','indeed')`,
        [ids]
      );
      if (jobs.length === 0) {
        return res.status(400).json({ error: 'Ningún job válido (debe ser LinkedIn o Indeed).' });
      }

      const inserted: string[] = [];
      for (const job of jobs) {
        // Evitar duplicados en estado queued/processing
        const { rows: dup } = await pool.query(
          `SELECT id FROM application_queue WHERE job_id=$1 AND status IN ('queued','processing')`,
          [job.id]
        );
        if (dup.length > 0) continue;

        await pool.query(
          `INSERT INTO application_queue (job_id, priority, created_by)
           VALUES ($1, $2, $3)`,
          [job.id, Math.min(10, Math.max(1, priority)), req.user?.id ?? null]
        );
        inserted.push(job.id);
      }

      res.json({ success: true, inserted: inserted.length, skippedDuplicates: jobs.length - inserted.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/application-queue/clear — limpiar completados/fallidos (antes que /:id)
  app.delete('/api/application-queue/clear', requireAuth, requireRole('admin', 'editor'), async (_req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM application_queue WHERE status IN ('applied','skipped','failed','captcha')`
      );
      res.json({ success: true, deleted: rowCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/application-queue/:id — eliminar item
  app.delete('/api/application-queue/:id', requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM application_queue WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/application-queue/:id/retry — reintentar fallido
  app.patch('/api/application-queue/:id/retry', requireAuth, async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `UPDATE application_queue
         SET status='queued', error_message=NULL, failed_at=NULL, notes=NULL, started_at=NULL
         WHERE id=$1 AND status IN ('failed','captcha','skipped')`,
        [req.params.id]
      );
      if (rowCount === 0) return res.status(400).json({ error: 'Item no encontrado o no se puede reintentar.' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/application-queue/job/:jobId — estado de un job específico en la cola
  app.get('/api/application-queue/job/:jobId', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, status, priority, queued_at, applied_at, failed_at, notes, error_message
         FROM application_queue WHERE job_id=$1
         ORDER BY queued_at DESC LIMIT 1`,
        [req.params.jobId]
      );
      res.json(rows[0] ?? null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Exportación a Excel ──────────────────────────────────────────────────────

  /**
   * POST /api/export/companies-to-excel
   * Lanza el script de exportación en background y devuelve respuesta inmediata.
   * Body opcional: { limit?: number, dryRun?: boolean, excelPath?: string }
   */
  app.post('/api/export/companies-to-excel', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
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
      const { runExport } = await import('./scripts/export-to-excel.js').catch(() => ({ runExport: null })) as any;
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

  /**
   * PATCH /api/companies/:id/google-maps-status
   * Actualiza el estado de Google Maps de una empresa (open / closed / unknown).
   */
  app.patch('/api/companies/:id/google-maps-status', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['open', 'closed', 'unknown'].includes(status)) {
      return res.status(400).json({ error: 'status debe ser: open, closed o unknown' });
    }
    await pool.query(
      `UPDATE companies SET google_maps_status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
    return res.json({ success: true });
  });

  /**
   * GET /api/export/stats
   * Cuántas empresas están pendientes de exportar vs ya exportadas.
   */
  app.get('/api/export/stats', requireAuth, async (_req, res) => {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE excel_exported_at IS NULL AND enrichment_status IN ('scraped','db_matched','verified')) AS pending_export,
        COUNT(*) FILTER (WHERE excel_exported_at IS NOT NULL) AS already_exported,
        COUNT(*) FILTER (WHERE google_maps_status = 'closed') AS closed_companies
      FROM companies
    `);
    return res.json({ success: true, data: result.rows[0] });
  });

  // ── Servicios CanTrack (52 perfiles) ────────────────────────────────────────

  /** Lista completa de los 52 servicios */
  app.get('/api/service-types', requireAuth, (_req, res) => {
    res.json({ success: true, data: SERVICE_TYPES, total: SERVICE_TYPES.length });
  });

  /** Lista compacta (para selectors en UI) */
  app.get('/api/service-types/compact', requireAuth, (_req, res) => {
    res.json({ success: true, data: SERVICE_TYPES_COMPACT, total: SERVICE_TYPES_COMPACT.length });
  });

  // ── Clasificación de vacantes ────────────────────────────────────────────────

  /**
   * POST /api/jobs/classify
   * Body: { title, description?, companyName?, companyIndustry? }
   * Clasifica una vacante y devuelve el servicio CanTrack más cercano.
   * También puede recibir un jobId para guardar el resultado en la BD.
   */
  app.post('/api/jobs/classify', requireAuth, async (req: AuthRequest, res) => {
    const { title, description, companyName, companyIndustry, jobId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title es requerido' });

    try {
      const result = await JobClassifierService.classifyJob(
        title,
        description || '',
        companyName || '',
        companyIndustry || ''
      );

      // Si se envió un jobId, persiste la clasificación
      if (jobId) {
        await pool.query(
          `UPDATE jobs
           SET service_type_id = $1, service_match_confidence = $2,
               service_match_reasoning = $3, service_match_provider = $4
           WHERE id = $5`,
          [result.service_id, result.confidence, result.reasoning, result._provider, jobId]
        );
      }

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/jobs/classify]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/jobs/:id/classify
   * Clasifica la vacante guardada en BD y persiste el resultado.
   */
  app.post('/api/jobs/:id/classify', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const jobRow = await pool.query(
        `SELECT j.title, j.raw_company_name, c.name AS company_name, c.industry, j.id
         FROM jobs j LEFT JOIN companies c ON j.company_id = c.id
         WHERE j.id = $1`,
        [id]
      );
      if (jobRow.rowCount === 0) return res.status(404).json({ success: false, message: 'Vacante no encontrada' });

      const job = jobRow.rows[0];
      const result = await JobClassifierService.classifyJob(
        job.title,
        '',
        job.company_name || job.raw_company_name || '',
        job.industry || ''
      );

      await pool.query(
        `UPDATE jobs
         SET service_type_id = $1, service_match_confidence = $2,
             service_match_reasoning = $3, service_match_provider = $4
         WHERE id = $5`,
        [result.service_id, result.confidence, result.reasoning, result._provider, id]
      );

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/jobs/:id/classify]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Sugerencias de servicios para empresas ───────────────────────────────────

  /**
   * POST /api/companies/:id/suggest-services
   * Analiza el perfil enriquecido de la empresa y sugiere qué servicios ofrecerle.
   * Guarda las sugerencias en la BD.
   */
  app.post('/api/companies/:id/suggest-services', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const companyRow = await pool.query(
        `SELECT id, name, industry, description, company_size, hq_city, hq_country
         FROM companies WHERE id = $1`,
        [id]
      );
      if (companyRow.rowCount === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada' });

      const company = companyRow.rows[0];
      const result = await JobClassifierService.suggestForCompany(company);

      await pool.query(
        `UPDATE companies
         SET suggested_services = $1, suggested_services_summary = $2,
             suggested_services_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(result.suggestions), result.company_summary, id]
      );

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[/api/companies/:id/suggest-services]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * GET /api/companies/:id/suggest-services
   * Devuelve las sugerencias guardadas (o genera nuevas si no existen).
   */
  app.get('/api/companies/:id/suggest-services', requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const row = await pool.query(
        `SELECT suggested_services, suggested_services_summary, suggested_services_at,
                name, industry, description, company_size, hq_city, hq_country
         FROM companies WHERE id = $1`,
        [id]
      );
      if (row.rowCount === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada' });

      const company = row.rows[0];

      // Si ya hay sugerencias guardadas, devuélvelas
      if (company.suggested_services) {
        return res.json({
          success: true,
          data: {
            suggestions: company.suggested_services,
            company_summary: company.suggested_services_summary,
            generated_at: company.suggested_services_at,
            _cached: true,
          },
        });
      }

      // Si no, genera nuevas (no bloquea — responde rápido con fallback)
      const result = await JobClassifierService.suggestForCompany(company);
      await pool.query(
        `UPDATE companies SET suggested_services = $1, suggested_services_summary = $2, suggested_services_at = NOW() WHERE id = $3`,
        [JSON.stringify(result.suggestions), result.company_summary, id]
      );
      return res.json({ success: true, data: { ...result, _cached: false } });
    } catch (err: any) {
      console.error('[GET /api/companies/:id/suggest-services]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Export status + run-now ───────────────────────────────────────────────────

  /** GET /api/export/auto-status — métricas de exportación */
  app.get('/api/export/auto-status', requireAuth, async (_req, res) => {
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
        running: _exportRunning,
        pendingFlush: _exportDebounceTimer !== null,
        sheetsConfigured: !!(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
        stats: statsRes.rows[0],
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /** POST /api/export/test-sheets — verifica que la conexión a Google Sheets funciona */
  app.post('/api/export/test-sheets', requireAuth, requireRole('admin'), async (_req, res) => {
    const sheetsId = process.env.GOOGLE_SHEETS_ID;
    const keyPath  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!sheetsId || !keyPath) {
      return res.status(400).json({ success: false, message: 'GOOGLE_SHEETS_ID y GOOGLE_SERVICE_ACCOUNT_KEY_PATH deben estar en .env' });
    }
    try {
      const { runSheetsExport } = await import('./scripts/export-to-sheets.js') as any;
      // dry run — lee el sheet pero no escribe nada
      const r = await runSheetsExport({ limit: 0, dryRun: true, pool });
      return res.json({ success: true, message: `Conexión OK. El Sheet tiene ${r.totalRowsInSheet} filas.`, rows: r.totalRowsInSheet });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /** POST /api/export/run-now — fuerza exportación inmediata */
  app.post('/api/export/run-now', requireAuth, requireRole('admin'), async (_req, res) => {
    if (_exportRunning) {
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
    if (_exportDebounceTimer) { clearTimeout(_exportDebounceTimer); _exportDebounceTimer = null; }
    _flushToExcel(); // sin await — corre en background
    return res.json({ success: true, message: `Exportación iniciada. ${pending} empresas candidatas.`, pending });
  });

  // ── Service Templates ─────────────────────────────────────────────────────────

  /** GET /api/service-templates — lista todas las plantillas */
  app.get('/api/service-templates', requireAuth, async (_req, res) => {
    const r = await pool.query(`SELECT * FROM service_templates ORDER BY service_type_id`);
    return res.json({ success: true, data: r.rows });
  });

  /** GET /api/service-templates/:serviceId — obtiene plantilla de un servicio */
  app.get('/api/service-templates/:serviceId', requireAuth, async (req, res) => {
    const r = await pool.query(`SELECT * FROM service_templates WHERE service_type_id = $1`, [req.params.serviceId]);
    if (r.rows.length === 0) return res.json({ success: true, data: null });
    return res.json({ success: true, data: r.rows[0] });
  });

  /** POST /api/service-templates/:serviceId — crea o actualiza la plantilla de un servicio */
  app.post('/api/service-templates/:serviceId', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { name, content, variables } = req.body;
    if (!content) return res.status(400).json({ error: 'content requerido' });
    const r = await pool.query(`
      INSERT INTO service_templates (service_type_id, name, content, variables, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (service_type_id) DO UPDATE SET
        name = EXCLUDED.name,
        content = EXCLUDED.content,
        variables = EXCLUDED.variables,
        updated_at = NOW()
      RETURNING *
    `, [serviceId, name || '', content, JSON.stringify(variables || [])]);
    return res.json({ success: true, data: r.rows[0] });
  });

  /** DELETE /api/service-templates/:serviceId */
  app.delete('/api/service-templates/:serviceId', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    await pool.query(`DELETE FROM service_templates WHERE service_type_id = $1`, [req.params.serviceId]);
    return res.json({ success: true });
  });

  /** POST /api/service-templates/:serviceId/fill — rellena plantilla con datos de empresa */
  app.post('/api/service-templates/:serviceId/fill', requireAuth, async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { companyId } = req.body;

    const tmplRes = await pool.query(`SELECT * FROM service_templates WHERE service_type_id = $1`, [serviceId]);
    if (tmplRes.rows.length === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const tmpl = tmplRes.rows[0];
    let filled = tmpl.content;

    if (companyId) {
      const coRes = await pool.query(`
        SELECT c.*, COALESCE(c.name,'') as company_name
        FROM companies c WHERE c.id = $1
      `, [companyId]);
      if (coRes.rows.length > 0) {
        const co = coRes.rows[0];
        const today = new Date().toLocaleDateString('en-CA', { dateStyle: 'long' });
        filled = filled
          .replace(/\{\{company_name\}\}/gi, co.name || '')
          .replace(/\{\{contact_email\}\}/gi, co.contact_email || '')
          .replace(/\{\{phone\}\}/gi, co.phone || '')
          .replace(/\{\{city\}\}/gi, co.hq_city || '')
          .replace(/\{\{province\}\}/gi, co.hq_province || '')
          .replace(/\{\{address\}\}/gi, co.exact_address || '')
          .replace(/\{\{industry\}\}/gi, co.industry || '')
          .replace(/\{\{website\}\}/gi, co.website || '')
          .replace(/\{\{date\}\}/gi, today);
      }
    }

    return res.json({ success: true, filled, template: tmpl });
  });

  /** POST /api/service-templates/:serviceId/ai-improve — IA mejora la carta para una empresa */
  app.post('/api/service-templates/:serviceId/ai-improve', requireAuth, async (req: AuthRequest, res) => {
    const { serviceId } = req.params;
    const { filledContent, companyId, language } = req.body;

    if (!filledContent) return res.status(400).json({ error: 'filledContent requerido' });

    let companyContext = '';
    if (companyId) {
      const coRes = await pool.query(`SELECT name, industry, description, hq_city, hq_province FROM companies WHERE id = $1`, [companyId]);
      if (coRes.rows.length > 0) {
        const co = coRes.rows[0];
        companyContext = `\nCompany context: ${co.name}, industry: ${co.industry || 'unknown'}, city: ${co.hq_city || 'unknown'}, description: ${co.description || 'N/A'}`;
      }
    }

    const prompt = `You are an expert B2B sales email copywriter. Review this staffing offer email and provide:
1. An improved version of the email (more persuasive, professional, concise)
2. 3 specific improvement suggestions

${companyContext}

Original email:
---
${filledContent}
---

Respond in ${language || 'English'} with JSON format:
{
  "improved": "...full improved email text...",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}`;

    try {
      const aiText = await GeminiService.generateText(prompt);
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ success: true, improved: aiText, suggestions: [] });
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({ success: true, ...parsed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
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
    if (isRegionFilterActive()) {
      console.log(`🍁 Filtro regional ACTIVO: REGION_FILTER=${REGION_FILTER}`);
    } else {
      console.log(`🌐 Sin filtro regional (REGION_FILTER vacío)`);
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
