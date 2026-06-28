// ⚠️ dotenv MUST be loaded before any other import that reads process.env
import 'dotenv/config';

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pkg from 'pg';
const { Pool } = pkg;
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createRequireAuth } from './server/middleware/auth.middleware.js';
import { initCronJobs } from './server/automation/cron-jobs.js';
import { requestIdMiddleware } from './server/middleware/request-id.middleware.js';
import { auditLogMiddleware } from './server/middleware/audit-log.middleware.js';
import { logger } from './server/lib/logger.js';
import { env, jwt as jwtCfg, db as dbCfg } from './server/lib/config.js';
import {
  REGION_FILTER, isRegionFilterActive,
} from "./server/utils/region-filter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Global error handlers ─────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception');
  process.exit(1);
});

// ── PostgreSQL Pool ───────────────────────────────────────────────────────────
const pool = dbCfg.pool;

pool.connect((err) => {
  if (err) {
    logger.error({ err }, 'PostgreSQL connection failed');
  } else {
    logger.info('PostgreSQL connected successfully');
    runMigrations().then(() => initCronJobs(pool));
  }
});

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

      -- Automatización de campañas
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_enabled        BOOLEAN     NOT NULL DEFAULT FALSE;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_ontario        BOOLEAN     NOT NULL DEFAULT TRUE;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_quebec         BOOLEAN     NOT NULL DEFAULT TRUE;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_new_days       INTEGER     NOT NULL DEFAULT 15;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_resend_days    INTEGER     NOT NULL DEFAULT 90;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_min_gap_days   INTEGER     NOT NULL DEFAULT 60;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_schedule_hour  INTEGER     NOT NULL DEFAULT 8;
      ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS auto_last_run_at    TIMESTAMPTZ;

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
    // Migración: tablas Ontario y Quebec (base de datos histórica)
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_skills (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
        skill VARCHAR(100) NOT NULL,
        UNIQUE(candidate_id, skill)
      );

      CREATE TABLE IF NOT EXISTS ontario_companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre TEXT NOT NULL,
        telefono TEXT, tipo TEXT, correo TEXT, direccion TEXT,
        provincia TEXT, region TEXT, ciudad TEXT, pueblo TEXT,
        work TEXT, descripcion TEXT, dominio_de_pagina TEXT,
        lista_de_llamadas TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quebec_companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre TEXT NOT NULL,
        telefono TEXT, tipo TEXT, correo TEXT, direccion TEXT,
        provincia TEXT, region TEXT, ciudad TEXT, pueblo TEXT,
        work TEXT, descripcion TEXT, dominio_de_pagina TEXT,
        lista_de_llamadas TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ontario_companies_nombre_unique
        ON ontario_companies (LOWER(TRIM(nombre))) WHERE is_duplicate = FALSE;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_quebec_companies_nombre_unique
        ON quebec_companies (LOWER(TRIM(nombre))) WHERE is_duplicate = FALSE;
      CREATE INDEX IF NOT EXISTS idx_ontario_companies_created_at ON ontario_companies(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_quebec_companies_created_at  ON quebec_companies(created_at DESC);
    `);
    // Idempotent column additions (ALTER TABLE IF NOT EXISTS column)
    for (const tbl of ['ontario_companies', 'quebec_companies']) {
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS last_campaign_at   TIMESTAMPTZ`);
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS email_status       VARCHAR(20) DEFAULT 'unknown'`);
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS email_bounce_count INTEGER     DEFAULT 0`);
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS email_blocked_at   TIMESTAMPTZ`);
    }
    // Tabla de supresión global de emails (bounces, unsubscribes, bloqueados manualmente)
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_suppression (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email      TEXT,
        domain     TEXT,
        reason     VARCHAR(50) NOT NULL,
        source     VARCHAR(50) NOT NULL DEFAULT 'manual',
        notes      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT chk_email_or_domain CHECK (email IS NOT NULL OR domain IS NOT NULL)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_email  ON email_suppression (LOWER(email))  WHERE email  IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_domain ON email_suppression (LOWER(domain)) WHERE domain IS NOT NULL;
    `);
    // Migración: mapeo region+work → templateId UUID de mDirector Plantillas
    await client.query(`
      CREATE TABLE IF NOT EXISTS mdirector_template_map (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        region       TEXT NOT NULL CHECK (region IN ('ontario', 'quebec')),
        work_label   TEXT NOT NULL,
        template_id  TEXT NOT NULL,
        template_name TEXT,
        language     TEXT NOT NULL DEFAULT 'en',
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(region, work_label)
      );
      CREATE INDEX IF NOT EXISTS idx_mdirector_template_map_region_work
        ON mdirector_template_map(region, work_label);
    `);
    // Automation: alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_alerts (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type         VARCHAR(60) NOT NULL,
        affected_entity VARCHAR(200),
        message      TEXT,
        resolved     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        resolved_at  TIMESTAMPTZ,
        UNIQUE(type, affected_entity)
      );
      CREATE INDEX IF NOT EXISTS idx_automation_alerts_resolved ON automation_alerts(resolved, created_at DESC);
    `);
    // Automation: log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_log (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job        VARCHAR(60) NOT NULL,
        status     VARCHAR(20) NOT NULL DEFAULT 'ok',
        message    TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_automation_log_job ON automation_log(job, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);
    `);
    // Unique index to prevent duplicate jobs (same company+title)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_company_title_dedup
        ON jobs (LOWER(TRIM(COALESCE(raw_company_name,''))), LOWER(TRIM(COALESCE(title,''))))
        WHERE is_active = true;
    `).catch(() => {});

    // ═══════════════════════════════════════════════════════════════════════
    // RUTAS MIGRATION — tablas para gestionar rutas de visitas
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_status') THEN
          CREATE TYPE route_status AS ENUM ('draft','active','paused','completed','cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stop_status') THEN
          CREATE TYPE stop_status AS ENUM ('pending','visited','skipped','failed');
        END IF;
      END $$;

      ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_lat DOUBLE PRECISION;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_lng DOUBLE PRECISION;
      
      ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
      
      ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE ontario_companies ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
      ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE quebec_companies ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name           VARCHAR(200) NOT NULL,
        start_address  VARCHAR(300) NOT NULL,
        start_lat      DOUBLE PRECISION,
        start_lng      DOUBLE PRECISION,
        return_to_start BOOLEAN NOT NULL DEFAULT FALSE,
        average_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 30.0,
        total_distance_km DOUBLE PRECISION,
        estimated_time_minutes DOUBLE PRECISION,
        status         route_status NOT NULL DEFAULT 'draft',
        notes          TEXT,
        created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at     TIMESTAMPTZ,
        completed_at   TIMESTAMPTZ,
        paused_at      TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
      CREATE INDEX IF NOT EXISTS idx_routes_created_at ON routes(created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_stops (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        route_id           UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
        company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
        order_index        INTEGER NOT NULL,
        address           VARCHAR(300) NOT NULL,
        lat               DOUBLE PRECISION,
        lng               DOUBLE PRECISION,
        label             VARCHAR(200),
        distance_from_previous_km DOUBLE PRECISION DEFAULT 0,
        status            stop_status NOT NULL DEFAULT 'pending',
        visited_at        TIMESTAMPTZ,
        notes             TEXT,
        UNIQUE(route_id, order_index)
      );
      CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON route_stops(route_id);
      CREATE INDEX IF NOT EXISTS idx_route_stops_status ON route_stops(status);
    `);

    console.log("✅ Migraciones de rutas aplicadas.");
  } catch (err: any) {
    console.error("⚠️ Error en migraciones (puede ignorarse si ya aplicadas):", err.message);
  } finally {
    client.release();
  }
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

  // ── Request ID Middleware ──────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── Security Headers ───────────────────────────────────────────────────────
  app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  }));
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ── Audit Log Middleware ───────────────────────────────────────────────────
  app.use(auditLogMiddleware);

  // ── Rate Limiters ───────────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password change attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests. Try again in 1 minute.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const heavyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Heavy operation limit reached.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const setupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Setup limit reached.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Too many agent requests.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to API routes
  app.use('/api/agent/', agentLimiter);
  app.use('/api/', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/password', passwordLimiter);
  app.use('/api/auth/setup', setupLimiter);
  app.use('/api/routes/create-batch', heavyLimiter);
  app.use('/api/webhook', heavyLimiter);

  // ── Route modules ────────────────────────────────────────────────────────────
  const { createHealthRouter }       = await import('./server/routes/health.routes.js');
  const { createAuthRouter }         = await import('./server/routes/auth.routes.js');
  const { createJobsRouter }         = await import('./server/routes/jobs.routes.js');
  const { createCompaniesRouter }    = await import('./server/routes/companies.routes.js');
  const { createSyncRouter }         = await import('./server/routes/sync.routes.js');
  const { createCandidatesRouter }   = await import('./server/routes/candidates.routes.js');
  const { createCampaignRouter }     = await import('./server/routes/campaign.routes.js');
  const { createExportRouter }       = await import('./server/routes/export.routes.js');
  const { createServiceTemplatesRouter } = await import('./server/routes/service-templates.routes.js');
  const { createVisitsRouter }       = await import('./server/routes/visits.routes.js');
  const { createWebhookRouter }      = await import('./server/routes/webhook.routes.js');
  const { createWorkflowRouter }     = await import('./server/routes/workflow.routes.js');

  const { createOntarioRouter, createQuebecRouter } = await import('./server/routes/ontario.routes.js') as any;

  app.use('/api', createHealthRouter(pool));
  app.use('/api', createAuthRouter(pool));
  app.use('/api', createJobsRouter(pool));
  app.use('/api', createCompaniesRouter(pool));
  app.use('/api', createSyncRouter(pool));
  app.use('/api', createCandidatesRouter(pool));
  app.use('/api', createCampaignRouter(pool));
  app.use('/api', createExportRouter(pool));
  app.use('/api', createServiceTemplatesRouter(pool));
  app.use('/api', createVisitsRouter(pool));
  app.use('/api', createWebhookRouter(pool));
  app.use('/api', createWorkflowRouter(pool));
  app.use('/api/ontario', createOntarioRouter(pool));
  app.use('/api/quebec',  createQuebecRouter(pool));

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
