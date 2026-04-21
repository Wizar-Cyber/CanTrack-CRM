/**
 * export-to-excel.ts
 *
 * Exporta las empresas enriquecidas de la BD al archivo Excel maestro
 * (MUESTRA LISTA QUEBEC.xlsx / LISTA QUEBEC.xlsx con las 16.000 empresas).
 *
 * Lógica:
 *   1. Lee el Excel existente y construye un índice de deduplicación
 *      (nombre normalizado + teléfono normalizado + dominio normalizado).
 *   2. Consulta las empresas en la BD que AÚN NO han sido exportadas
 *      (excel_exported_at IS NULL) y que están enriquecidas (status != pending/failed).
 *   3. Para cada empresa nueva (no duplicada) la agrega al Excel con el formato exacto:
 *      EMPRESA | TELEFONO | TIPO | CORREO | Fecha | DIRECCION | PROVINCIA |
 *      REGIÓN  | CIUDAD   | PUEBLO | WORK | DESCRIPCION DEL TRABAJO |
 *      DOMINIO DE PAGINA | Lista de llamadas | Likedin | Rutas
 *   4. Aplica color rojo si google_maps_status = 'closed'.
 *   5. Marca en la BD las empresas exportadas (excel_exported_at = NOW()).
 *
 * Uso:
 *   npx tsx scripts/export-to-excel.ts
 *   npx tsx scripts/export-to-excel.ts --limit 500 --dry-run
 *
 * Variables de entorno requeridas:
 *   DATABASE_URL  — conexión PostgreSQL
 *   EXCEL_PATH    — ruta completa al archivo Excel maestro
 */

import ExcelJS from 'exceljs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { SERVICE_TYPE_BY_ID } from '../server/data/serviceTypes.js';

dotenv.config();

// ── Configuración ─────────────────────────────────────────────────────────────

const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  'C:\\Users\\ripre\\OneDrive\\SmartFlow\\Proyecto Canada\\MUESTRA  LISTA QUEBEC.xlsx';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 1000;

// Colores de celda (fondo de TODA la fila)
const COLOR_RED     = 'FFFF0000';  // closed / cerrado
const COLOR_DEFAULT = null;        // sin color especial

// Mapeo service_type_id → nombre en columna WORK (igual que en el Excel)
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
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function normPhone(s: string | number): string {
  return String(s || '').replace(/\D/g, '').slice(-10);
}

function normDomain(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim();
}

// ── Leer Excel existente y construir índice de duplicados ─────────────────────

async function buildDuplicateIndex(wb: ExcelJS.Workbook): Promise<{
  byName: Set<string>;
  byPhone: Set<string>;
  byDomain: Set<string>;
  lastRow: number;
  sheetName: string;
}> {
  const sheet = wb.worksheets[0];
  const sheetName = sheet.name;

  const byName   = new Set<string>();
  const byPhone  = new Set<string>();
  const byDomain = new Set<string>();
  let lastRow = 1;

  // Find header row (row 1)
  let colMap: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, colNum) => {
    const header = String(cell.value || '').trim().toUpperCase();
    colMap[header] = colNum;
  });

  // Fallback column positions matching the known Excel structure
  const COL_EMPRESA = colMap['EMPRESA']           || 1;
  const COL_TELEFONO = colMap['TELEFONO']          || 2;
  const COL_DOMINIO = colMap['DOMINIO DE PAGINA']  || 13;

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const empresa = String(row.getCell(COL_EMPRESA).value  || '');
    const telefono = row.getCell(COL_TELEFONO).value;
    const dominio = String(row.getCell(COL_DOMINIO).value  || '');

    const n = normName(empresa);
    const p = normPhone(String(telefono || ''));
    const d = normDomain(dominio);

    if (n) byName.add(n);
    if (p && p.length >= 7) byPhone.add(p);
    if (d && d.includes('.')) byDomain.add(d);

    lastRow = rowNum;
  });

  console.log(`📊 Excel existente: ${lastRow - 1} filas · ${byName.size} nombres únicos`);
  return { byName, byPhone, byDomain, lastRow, sheetName };
}

// ── Aplicar color a una fila ──────────────────────────────────────────────────

function applyRowColor(row: ExcelJS.Row, hexColor: string | null) {
  if (!hexColor) return;
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexColor },
    };
  });
}

// ── Función principal exportable ──────────────────────────────────────────────

export interface ExportOptions {
  limit?: number;
  dryRun?: boolean;
  excelFilePath?: string;
  pool?: pkg.Pool;  // si se llama desde server.ts, reusar el pool existente
}

export interface ExportResult {
  added: number;
  skipped: number;
  totalRowsInExcel: number;
}

export async function runExport(opts: ExportOptions = {}): Promise<ExportResult> {
  const filePath = opts.excelFilePath || EXCEL_PATH;
  const dryRun   = opts.dryRun ?? DRY_RUN;
  const limit    = opts.limit  ?? LIMIT;

  console.log(`\n🚀 Exportando empresas al Excel: ${filePath}`);
  if (dryRun) console.log('⚠️  DRY RUN — no se escribirá nada en BD ni Excel\n');

  const ownPool = !opts.pool;
  const pool = opts.pool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
  });

  // 1. Cargar Excel
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const { byName, byPhone, byDomain, lastRow, sheetName } = await buildDuplicateIndex(wb);
  const sheet = wb.getWorksheet(sheetName)!;

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
    WHERE c.excel_exported_at IS NULL
      AND c.enrichment_status IN ('scraped', 'db_matched', 'verified')
      AND c.name IS NOT NULL
    ORDER BY c.enriched_at ASC NULLS LAST
    LIMIT $1
  `, [limit]);

  console.log(`🔍 Empresas candidatas en BD: ${companies.length}`);

  let added = 0;
  let skipped = 0;
  const exportedIds: string[] = [];

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

    // Determinar WORK y DESCRIPCION
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

    const today = new Date().toLocaleDateString('es-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

    if (!dryRun) {
      const newRow = sheet.addRow([
        co.name                 || '',  // EMPRESA
        co.phone                || '',  // TELEFONO
        '',                             // TIPO
        co.contact_email        || '',  // CORREO
        today,                          // Fecha
        co.exact_address        || '',  // DIRECCION
        co.hq_province          || '',  // PROVINCIA
        co.hq_region            || '',  // REGIÓN
        co.hq_city              || '',  // CIUDAD
        co.hq_town || co.hq_city || '', // PUEBLO
        workField,                      // WORK
        workDesc,                       // DESCRIPCION DEL TRABAJO
        co.website              || '',  // DOMINIO DE PAGINA
        '',                             // Lista de llamadas
        '',                             // Likedin
        '',                             // Rutas
      ]);

      if (co.google_maps_status === 'closed') applyRowColor(newRow, COLOR_RED);
      newRow.font   = { name: 'Arial', size: 10 };
      newRow.height = 15;
    }

    if (n) byName.add(n);
    if (p && p.length >= 7) byPhone.add(p);
    if (d && d.includes('.')) byDomain.add(d);

    exportedIds.push(co.id);
    added++;
    if (added % 100 === 0) console.log(`  → ${added} empresas agregadas...`);
  }

  // 3. Guardar Excel
  if (!dryRun && added > 0) {
    await wb.xlsx.writeFile(filePath);
    console.log(`\n💾 Excel guardado: ${filePath}`);
  }

  // 4. Marcar exportadas en BD
  if (!dryRun && exportedIds.length > 0) {
    await pool.query(
      `UPDATE companies SET excel_exported_at = NOW() WHERE id = ANY($1::uuid[])`,
      [exportedIds]
    );
  }

  if (ownPool) await pool.end();

  const result = { added, skipped, totalRowsInExcel: lastRow - 1 + added };
  console.log(`\n✅ Resultado: ${added} agregadas · ${skipped} duplicadas · ${result.totalRowsInExcel} total en Excel`);
  return result;
}

// ── Entry point CLI ───────────────────────────────────────────────────────────
// Solo corre si se ejecuta directamente (npx tsx scripts/export-to-excel.ts)
const isMain = process.argv[1]?.endsWith('export-to-excel.ts') ||
               process.argv[1]?.endsWith('export-to-excel.js');

if (isMain) {
  runExport().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
