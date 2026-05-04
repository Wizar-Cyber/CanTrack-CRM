import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// ── Guard required env vars before anything else ──────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está configurado en .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL no está configurado en .env');
  process.exit(1);
}

// ── Routers ───────────────────────────────────────────────────────────────────
import { createAuthRouter }         from './server/routes/auth.routes.js';
import { createCompaniesRouter }    from './server/routes/companies.routes.js';
import { createJobsRouter }         from './server/routes/jobs.routes.js';
import { createCandidatesRouter }   from './server/routes/candidates.routes.js';
import { createApplicationsRouter } from './server/routes/applications.routes.js';
import { createEnrichmentRouter }   from './server/routes/enrichment.routes.js';
import { createSyncRouter }         from './server/routes/sync.routes.js';
import { createWebhookRouter }      from './server/routes/webhook.routes.js';
import { createOntarioRouter, createQuebecRouter } from './server/routes/ontario.routes.js';
import { errorHandler }             from './server/middleware/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── PostgreSQL Pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:                    parseInt(process.env.DATABASE_POOL_SIZE ?? '10', 10),
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 5_000,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL conectado correctamente.');
    runMigrations();
  }
});

// ── Migrations (additive-only, safe to run on every start) ───────────────────
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      ALTER TABLE companies DROP COLUMN IF EXISTS sector;
      ALTER TABLE companies DROP COLUMN IF EXISTS is_publicly_traded;
      ALTER TABLE companies DROP COLUMN IF EXISTS stock_ticker;
      ALTER TABLE companies DROP COLUMN IF EXISTS confidence_score;
      ALTER TABLE companies DROP COLUMN IF EXISTS needs_manual_review;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone         VARCHAR(60);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS raw_company_name VARCHAR(255);

      CREATE TABLE IF NOT EXISTS ontario_companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre TEXT NOT NULL,
        telefono TEXT,
        tipo TEXT,
        correo TEXT,
        direccion TEXT,
        provincia TEXT,
        region TEXT,
        ciudad TEXT,
        pueblo TEXT,
        work TEXT,
        descripcion TEXT,
        dominio_de_pagina TEXT,
        lista_de_llamadas TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quebec_companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre TEXT NOT NULL,
        telefono TEXT,
        tipo TEXT,
        correo TEXT,
        direccion TEXT,
        provincia TEXT,
        region TEXT,
        ciudad TEXT,
        pueblo TEXT,
        work TEXT,
        descripcion TEXT,
        dominio_de_pagina TEXT,
        lista_de_llamadas TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE ontario_companies ALTER COLUMN nombre TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN telefono TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN tipo TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN correo TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN provincia TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN region TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN ciudad TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN pueblo TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN work TYPE TEXT;
      ALTER TABLE ontario_companies ALTER COLUMN dominio_de_pagina TYPE TEXT;

      ALTER TABLE quebec_companies ALTER COLUMN nombre TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN telefono TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN tipo TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN correo TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN provincia TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN region TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN ciudad TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN pueblo TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN work TYPE TEXT;
      ALTER TABLE quebec_companies ALTER COLUMN dominio_de_pagina TYPE TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ontario_companies_nombre_unique
        ON ontario_companies (LOWER(TRIM(nombre)))
        WHERE is_duplicate = FALSE;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_quebec_companies_nombre_unique
        ON quebec_companies (LOWER(TRIM(nombre)))
        WHERE is_duplicate = FALSE;

      CREATE INDEX IF NOT EXISTS idx_ontario_companies_created_at
        ON ontario_companies(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_quebec_companies_created_at
        ON quebec_companies(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);
    `);
    console.log('✅ Migraciones aplicadas correctamente.');
  } catch (err: unknown) {
    const e = err as Error;
    console.error('⚠️ Error en migraciones (puede ignorarse si ya aplicadas):', e.message);
  } finally {
    client.release();
  }
}

// ── App bootstrap ─────────────────────────────────────────────────────────────
async function startServer() {
  const app  = express();
  const PORT = parseInt(process.env.PORT ?? '3000', 10);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"], // Vite HMR requires inline scripts in dev
        styleSrc:   ["'self'", "'unsafe-inline'"], // Tailwind requires this
        imgSrc:     ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // allow Vite dev assets
  }));

  // CORS — restrict to allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true, // required for httpOnly cookies
  }));

  // Body parsing & cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ── API Routes ──────────────────────────────────────────────────────────────
  app.use('/api/auth',        createAuthRouter(pool));
  app.use('/api/companies',   createCompaniesRouter(pool));
  app.use('/api/jobs',        createJobsRouter(pool));
  app.use('/api/candidates',  createCandidatesRouter(pool));
  app.use('/api/apply',       createApplicationsRouter(pool));
  app.use('/api/enrichment',  createEnrichmentRouter(pool));
  app.use('/api/sync',        createSyncRouter(pool));
  app.use('/api/webhook',     createWebhookRouter(pool));
  app.use('/api/ontario',     createOntarioRouter(pool));
  app.use('/api/quebec',      createQuebecRouter(pool));

  // Convenience aliases used by the frontend
  // POST /api/stats → GET /api/jobs/stats/dashboard
  app.get('/api/stats', async (_req, res) => {
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

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Centralised error handler (must be after all routes) ───────────────────
  app.use(errorHandler);

  // ── Static / Vite dev server ────────────────────────────────────────────────
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
