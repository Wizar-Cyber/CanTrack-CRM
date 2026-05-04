import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { AuthRequest, createRequireAuth, requireRole } from '../middleware/auth.middleware.js';

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
      const searchTerm = `%${search}%`;

      // Count total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM ${tableName}
         WHERE is_duplicate = FALSE AND (nombre ILIKE $1 OR correo ILIKE $1 OR ciudad ILIKE $1)`,
        [searchTerm]
      );

      // Fetch paginated
      const companiesResult = await pool.query(
        `SELECT * FROM ${tableName}
         WHERE is_duplicate = FALSE AND (nombre ILIKE $1 OR correo ILIKE $1 OR ciudad ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchTerm, limit, offset]
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

  return router;
}

export function createOntarioRouter(pool: Pool) {
  return createCompanyImportRouter(pool, 'ontario_companies', 'Ontario');
}

export function createQuebecRouter(pool: Pool) {
  return createCompanyImportRouter(pool, 'quebec_companies', 'Quebec');
}
