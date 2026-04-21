/**
 * export-to-sheets.ts
 *
 * Exporta las empresas enriquecidas de la BD directamente a un Google Sheet.
 *
 * Prerequisitos:
 *   1. Google Cloud project con Sheets API habilitada
 *   2. Service Account con acceso de Editor al Sheet
 *   3. Variables en .env:
 *      GOOGLE_SHEETS_ID=<id del spreadsheet>
 *      GOOGLE_SERVICE_ACCOUNT_KEY_PATH=<ruta al JSON de credenciales>
 *
 * Columnas del Sheet (mismas que el Excel maestro):
 *   EMPRESA | TELEFONO | TIPO | CORREO | Fecha | DIRECCION | PROVINCIA |
 *   REGIÓN  | CIUDAD   | PUEBLO | WORK | DESCRIPCION DEL TRABAJO |
 *   DOMINIO DE PAGINA | Lista de llamadas | LinkedIn | Rutas
 */

import { google, sheets_v4 } from 'googleapis';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import { SERVICE_TYPE_BY_ID } from '../server/data/serviceTypes.js';

dotenv.config();

// ── Mapeo service_type_id → nombre WORK (igual que export-to-excel.ts) ────────
const SERVICE_TO_WORK: Record<string, string> = {
  'ga-empacadores':               'EMPACADORES',
  'ga-meseros':                   'MESEROS',
  'ga-restaurante':               'RESTAURANTE',
  'ga-panaderia':                 'PANADERIA',
  'ga-carniceria':                'CARNICERIA',
  'ga-matadero':                  'MATADERO',
  'ga-asistente-cocina':          'ASISTENTE DE COCINA',
  'ga-chef':                      'CHEF',
  'ga-pizzero':                   'PIZZERO',
  'ga-bartenders':                'BARTENDERS',
  'lg-montacargas':               'OPERADORES DE MONTEACARGA',
  'lg-conductores':               'CONDUCTORES DE CARGA',
  'lg-carga-descarga':            'CARGA Y DESCARGA',
  'lg-mudanzas':                  'MUDANZAS',
  'lg-domiciliario':              'DOMICILIARIO',
  'lg-almacen':                   'ALMACEN',
  'co-soldador':                  'SOLDADOR',
  'co-remocion-nieve':            'REMOCION DE NIEVE',
  'co-plomero':                   'PLOMERO',
  'co-pintor':                    'PINTOR',
  'co-excavacion':                'EXCAVACION',
  'co-construccion':              'CONSTRUCCION',
  'co-carpintero':                'CARPINTERO',
  'co-ebanista':                  'EBANISTA',
  'co-carroceria':                'CARROCERIA',
  'in-operario-produccion':       'OPERARIO DE PRODUCCION',
  'in-operario-maquinaria':       'OPERARIO DE MAQUINARIA',
  'in-operador-laser':            'OPERADOR LASER',
  'mt-electricista':              'ELECTRICISTA',
  'mt-reparadores-refrigeradoras':'REPARADORES DE REFRIGERADORAS',
  'mt-mecanico-forklift':         'MECANICO FORK LIFT',
  'mt-tecnico-elevadores':        'TECNICO EN ELEVADORES',
  'mt-mecanico':                  'MECANICO',
  'mt-mecanico-industrial':       'MECANICO INDUSTRIAL',
  'lm-limpieza-industrial':       'LIMPIEZA INDUSTRIAL',
  'lm-limpieza':                  'LIMPIEZA',
  'lm-mantenimiento':             'MANTENIMIENTO',
  'lm-lavanderia':                'LAVANDERIA',
  'ag-recolectores':              'RECOLECTORES FRUTAS Y VEGETALES',
  'ag-invernaderos':              'TRABAJADORES DE INVERNADEROS',
  'ag-operario-agricola':         'OPERARIO AGRICOLA',
  'ag-paisajismo':                'PAISAJISMO',
  'ag-agricultor':                'AGRICULTOR',
  'sh-empleada-domestica':        'EMPLEADA DOMESTICA',
  'sh-mucama':                    'MUCAMA',
  'ht-hotel':                     'HOTEL',
  'ht-recepcionista':             'RECEPCIONISTA',
  'cr-tienda-comestibles':        'TIENDA DE COMESTIBLES',
  'cr-supermercado':              'SUPERMERCADO',
  'se-seguridad':                 'PERSONAL DE SEGURIDAD',
  'ds-disenador-interiores':      'DISEÑADOR DE INTERIORES',
  'gn-general':                   'GENERAL',
};

// ── Normalización para deduplicación ─────────────────────────────────────────
function normName(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}
function normPhone(s: string | number): string {
  return String(s || '').replace(/\D/g, '').slice(-10);
}
function normDomain(s: string): string {
  return (s || '').toLowerCase()
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
}

// ── Autenticación Google ──────────────────────────────────────────────────────
function getAuthClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH no configurado en .env');
  if (!fs.existsSync(keyPath)) throw new Error(`Archivo de credenciales no encontrado: ${keyPath}`);
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Leer filas existentes del Sheet para dedup ───────────────────────────────
async function buildSheetDupIndex(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<{
  byName: Set<string>;
  byPhone: Set<string>;
  byDomain: Set<string>;
  totalRows: number;
  sheetTitle: string;
}> {
  const byName  = new Set<string>();
  const byPhone = new Set<string>();
  const byDomain = new Set<string>();

  // Obtener info del sheet (nombre de la primera hoja)
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetTitle = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';

  // Leer columnas A (EMPRESA), B (TELEFONO), M (DOMINIO DE PAGINA)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A:M`,
  });

  const rows = resp.data.values ?? [];
  let dataRows = 0;

  for (let i = 1; i < rows.length; i++) { // saltar header
    const row = rows[i];
    const empresa = String(row[0] ?? '');
    const telefono = String(row[1] ?? '');
    const dominio  = String(row[12] ?? ''); // columna M = índice 12

    const n = normName(empresa);
    const p = normPhone(telefono);
    const d = normDomain(dominio);

    if (n) byName.add(n);
    if (p && p.length >= 7) byPhone.add(p);
    if (d && d.includes('.')) byDomain.add(d);
    dataRows++;
  }

  console.log(`📊 Google Sheet: ${dataRows} filas · ${byName.size} nombres únicos`);
  return { byName, byPhone, byDomain, totalRows: dataRows, sheetTitle };
}

// ── Resultado ─────────────────────────────────────────────────────────────────
export interface SheetsExportResult {
  added: number;
  skipped: number;
  totalRowsInSheet: number;
}

// ── Función principal exportable ──────────────────────────────────────────────
export async function runSheetsExport(opts: {
  limit?: number;
  dryRun?: boolean;
  spreadsheetId?: string;
  pool?: pkg.Pool;
} = {}): Promise<SheetsExportResult> {
  const spreadsheetId = opts.spreadsheetId
    || process.env.GOOGLE_SHEETS_ID
    || '';

  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID no configurado en .env');

  const dryRun = opts.dryRun ?? false;
  const limit  = opts.limit  ?? 1000;

  console.log(`\n🚀 Exportando al Google Sheet: ${spreadsheetId}`);
  if (dryRun) console.log('⚠️  DRY RUN — no se escribirá nada\n');

  const ownPool = !opts.pool;
  const pool = opts.pool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
  });

  // Auth + cliente Sheets
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Leer Sheet existente y construir índice de duplicados
  const { byName, byPhone, byDomain, totalRows, sheetTitle } =
    await buildSheetDupIndex(sheets, spreadsheetId);

  // 2. Consultar empresas nuevas de la BD
  const { rows: companies } = await pool.query(`
    SELECT
      c.id, c.name, c.phone, c.contact_email,
      c.exact_address, c.hq_province, c.hq_city,
      c.hq_region, c.hq_town, c.website,
      c.google_maps_status, c.enriched_at,
      c.suggested_services,
      (SELECT j.service_type_id FROM jobs j
       WHERE j.company_id = c.id AND j.service_type_id IS NOT NULL
       LIMIT 1) AS service_type_id
    FROM companies c
    WHERE c.sheets_exported_at IS NULL
      AND c.enrichment_status IN ('scraped', 'db_matched', 'verified')
      AND c.name IS NOT NULL
    ORDER BY c.enriched_at ASC NULLS LAST
    LIMIT $1
  `, [limit]);

  console.log(`🔍 Empresas candidatas en BD: ${companies.length}`);

  let added = 0;
  let skipped = 0;
  const exportedIds: string[] = [];
  const newRows: string[][] = [];

  const today = new Date().toLocaleDateString('es-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  for (const co of companies) {
    const n = normName(co.name);
    const p = normPhone(co.phone || '');
    const d = normDomain(co.website || '');

    const isDuplicate =
      (n && byName.has(n)) ||
      (p && p.length >= 7 && byPhone.has(p)) ||
      (d && d.includes('.') && byDomain.has(d));

    if (isDuplicate) {
      skipped++;
      exportedIds.push(co.id);
      continue;
    }

    // WORK + DESCRIPCION
    let workField = 'GENERAL';
    let workDesc  = 'Trabajador polivalente para labores generales.';

    if (co.service_type_id && SERVICE_TO_WORK[co.service_type_id]) {
      workField = SERVICE_TO_WORK[co.service_type_id];
      workDesc  = SERVICE_TYPE_BY_ID[co.service_type_id]?.description || '';
    } else if (Array.isArray(co.suggested_services) && co.suggested_services.length > 0) {
      const top = co.suggested_services[0];
      workField = SERVICE_TO_WORK[top.service_id] || top.service_name?.toUpperCase() || 'GENERAL';
      workDesc  = SERVICE_TYPE_BY_ID[top.service_id]?.description || top.reasoning || '';
    }

    newRows.push([
      co.name            || '',  // A: EMPRESA
      co.phone           || '',  // B: TELEFONO
      '',                        // C: TIPO
      co.contact_email   || '',  // D: CORREO
      today,                     // E: Fecha
      co.exact_address   || '',  // F: DIRECCION
      co.hq_province     || '',  // G: PROVINCIA
      co.hq_region       || '',  // H: REGIÓN
      co.hq_city         || '',  // I: CIUDAD
      co.hq_town || co.hq_city || '', // J: PUEBLO
      workField,                 // K: WORK
      workDesc,                  // L: DESCRIPCION DEL TRABAJO
      co.website         || '',  // M: DOMINIO DE PAGINA
      '',                        // N: Lista de llamadas
      '',                        // O: LinkedIn
      '',                        // P: Rutas
    ]);

    if (n) byName.add(n);
    if (p && p.length >= 7) byPhone.add(p);
    if (d && d.includes('.')) byDomain.add(d);

    exportedIds.push(co.id);
    added++;
  }

  // 3. Escribir al Sheet
  if (!dryRun && newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A:P`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows },
    });

    // Colorear filas closed en rojo (requiere batchUpdate con formato)
    const closedIndices = companies
      .filter(c => c.google_maps_status === 'closed' && exportedIds.includes(c.id))
      .map((_, i) => totalRows + 1 + i); // +1 por header, 0-indexed en Sheets

    if (closedIndices.length > 0) {
      const sheetId = (await sheets.spreadsheets.get({ spreadsheetId }))
        .data.sheets?.[0]?.properties?.sheetId ?? 0;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: closedIndices.map(rowIndex => ({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 0,
                endColumnIndex: 16,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1, green: 0, blue: 0 },
                },
              },
              fields: 'userEnteredFormat.backgroundColor',
            },
          })),
        },
      });
    }

    console.log(`\n💾 Google Sheet actualizado: +${added} filas`);
  }

  // 4. Marcar exportadas en BD (columna sheets_exported_at)
  if (!dryRun && exportedIds.length > 0) {
    await pool.query(
      `UPDATE companies SET sheets_exported_at = NOW() WHERE id = ANY($1::uuid[])`,
      [exportedIds]
    );
  }

  if (ownPool) await pool.end();

  const result = { added, skipped, totalRowsInSheet: totalRows + added };
  console.log(`\n✅ Sheets: ${added} agregadas · ${skipped} duplicadas · ${result.totalRowsInSheet} total`);
  return result;
}

// ── Entry point CLI ───────────────────────────────────────────────────────────
const isMain = process.argv[1]?.includes('export-to-sheets');
if (isMain) {
  runSheetsExport().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
