import { Router, Response } from 'express';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { haversine } from '../utils/geo.js';
import { REGION_FILTER, isRegionFilterActive, companyRegionClause } from '../utils/region-filter.js';

export function createVisitsRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // ═════════════════════════════════════════════════════════════════════════
  // RUTAS API — Gestión de rutas de visitas
  // ═════════════════════════════════════════════════════════════════════════

  const OPTIMUS_URL = process.env.OPTIMUS_URL || 'http://localhost:8000';

  // POST /api/routes/optimize — llama a Optimus_rutas para optimizar una ruta
  router.post('/routes/optimize', requireAuth, async (req, res) => {
    const { startAddress, stops, returnToStart } = req.body;

    if (!startAddress || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'startAddress y stops son requeridos.' });
    }

    // Validar direcciones
    const validatedStops = await Promise.all(
      stops.map(async (stop: any) => {
        const address = stop.address || stop;
        try {
          const encoded = encodeURIComponent(address);
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`, {
            headers: { 'User-Agent': 'CanTrackCRM/1.0' }
          });
          const geoData = await geoRes.json();
          
          if (geoData && geoData.length > 0) {
            return {
              address,
              label: stop.label,
              lat: parseFloat(geoData[0].lat),
              lng: parseFloat(geoData[0].lon),
              valid: true,
            };
          }
          return { address, label: stop.label, valid: false };
        } catch (e) {
          return { address, label: stop.label, valid: false, error: true };
        }
      })
    );

    const validStops = validatedStops.filter(s => s.valid);
    const invalidStops = validatedStops.filter(s => !s.valid);

    if (validStops.length === 0) {
      return res.status(400).json({ 
        error: 'Ninguna dirección válida.', 
        invalidCount: invalidStops.length 
      });
    }

    try {
      const optimusRes = await fetch(`${OPTIMUS_URL}/api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'temp-route',
          start_address: startAddress,
          stops: validStops.map((s: any) => s.address),
          return_to_start: returnToStart || false,
        }),
      });

      if (!optimusRes.ok) {
        const err = await optimusRes.text();
        console.error('[Optimus error]:', err);
        return res.status(500).json({ error: 'Error al optimizar ruta.', details: err });
      }

      const optimized = await optimusRes.json();
      res.json({
        ...optimized,
        validStops: validStops.length,
        invalidStops: invalidStops.length,
        invalidAddresses: invalidStops.map(s => s.address),
      });
    } catch (error: any) {
      console.error('[Optimize route error]:', error);
      if (error.cause?.code === 'ECONNREFUSED') {
        return res.status(503).json({ error: 'Optimus_rutas no está ejecutándose.' });
      }
      res.status(500).json({ error: 'Error al optimizar ruta.' });
    }
  });

  // POST /api/routes/create-batch — crear múltiples rutas automáticas desde una ciudad o pueblo
  router.post('/routes/create-batch', requireAuth, async (req: AuthRequest, res) => {
    const {
      region,
      city,
      town,
      stopsPerRoute = 100,
      routePrefix = 'Ruta',
      averageSpeedKmh = 30,
      startAddress = '',
    } = req.body;

    if (!region) return res.status(400).json({ error: 'region es requerida.' });

    // TSP nearest-neighbor + 2-opt starting from (startLat, startLng)
    const tspOrder = (startLat: number, startLng: number, stops: any[]): any[] => {
      if (stops.length <= 1) return [...stops];

      // Phase 1: nearest-neighbor greedy
      const remaining = [...stops];
      const ordered: any[] = [];
      let curLat = startLat, curLng = startLng;
      while (remaining.length > 0) {
        let nearIdx = 0, nearDist = Infinity;
        remaining.forEach((s, i) => {
          const d = haversine(curLat, curLng, s.lat, s.lng);
          if (d < nearDist) { nearDist = d; nearIdx = i; }
        });
        const next = remaining.splice(nearIdx, 1)[0];
        ordered.push(next);
        curLat = next.lat; curLng = next.lng;
      }

      // Phase 2: 2-opt improvements (O(n²) per pass, fast for n≤150)
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < ordered.length - 1; i++) {
          for (let j = i + 1; j < ordered.length; j++) {
            const a = i === 0 ? { lat: startLat, lng: startLng } : ordered[i - 1];
            const b = ordered[i];
            const c = ordered[j];
            const d2 = j + 1 < ordered.length ? ordered[j + 1] : null;
            const before = haversine(a.lat, a.lng, b.lat, b.lng) + (d2 ? haversine(c.lat, c.lng, d2.lat, d2.lng) : 0);
            const after  = haversine(a.lat, a.lng, c.lat, c.lng) + (d2 ? haversine(b.lat, b.lng, d2.lat, d2.lng) : 0);
            if (after < before - 0.01) {
              ordered.splice(i, j - i + 1, ...ordered.slice(i, j + 1).reverse());
              improved = true;
            }
          }
        }
      }
      return ordered;
    };

    // Agrupa empresas geográficamente: siempre añade la más cercana al centroide del grupo
    const clusterByProximity = (companies: any[], batchSize: number): any[][] => {
      const remaining = [...companies];
      const batches: any[][] = [];

      while (remaining.length > 0) {
        const batch = [remaining.shift()!];
        let centLat = batch[0].lat;
        let centLng = batch[0].lng;

        while (batch.length < batchSize && remaining.length > 0) {
          let bestIdx = 0;
          let bestDist = Infinity;
          remaining.forEach((c, i) => {
            const d = haversine(centLat, centLng, c.lat, c.lng);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          });
          batch.push(remaining.splice(bestIdx, 1)[0]);
          centLat = batch.reduce((s, c) => s + c.lat, 0) / batch.length;
          centLng = batch.reduce((s, c) => s + c.lng, 0) / batch.length;
        }

        batches.push(batch);
      }
      return batches;
    };

    try {
      const table = region === 'ontario' ? 'ontario_companies' : 'quebec_companies';
      const params: any[] = [];
      const filters: string[] = [
        `direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null'`,
        `LENGTH(TRIM(direccion)) > 8`,
        `LOWER(TRIM(direccion)) NOT LIKE '%virtual%'`,
        `LOWER(TRIM(direccion)) NOT LIKE '%no tiene%'`,
        `LOWER(TRIM(direccion)) NOT LIKE '%sin direcci%'`,
        `LOWER(TRIM(direccion)) NOT LIKE '%n/a%'`,
        `lat IS NOT NULL AND lng IS NOT NULL`,
      ];

      if (town) {
        params.push(town);
        filters.push(`normalize_location_name(pueblo) = normalize_location_name($${params.length})`);
      } else if (city) {
        params.push(city);
        filters.push(`normalize_location_name(ciudad) = normalize_location_name($${params.length})`);
      }

      // 1. Fetch companies with valid addresses and coordinates
      const { rows: companies } = await pool.query(`
        SELECT id, nombre, direccion, ciudad, pueblo, provincia, telefono, lat, lng
        FROM ${table}
        WHERE ${filters.join(' AND ')}
        ORDER BY nombre
        LIMIT 2000
      `, params);

      if (companies.length === 0) {
        return res.status(400).json({
          error: 'No hay empresas con coordenadas geocodificadas en esta zona todavía. El servidor geocodifica en segundo plano — intenta de nuevo en unos minutos.',
        });
      }

      // 2. Geocode starting address (once for all batches)
      const { geocodeAddress } = await import('../automation/cron-jobs.js');
      let startLat: number;
      let startLng: number;
      let resolvedStartAddress: string;

      if (startAddress && startAddress.trim().length > 5) {
        const startCoords = await geocodeAddress(startAddress.trim(), city || town || '', region);
        if (startCoords) {
          startLat = startCoords.lat;
          startLng = startCoords.lng;
          resolvedStartAddress = startAddress.trim();
        } else {
          return res.status(400).json({ error: `No se pudo geocodificar la dirección de salida: "${startAddress}". Verifica la dirección e intenta de nuevo.` });
        }
      } else {
        // Default: centroid of all companies in the zone
        startLat = companies.reduce((s: number, c: any) => s + c.lat, 0) / companies.length;
        startLng = companies.reduce((s: number, c: any) => s + c.lng, 0) / companies.length;
        resolvedStartAddress = city || town || region;
      }

      // 3. Agrupar empresas geográficamente
      const batchSize = Math.max(10, Math.min(stopsPerRoute, 150));
      const batches = clusterByProximity(companies, batchSize);
      const locationName = town || city || region;
      const routesCreated: any[] = [];
      const numRoutes = batches.length;

      for (let i = 0; i < numRoutes; i++) {
        const batch = batches[i];
        try {
          // 4. TSP optimization from user's starting point
          let orderedBatch = tspOrder(startLat, startLng, batch);
          // Calculate total distance: startAddress -> stop[0] -> stop[1] -> ...
          let totalDistance = haversine(startLat, startLng, orderedBatch[0].lat, orderedBatch[0].lng);
          for (let j = 1; j < orderedBatch.length; j++) {
            totalDistance += haversine(
              orderedBatch[j-1].lat, orderedBatch[j-1].lng,
              orderedBatch[j].lat, orderedBatch[j].lng
            );
          }
          const estimatedTime = (totalDistance / averageSpeedKmh) * 60;

          // 5. Save route to DB
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const routeRes = await client.query(
              `INSERT INTO routes (name, start_address, start_lat, start_lng, return_to_start, average_speed_kmh, total_distance_km, estimated_time_minutes, status, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
               RETURNING *`,
              [
                `${routePrefix} ${locationName} ${i + 1}/${numRoutes}`,
                resolvedStartAddress,
                startLat,
                startLng,
                false,
                averageSpeedKmh,
                Math.round(totalDistance * 10) / 10,
                Math.round(estimatedTime),
                req.user!.id,
              ]
            );
            const route = routeRes.rows[0];

            let prevLat = startLat;
            let prevLng = startLng;

            for (let j = 0; j < orderedBatch.length; j++) {
              const stop = orderedBatch[j];
              const distFromPrev = haversine(prevLat, prevLng, stop.lat, stop.lng);
              await client.query(
                `INSERT INTO route_stops (route_id, company_id, order_index, address, lat, lng, label, distance_from_previous_km)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [route.id, stop.id, j + 1, stop.direccion, stop.lat, stop.lng, stop.nombre, Math.round(distFromPrev * 100) / 100]
              );
              prevLat = stop.lat;
              prevLng = stop.lng;
            }

            await client.query('COMMIT');
            routesCreated.push({
              id: route.id,
              name: route.name,
              stops: orderedBatch.length,
              totalDistanceKm: Math.round(totalDistance * 10) / 10,
              estimatedTimeMin: Math.round(estimatedTime),
              status: 'draft',
            });
          } finally {
            client.release();
          }
        } catch (e) {
          console.error(`[Batch route ${i + 1}] error:`, e);
        }
      }

      res.json({
        success: true,
        location: locationName,
        totalCompanies: companies.length,
        routesCreated: routesCreated.length,
        routes: routesCreated,
      });
    } catch (error) {
      console.error('[Batch routes error]:', error);
      res.status(500).json({ error: 'Error al crear rutas.' });
    }
  });

  // GET /api/routes/cities — devuelve ciudades únicas de empresas según región
  router.get('/routes/cities', requireAuth, async (req, res) => {
    try {
      const region = (req.query.region as string) || 'quebec';
      const table = region === 'ontario' ? 'ontario_companies' : 'quebec_companies';

      const { rows } = await pool.query(`
        SELECT normalize_location_name(ciudad) AS city,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null') AS with_address
        FROM ${table}
        WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '' AND TRIM(ciudad) <> 'null'
        GROUP BY normalize_location_name(ciudad)
        HAVING COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null') > 0
        ORDER BY with_address DESC
        LIMIT 200
      `);

      res.json(rows.map(r => ({ name: r.city, total: parseInt(r.total), withAddress: parseInt(r.with_address) })));
    } catch (error) {
      console.error('[Cities Error]:', error);
      res.status(500).json({ error: 'Error al obtener ciudades.' });
    }
  });

  // GET /api/routes/towns — devuelve pueblos únicos de empresas según región y ciudad opcional
  router.get('/routes/towns', requireAuth, async (req, res) => {
    try {
      const region = (req.query.region as string) || 'quebec';
      const city = req.query.city as string;
      const table = region === 'ontario' ? 'ontario_companies' : 'quebec_companies';
      const params: any[] = [];
      let extraFilter = '';
      if (city) {
        params.push(city);
        extraFilter = `AND normalize_location_name(ciudad) = normalize_location_name($${params.length})`;
      }

      const { rows } = await pool.query(`
        SELECT normalize_location_name(pueblo) AS town,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null') AS with_address
        FROM ${table}
        WHERE pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null' ${extraFilter}
        GROUP BY normalize_location_name(pueblo)
        HAVING COUNT(*) FILTER (WHERE direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null') > 0
        ORDER BY with_address DESC
        LIMIT 200
      `, params);

      res.json(rows.map(r => ({ name: r.town, total: parseInt(r.total), withAddress: parseInt(r.with_address) })));
    } catch (error) {
      console.error('[Towns Error]:', error);
      res.status(500).json({ error: 'Error al obtener pueblos.' });
    }
  });

  // GET /api/routes/companies — Empresas filtradas por región y opcionalmente ciudad
  router.get('/routes/companies', requireAuth, async (req, res) => {
    try {
      const region = (req.query.region as string) || 'quebec';
      const city = req.query.city as string;
      const includeAll = req.query.includeAll === 'true';

      let table: string;
      const params: any[] = [];
      let where: string[] = [];

      if (region === 'ontario') {
        table = 'ontario_companies';
      } else {
        table = 'quebec_companies';
      }

      if (city && city !== '') {
        params.push(city);
        where.push(`normalize_location_name(ciudad) = normalize_location_name($${params.length})`);
      }

      if (!includeAll) {
        where.push(`direccion IS NOT NULL AND TRIM(direccion) <> '' AND TRIM(direccion) <> 'null'`);
      }

      const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const { rows } = await pool.query(`
        SELECT 
          id, 
          nombre AS name, 
          direccion AS address, 
          ciudad AS city, 
          provincia AS province, 
          telefono AS phone,
          work AS service,
          lat,
          lng
        FROM ${table}
        ${whereSQL}
        ORDER BY nombre
        LIMIT 200
      `, params);

      res.json({
        region,
        total: rows.length,
        companies: rows,
      });
    } catch (error) {
      console.error('[Companies Error]:', error);
      res.status(500).json({ error: 'Error al obtener empresas.' });
    }
  });

  // GET /api/companies/duplicates — Detectar empresas duplicadas
  router.get('/companies/duplicates', requireAuth, async (req, res) => {
    try {
      const quebecResult = await pool.query(`
        SELECT 
          LOWER(TRIM(nombre)) AS name_clean,
          COUNT(*) AS count,
          ARRAY_AGG(id) AS ids,
          ARRAY_AGG(nombre) AS names
        FROM quebec_companies
        GROUP BY LOWER(TRIM(nombre))
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `);

      const ontarioResult = await pool.query(`
        SELECT 
          LOWER(TRIM(nombre)) AS name_clean,
          COUNT(*) AS count,
          ARRAY_AGG(id) AS ids,
          ARRAY_AGG(nombre) AS names
        FROM ontario_companies
        GROUP BY LOWER(TRIM(nombre))
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `);

      res.json({
        quebec: quebecResult.rows,
        ontario: ontarioResult.rows,
        totalDuplicates: quebecResult.rows.length + ontarioResult.rows.length,
      });
    } catch (error) {
      console.error('[Duplicates Error]:', error);
      res.status(500).json({ error: 'Error al detectar duplicados.' });
    }
  });

  // GET /api/routes — listar todas las rutas
  router.get('/routes', requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string;
      const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 100));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const params: any[] = [];
      const filters: string[] = ["r.status != 'cancelled'"];

      if (status && status !== 'all') {
        params.push(status);
        filters.push(`r.status = $${params.length}`);
      }

      const where = `WHERE ${filters.join(' AND ')}`;

      const countRes = await pool.query(`SELECT COUNT(*)::int FROM routes r ${where}`, params);
      const total = parseInt(countRes.rows[0].count, 10);

      const { rows } = await pool.query(`
        SELECT r.id, r.name, r.start_address, r.start_lat, r.start_lng,
               r.status, r.total_distance_km, r.estimated_time_minutes,
               r.notes, r.created_at, r.updated_at, r.started_at, r.completed_at,
               (SELECT COUNT(*)::int FROM route_stops rs WHERE rs.route_id = r.id) AS stops_count,
               (SELECT COUNT(*)::int FROM route_stops rs WHERE rs.route_id = r.id AND rs.status = 'visited') AS visited_stops,
               (SELECT COUNT(*)::int FROM route_stops rs WHERE rs.route_id = r.id AND rs.status = 'skipped') AS skipped_stops,
               (SELECT COUNT(*)::int FROM route_stops rs WHERE rs.route_id = r.id AND rs.status = 'failed') AS failed_stops
        FROM routes r
        ${where}
        ORDER BY r.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      res.json({ items: rows, total, limit, offset });
    } catch (error) {
      console.error('[Routes List Error]:', error);
      res.status(500).json({ error: 'Error al listar rutas.' });
    }
  });

  // POST /api/routes — crear una nueva ruta
  router.post('/routes', requireAuth, requireRole('admin', 'editor'), async (req: AuthRequest, res) => {
    const { name, startAddress, stops, returnToStart, averageSpeedKmh, notes } = req.body;

    if (!name || !startAddress || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'name, startAddress y stops son requeridos.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Crear la ruta
      const routeRes = await client.query(
        `INSERT INTO routes (name, start_address, return_to_start, average_speed_kmh, notes, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6)
         RETURNING *`,
        [name, startAddress, returnToStart || false, averageSpeedKmh || 30, notes || null, req.user!.id]
      );
      const route = routeRes.rows[0];

      // Crear los stops en orden
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        await client.query(
          `INSERT INTO route_stops (route_id, company_id, order_index, address, lat, lng, label)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            route.id,
            stop.companyId || null,
            i,
            stop.address,
            stop.lat || null,
            stop.lng || null,
            stop.label || stop.companyName || null,
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ id: route.id, name: route.name, status: route.status, createdAt: route.created_at });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Create Route Error]:', error);
      res.status(500).json({ error: 'Error al crear ruta.' });
    } finally {
      client.release();
    }
  });

  // GET /api/routes/:id — obtener detalle de una ruta
  router.get('/routes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const routeRes = await pool.query('SELECT * FROM routes WHERE id = $1', [id]);
      if (routeRes.rows.length === 0) {
        return res.status(404).json({ error: 'Ruta no encontrada.' });
      }

      const route = routeRes.rows[0];

      const stopsRes = await pool.query(`
        SELECT rs.id, rs.order_index, rs.address, rs.lat, rs.lng, rs.label,
               rs.distance_from_previous_km, rs.status, rs.visited_at, rs.notes,
               rs.company_id,
               COALESCE(oc.nombre, qc.nombre) AS company_name,
               COALESCE(oc.telefono, qc.telefono) AS company_phone
        FROM route_stops rs
        LEFT JOIN ontario_companies oc ON rs.company_id = oc.id
        LEFT JOIN quebec_companies qc ON rs.company_id = qc.id
        WHERE rs.route_id = $1
        ORDER BY rs.order_index`,
        [id]
      );

      res.json({ ...route, stops: stopsRes.rows });
    } catch (error) {
      console.error('[Route Detail Error]:', error);
      res.status(500).json({ error: 'Error al obtener ruta.' });
    }
  });

  // PATCH /api/routes/:id/status — cambiar estado de la ruta
  router.patch('/routes/:id/status', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['draft', 'active', 'paused', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }

      const updates: string[] = ['status = $2', 'updated_at = NOW()'];
      const params: any[] = [id, status];

      if (status === 'active') {
        updates.push('started_at = NOW()');
      } else if (status === 'paused') {
        updates.push('paused_at = NOW()');
      } else if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }

      const result = await pool.query(
        `UPDATE routes SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ruta no encontrada.' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Update Route Status Error]:', error);
      res.status(500).json({ error: 'Error al actualizar estado.' });
    }
  });

  // PATCH /api/routes/:id/stops/:stopId — actualizar estado de un stop
  router.patch('/routes/:id/stops/:stopId', requireAuth, async (req, res) => {
    try {
      const { stopId } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['pending', 'visited', 'skipped', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }

      const updates: string[] = ['status = $2'];
      const params: any[] = [stopId, status];

      if (status === 'visited') {
        updates.push('visited_at = NOW()');
      }
      if (notes !== undefined) {
        updates.push(`notes = $${updates.length + 1}`);
        params.push(notes);
      }

      const result = await pool.query(
        `UPDATE route_stops SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Parada no encontrada.' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Update Stop Error]:', error);
      res.status(500).json({ error: 'Error al actualizar parada.' });
    }
  });

  // POST /api/routes/:id/reorder — reordenar stops
  router.post('/routes/:id/reorder', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { stops } = req.body;

      if (!Array.isArray(stops)) {
        return res.status(400).json({ error: 'stops array requerido.' });
      }

      // Actualizar orden de cada stop
      for (const stop of stops) {
        await pool.query(
          `UPDATE route_stops SET order_index = $2 WHERE id = $1 AND route_id = $3`,
          [stop.id, stop.order, id]
        );
      }

      // Recalcular distancias
      await recalculateDistances(id);

      res.json({ success: true });
    } catch (error) {
      console.error('[Reorder Error]:', error);
      res.status(500).json({ error: 'Error al reordenar paradas.' });
    }
  });

  // Webhook genérico para notificaciones
  router.post('/webhook/notify', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Webhook secret inválido.' });
    }

    const { event, data, url } = req.body;

    if (!event || !url) {
      return res.status(400).json({ error: 'event y url requeridos.' });
    }

    // Webhook payload estándar
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Webhook-Secret': process.env.WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }

      res.json({ success: true, event });
    } catch (error: any) {
      console.error('[Webhook error]:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper: recalcular distancias después de reordenar
  async function recalculateDistances(routeId: string) {
    const { rows: stops } = await pool.query(
      `SELECT id, lat, lng FROM route_stops WHERE route_id = $1 ORDER BY order_index`,
      [routeId]
    );

    let totalDistance = 0;
    for (let i = 1; i < stops.length; i++) {
      if (stops[i-1].lat && stops[i].lat) {
        const dist = haversine(stops[i-1].lat, stops[i-1].lng, stops[i].lat, stops[i].lng);
        await pool.query(
          `UPDATE route_stops SET distance_from_previous_km = $2 WHERE id = $1`,
          [stops[i].id, dist]
        );
        totalDistance += dist;
      }
    }

    // Actualizar distancia total de la ruta
    await pool.query(
      `UPDATE routes SET total_distance_km = $2, updated_at = NOW() WHERE id = $1`,
      [routeId, totalDistance]
    );
  }

  // DELETE /api/routes/:id — eliminar una ruta
  router.delete('/routes/:id', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE routes SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ruta no encontrada.' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[Delete Route Error]:', error);
      res.status(500).json({ error: 'Error al eliminar ruta.' });
    }
  });

  return router;
}
