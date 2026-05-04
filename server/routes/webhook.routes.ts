import { Router, Response, Request } from 'express';
import type { Pool } from 'pg';

const VALID_SOURCES = new Set(['linkedin', 'indeed', 'glassdoor', 'company_website', 'other']);

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeOptional(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeCompanyName(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

async function insertImportedCompany(pool: Pool, tableName: 'ontario_companies' | 'quebec_companies', body: Record<string, unknown>) {
  const { nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas } = body;
  const nombreLimpio = normalizeOptional(nombre);
  if (!nombreLimpio) {
    return { status: 400, payload: { error: 'Campo requerido: nombre.' } };
  }

  const duplicateCheck = await pool.query(
    `SELECT id, nombre FROM ${tableName}
     WHERE LOWER(REGEXP_REPLACE(TRIM(nombre), '\\s+', ' ', 'g')) = $1
       AND is_duplicate = FALSE
     LIMIT 1`,
    [normalizeCompanyName(nombreLimpio)]
  );

  if (duplicateCheck.rows.length > 0) {
    return {
      status: 409,
      payload: {
        success: false,
        message: 'Empresa ya existe',
        duplicate: true,
        existing_id: duplicateCheck.rows[0].id,
        existing_name: duplicateCheck.rows[0].nombre,
      },
      duplicateName: nombreLimpio,
    };
  }

  const result = await pool.query(
    `INSERT INTO ${tableName}
     (nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
     RETURNING id`,
    [
      nombreLimpio,
      normalizeOptional(telefono),
      normalizeOptional(tipo),
      normalizeOptional(correo),
      normalizeOptional(direccion),
      normalizeOptional(provincia),
      normalizeOptional(region),
      normalizeOptional(ciudad),
      normalizeOptional(pueblo),
      normalizeOptional(work),
      normalizeOptional(descripcion),
      normalizeOptional(dominio_de_pagina),
      normalizeOptional(lista_de_llamadas),
    ]
  );

  return {
    status: 201,
    payload: {
      success: true,
      company_id: result.rows[0].id,
      message: 'Empresa insertada correctamente',
    },
    insertedName: nombreLimpio,
    insertedId: result.rows[0].id,
  };
}

export function createWebhookRouter(pool: Pool) {
  const router = Router();

  // POST /api/webhook/scraper — called by external scrapers, authenticated by secret header
  router.post('/scraper', async (req: Request, res: Response) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    const { fuente, titulo, empresa, url_postulacion } = req.body;
    if (!empresa || !titulo || !url_postulacion)
      return res.status(400).json({ error: 'Campos requeridos: empresa, titulo, url_postulacion.' });

    try {
      const sourceCandidate = normalizeText(fuente).toLowerCase();
      const source = VALID_SOURCES.has(sourceCandidate) ? sourceCandidate : 'other';
      const applicationUrl = normalizeText(url_postulacion);
      
      // ── Verificar duplicados por URL ──────────────────────────────────────
      const duplicateCheck = await pool.query(
        `SELECT id FROM jobs WHERE url = $1 LIMIT 1`,
        [applicationUrl]
      );
      
      if (duplicateCheck.rows.length > 0) {
        console.log(`[Webhook/Scraper] Duplicado por URL: ${applicationUrl}`);
        return res.status(409).json({
          success: false,
          message: 'URL ya existe',
          duplicate: true,
          existing_id: duplicateCheck.rows[0].id,
        });
      }

      // ── Insertar en jobs con raw_company_name ────────────────────────────
      const result = await pool.query(
        `INSERT INTO jobs (raw_company_name, title, source, url)
         VALUES ($1, $2, $3::job_source_enum, $4)
         RETURNING id`,
        [normalizeText(empresa), normalizeText(titulo), source, applicationUrl]
      );

      // ── Log ──────────────────────────────────────────────────────────────
      console.log(`[Webhook/Scraper] Job insertado: ${result.rows[0].id} (${empresa} - ${titulo})`);
      
      return res.json({ 
        success: true, 
        job_id: result.rows[0].id,
        message: 'Job insertado correctamente' 
      });
    } catch (error) {
      console.error('[Webhook Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/webhook/ontario — Recibir datos de Ontario Companies post-scrape
  router.post('/ontario', async (req: Request, res: Response) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    try {
      const result = await insertImportedCompany(pool, 'ontario_companies', req.body);
      if ('duplicateName' in result) console.log(`[Webhook/Ontario] Duplicado por nombre: ${result.duplicateName}`);
      if ('insertedName' in result) console.log(`[Webhook/Ontario] Empresa insertada: ${result.insertedId} (${result.insertedName})`);
      return res.status(result.status).json(result.payload);
    } catch (error) {
      console.error('[Webhook/Ontario Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/webhook/quebec — Recibir datos de Quebec Companies post-scrape
  router.post('/quebec', async (req: Request, res: Response) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Webhook secret inválido.' });

    try {
      const result = await insertImportedCompany(pool, 'quebec_companies', req.body);
      if ('duplicateName' in result) console.log(`[Webhook/Quebec] Duplicado por nombre: ${result.duplicateName}`);
      if ('insertedName' in result) console.log(`[Webhook/Quebec] Empresa insertada: ${result.insertedId} (${result.insertedName})`);
      return res.status(result.status).json(result.payload);
    } catch (error) {
      console.error('[Webhook/Quebec Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
}
