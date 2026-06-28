import type { Pool } from 'pg';
import { EnrichmentService } from '../services/enrichment.service.js';
import { scheduleExcelExport } from './export-helpers.js';
import { slugify } from './slug.js';
import { validateTableName } from './table-names.js';

export async function maybeCopyToProvinceTable(pool: Pool, companyId: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT name, phone, contact_email, hq_city, hq_province, hq_region, hq_town,
              exact_address, website, description, industry
       FROM companies WHERE id = $1`,
      [companyId],
    );
    if (!rows.length) return;
    const co = rows[0];

    const prov = (co.hq_province ?? '').trim().toLowerCase();
    let targetTable: string | null = null;
    let provinciaLabel: string | null = null;
    let regionLabel: string | null = null;

    if (prov === 'on' || prov === 'ontario') {
      targetTable  = 'ontario_companies';
      provinciaLabel = 'Ontario';
      regionLabel    = 'Ontario';
    } else if (prov === 'qc' || prov === 'quebec' || prov === 'québec') {
      targetTable  = 'quebec_companies';
      provinciaLabel = 'Quebec';
      regionLabel    = 'Quebec';
    }

    if (!targetTable || !co.name) return;

    targetTable = validateTableName(targetTable);

    await pool.query(
      `INSERT INTO ${targetTable}
         (nombre, telefono, correo, ciudad, provincia, region, pueblo, direccion,
          dominio_de_pagina, descripcion, work, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'enriched')
       ON CONFLICT DO NOTHING`,
      [
        co.name,
        co.phone       || null,
        co.contact_email || null,
        co.hq_city     || null,
        provinciaLabel,
        regionLabel,
        co.hq_town     || null,
        co.exact_address || null,
        co.website     || null,
        co.description || null,
        co.industry    || 'GENERAL',
      ],
    );
    console.info(`[ProvinceSync] "${co.name}" → ${targetTable}`);
  } catch (err: any) {
    console.warn('[ProvinceSync] Error:', err.message);
  }
}

export async function findCompanyInBothTables(
  pool: Pool,
  companyName: string
): Promise<{ id: string; table: 'ontario_companies' | 'quebec_companies'; src: 'ontario' | 'quebec' } | null> {
  const slug = slugify(companyName);
  const nameNorm = companyName.trim().toLowerCase();

    for (const [table, src] of [['ontario_companies', 'ontario'], ['quebec_companies', 'quebec']] as const) {
    const safeTable = validateTableName(table);
    const found = await pool.query(
      `SELECT id FROM ${safeTable} WHERE slug = $1 OR LOWER(TRIM(nombre)) = $2 LIMIT 1`,
      [slug, nameNorm]
    );
    if (found.rows.length > 0) return { id: found.rows[0].id, table, src: src as 'ontario' | 'quebec' };
  }
  return null;
}

export async function enrichAndInsertCompany(pool: Pool, companyName: string): Promise<{
  id: string; table: string; src: string;
}> {
  const slug = slugify(companyName);

  const data = await EnrichmentService.enrichCompany(companyName);
  const hasData = data.industry || data.description || data.website;
  const newStatus = hasData ? 'scraped' : 'failed';

  const hqProv = (data.hq_province || '').toLowerCase();
  let table = (hqProv.includes('qc') || hqProv.includes('quebec')) ? 'quebec_companies' : 'ontario_companies';
  table = validateTableName(table);
  const src = table === 'quebec_companies' ? 'quebec' : 'ontario';

  const updates: Record<string, any> = {
    nombre: companyName.trim(),
    slug,
    enrichment_status: newStatus,
    enrichment_provider: data._provider ?? 'unknown',
  };
  if (data.is_closed === true) updates.tipo = 'rojo';
  if (data.industry) updates.industry = data.industry;
  if (data.company_size) updates.company_size = data.company_size;
  if (data.website) updates.dominio_de_pagina = data.website;
  if (data.description) updates.descripcion = (data.description || '').substring(0, 500);
  if (data.hq_city) updates.ciudad = data.hq_city;
  if (data.hq_province) updates.provincia = data.hq_province;
  if (data.hq_region) updates.region = data.hq_region;
  if (data.hq_town) updates.pueblo = data.hq_town;
  if (data.exact_address) updates.direccion = data.exact_address;
  if (data.phone) updates.telefono = data.phone;
  if (data.contact_email) updates.correo = data.contact_email;

  const keys = Object.keys(updates);
  const cols = keys.map(k => `"${k}"`);
  const vals = keys.map((_, i) => `$${i + 1}`);
  const ins = await pool.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING RETURNING id`,
    Object.values(updates)
  );

  if (ins.rows.length > 0) {
    console.log(`[Webhook] ✅ New company created: ${companyName} → ${table} (${newStatus})`);
    scheduleExcelExport(pool);
    return { id: ins.rows[0].id, table, src };
  }

  const existing = await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [slug]);
  if (existing.rows.length > 0) return { id: existing.rows[0].id, table, src };

  throw new Error(`Could not create company ${companyName} in ${table}`);
}
