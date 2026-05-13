import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { AuthRequest, createRequireAuth, requireRole } from '../middleware/auth.middleware.js';
import { EnrichmentService } from '../services/enrichment.service.js';

const ALLOWED_ONTARIO_COLUMNS = new Set([
  'nombre',
  'telefono',
  'tipo',
  'correo',
  'direccion',
  'provincia',
  'region',
  'ciudad',
  'pueblo',
  'work',
  'descripcion',
  'dominio_de_pagina',
  'lista_de_llamadas',
  'is_duplicate',
  'status',
]);

const TABLES = {
  ontario_companies: true,
  quebec_companies: true,
} as const;

type CompanyImportTable = keyof typeof TABLES;

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function createCompanyImportRouter(pool: Pool, tableName: CompanyImportTable, label: string) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  /**
   * GET /api/{province}/companies
   * Obtener todas las empresas importadas (con paginación)
   */
  router.get('/companies', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(_req.query.page ?? '1'), 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(String(_req.query.limit ?? '50'), 10) || 50));
      const offset = (page - 1) * limit;
      const search = String(_req.query.search ?? '').trim();
      const work = String(_req.query.work ?? '').trim();
      const searchTerm = `%${search}%`;

      const whereParts = [
        'is_duplicate = FALSE',
        '(nombre ILIKE $1 OR correo ILIKE $1 OR ciudad ILIKE $1)',
      ];
      const params: any[] = [searchTerm];

      if (work) {
        params.push(work);
        whereParts.push(`work ILIKE $${params.length}`);
      }

      const where = whereParts.join(' AND ');

      // Count total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM ${tableName} WHERE ${where}`,
        params
      );

      // Fetch paginated
      const companiesResult = await pool.query(
        `SELECT * FROM ${tableName} WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      return res.json({
        data: companiesResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total, 10),
          page,
          limit,
          pages: Math.ceil(parseInt(countResult.rows[0].total, 10) / limit)
        }
      });
    } catch (error) {
      console.error(`[${label}/Companies GET Error]:`, error);
      return res.status(500).json({ error: 'Error al obtener empresas' });
    }
  });

  /**
   * GET /api/{province}/companies/:id
   * Obtener detalle de una empresa
   */
  router.get('/companies/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND is_duplicate = FALSE`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error(`[${label}/Company Detail Error]:`, error);
      return res.status(500).json({ error: 'Error al obtener empresa' });
    }
  });

  /**
   * POST /api/{province}/companies
   * Crear nueva empresa con verificación de duplicados
   */
  router.post('/companies', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas } = req.body;

      // Validar nombre
      if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre es requerido' });
      }

      const nombreNorm = normalizeName(nombre);

      // Verificar si ya existe
      const existing = await pool.query(
        `SELECT id, nombre FROM ${tableName}
         WHERE LOWER(REGEXP_REPLACE(TRIM(nombre), '\\s+', ' ', 'g')) = $1
           AND is_duplicate = FALSE`,
        [nombreNorm]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Empresa ya existe',
          existing_id: existing.rows[0].id,
          existing_name: existing.rows[0].nombre
        });
      }

      // Insertar nuevo
      const result = await pool.query(
        `INSERT INTO ${tableName}
         (nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
         RETURNING *`,
        [nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas]
      );

      return res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Empresa importada exitosamente'
      });
    } catch (error) {
      console.error(`[${label}/Create Error]:`, error);
      return res.status(500).json({ error: 'Error al crear empresa' });
    }
  });

  /**
   * POST /api/{province}/bulk-import
   * Importar múltiples empresas desde JSON con validación de duplicados
   */
  router.post('/bulk-import', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { companies } = req.body;
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ error: 'Se requiere array de empresas' });
      }

      const results = {
        total: companies.length,
        imported: 0,
        duplicates: [] as Array<{ nombre: string; reason: string }>,
        errors: [] as Array<{ nombre: string; error: string }>
      };

      // Get existing names
      const existingResult = await pool.query(
        `SELECT LOWER(REGEXP_REPLACE(TRIM(nombre), '\\s+', ' ', 'g')) as nombre_norm
         FROM ${tableName}
         WHERE is_duplicate = FALSE`
      );
      const existingNames = new Set(existingResult.rows.map(r => r.nombre_norm));

      // Process each company
      for (const company of companies) {
        const { nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas } = company;

        // Validate
        if (!nombre || String(nombre).trim() === '') {
          results.errors.push({ nombre: '(sin nombre)', error: 'Nombre requerido' });
          continue;
        }

        const nombreNorm = normalizeName(nombre);

        // Check duplicate
        if (existingNames.has(nombreNorm)) {
          results.duplicates.push({ nombre, reason: 'Ya existe en BD' });
          continue;
        }

        try {
          await pool.query(
            `INSERT INTO ${tableName}
             (nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')`,
            [nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas]
          );
          existingNames.add(nombreNorm);
          results.imported++;
        } catch (err: any) {
          if (err.code === '23505') {
            results.duplicates.push({ nombre, reason: 'Duplicado (race condition)' });
          } else {
            results.errors.push({ nombre, error: err.message });
          }
        }
      }

      console.log(`[${label} Import] ${results.imported} nuevas, ${results.duplicates.length} duplicadas, ${results.errors.length} errores`);

      return res.json({
        success: true,
        stats: results,
        message: `Importadas ${results.imported}/${results.total}. ${results.duplicates.length} duplicadas, ${results.errors.length} errores.`
      });
    } catch (error) {
      console.error(`[${label}/Bulk Import Error]:`, error);
      return res.status(500).json({ error: 'Error en importación' });
    }
  });

  /**
   * PUT /api/{province}/companies/:id
   * Actualizar empresa
   */
  router.put('/companies/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Build dynamic UPDATE
      const fields = Object.keys(updates).filter(k => ALLOWED_ONTARIO_COLUMNS.has(k));
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      const setClause = fields.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
      const values = fields.map(f => updates[f]);
      values.push(id);

      const result = await pool.query(
        `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error(`[${label}/Update Error]:`, error);
      return res.status(500).json({ error: 'Error al actualizar' });
    }
  });

  /**
   * DELETE /api/{province}/companies/:id
   * Marcar como duplicado (soft delete)
   */
  router.delete('/companies/:id', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `UPDATE ${tableName} SET is_duplicate = TRUE, status = 'deleted', updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }

      return res.json({ success: true, message: 'Empresa marcada como duplicada' });
    } catch (error) {
      console.error(`[${label}/Delete Error]:`, error);
      return res.status(500).json({ error: 'Error al eliminar' });
    }
  });

  /**
   * GET /api/{province}/stats
   * Estadísticas de importación
   */
  router.get('/stats', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_duplicate = FALSE)::int as active,
          COUNT(*) FILTER (WHERE is_duplicate = TRUE)::int as duplicates,
          COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
          COUNT(*) FILTER (WHERE status = 'processed')::int as processed,
          COUNT(*)::int as total
        FROM ${tableName}
      `);

      return res.json(result.rows[0]);
    } catch (error) {
      console.error(`[${label}/Stats Error]:`, error);
      return res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  });

  /**
   * GET /api/{province}/distinct-work
   * Valores únicos de 'work' para filtro en el frontend
   */
  router.get('/distinct-work', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT work FROM ${tableName}
         WHERE work IS NOT NULL AND TRIM(work) != '' AND is_duplicate = FALSE
         ORDER BY work`
      );
      return res.json(result.rows.map(r => r.work));
    } catch (error) {
      return res.status(500).json({ error: 'Error al obtener valores de work' });
    }
  });

  /**
   * POST /api/{province}/enrich-next
   * Enriquece la próxima empresa sin datos completos usando IA.
   * Valida que el resultado tenga al menos email, teléfono o dirección
   * antes de escribir en la tabla.
   */
  router.post('/enrich-next', requireAuth, requireRole('admin', 'editor'), async (_req: AuthRequest, res: Response) => {
    try {
      // Tomar empresa con datos incompletos (sin email Y sin teléfono Y sin dirección)
      const lock = await pool.query(`
        UPDATE ${tableName}
        SET status = 'enriching'
        WHERE id = (
          SELECT id FROM ${tableName}
          WHERE is_duplicate = FALSE
            AND status NOT IN ('enriching', 'processed', 'deleted')
            AND (correo IS NULL OR TRIM(correo) = '')
            AND (telefono IS NULL OR TRIM(telefono) = '')
            AND (direccion IS NULL OR TRIM(direccion) = '')
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, nombre
      `);

      if (lock.rows.length === 0) {
        return res.json({ done: true, message: 'No hay empresas pendientes de enriquecimiento.' });
      }

      const { id, nombre } = lock.rows[0];

      const data = await EnrichmentService.enrichCompany(nombre);

      // Validar que tenga datos útiles mínimos para empresas canadienses
      const correo    = data.contact_email?.trim() || null;
      const telefono  = data.phone?.trim() || null;
      const direccion = data.exact_address?.trim() || null;
      const ciudad    = data.hq_city?.trim() || null;
      const provincia = data.hq_province?.trim() || null;
      const pueblo    = data.hq_town?.trim() || null;
      const region    = data.hq_region?.trim() || null;
      const descripcion = data.description?.trim() || null;
      const dominio   = data.website?.trim() || null;
      const tipoRaw   = (data as any).tipo?.trim().toLowerCase() || null;
      const primaryService = (data as any).primary_service?.trim().toUpperCase() || null;

      const VALID_TIPOS = new Set(['verde', 'naranja', 'morado', 'rojo']);
      const tipo = tipoRaw && VALID_TIPOS.has(tipoRaw) ? tipoRaw : null;

      // Require at minimum correo AND direccion to write the record
      const hasMinimum = correo && direccion;

      if (!hasMinimum) {
        await pool.query(
          `UPDATE ${tableName} SET status = 'pending', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        return res.json({ done: false, skipped: true, id, nombre, reason: 'sin_correo_o_direccion' });
      }

      // Validar provincia: solo aceptar provincias canadienses conocidas
      const CANADIAN_PROVINCES = new Set([
        'ON','QC','BC','AB','MB','SK','NS','NB','NL','PE','NT','NU','YT',
        'Ontario','Quebec','British Columbia','Alberta','Manitoba',
        'Saskatchewan','Nova Scotia','New Brunswick','Newfoundland',
      ]);
      const provinciaValida = provincia && CANADIAN_PROVINCES.has(provincia) ? provincia : null;

      await pool.query(
        `UPDATE ${tableName}
         SET correo = COALESCE(NULLIF($1,''), correo),
             telefono = COALESCE(NULLIF($2,''), telefono),
             direccion = COALESCE(NULLIF($3,''), direccion),
             ciudad = COALESCE(NULLIF($4,''), ciudad),
             provincia = COALESCE(NULLIF($5,''), provincia),
             pueblo = COALESCE(NULLIF($6,''), pueblo),
             region = COALESCE(NULLIF($7,''), region),
             descripcion = COALESCE(NULLIF($8,''), descripcion),
             dominio_de_pagina = COALESCE(NULLIF($9,''), dominio_de_pagina),
             tipo = COALESCE($10, tipo),
             work = COALESCE(NULLIF($11,''), work),
             status = 'processed',
             updated_at = NOW()
         WHERE id = $12`,
        [correo, telefono, direccion, ciudad, provinciaValida, pueblo, region, descripcion, dominio, tipo, primaryService, id]
      );

      return res.json({
        done: false,
        id,
        nombre,
        enriched: { correo: !!correo, telefono: !!telefono, direccion: !!direccion, ciudad: !!ciudad, tipo, work: primaryService },
      });
    } catch (error) {
      console.error(`[${label}/enrich-next Error]:`, error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}

export function createOntarioRouter(pool: Pool) {
  return createCompanyImportRouter(pool, 'ontario_companies', 'Ontario');
}

export function createQuebecRouter(pool: Pool) {
  return createCompanyImportRouter(pool, 'quebec_companies', 'Quebec');
}
