import type { Pool } from 'pg';

// Nominatim rate limit: 1 req/sec max (we use 1.1s delay to be safe)
const GEOCODING_BATCH = 1;
const GEOCODING_DELAY_MS = 1100;
const GEOCODING_INTERVAL_MS = 60 * 60 * 1000; // re-check every hour for new companies

export async function geocodeAddress(
  address: string,
  city: string,
  province: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = [address, city, province, 'Canada'].filter(Boolean).join(', ');
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=ca`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CanTrackCRM/1.0 (cantrack@vsm.ca)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_e) {}
  return null;
}

async function geocodePendingCompanies(pool: Pool): Promise<void> {
  for (const table of ['ontario_companies', 'quebec_companies'] as const) {
    let processed = 0;
    let updated = 0;

    while (true) {
      const { rows } = await pool.query(`
        SELECT id, direccion, ciudad, provincia
        FROM ${table}
        WHERE (lat IS NULL OR lng IS NULL)
          AND direccion IS NOT NULL AND TRIM(direccion) NOT IN ('', 'null')
        ORDER BY id
        LIMIT $1
      `, [GEOCODING_BATCH]);

      if (rows.length === 0) break;

      for (const c of rows) {
        const coords = await geocodeAddress(c.direccion, c.ciudad || '', c.provincia || '');
        if (coords) {
          await pool.query(
            `UPDATE ${table} SET lat = $1, lng = $2, updated_at = NOW() WHERE id = $3`,
            [coords.lat, coords.lng, c.id]
          );
          updated++;
        }
        processed++;
        // Respect Nominatim's 1 req/sec policy
        await new Promise(r => setTimeout(r, GEOCODING_DELAY_MS));
      }

      // Log progress every 100 records
      if (processed % 100 === 0) {
        console.log(`[Geocoding] ${table}: ${updated}/${processed} geocodificadas`);
      }
    }

    if (processed > 0) {
      console.log(`[Geocoding] ${table} completado: ${updated}/${processed} geocodificadas`);
    }
  }
}

export function initCronJobs(pool: Pool): void {
  console.log('[Geocoding] Servicio iniciado — geocodificando empresas en background (Nominatim)');

  // Non-blocking background geocoding, starts 10s after server boot
  setTimeout(() => {
    geocodePendingCompanies(pool).catch(e =>
      console.error('[Geocoding] Error:', e.message)
    );
  }, 10000);

  // Re-run every hour to catch newly added companies
  setInterval(() => {
    geocodePendingCompanies(pool).catch(e =>
      console.error('[Geocoding] Error periódico:', e.message)
    );
  }, GEOCODING_INTERVAL_MS);
}
