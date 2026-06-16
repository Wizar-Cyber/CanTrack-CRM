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

import 'dotenv/config';
import { google, sheets_v4 } from 'googleapis';
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import { SERVICE_TYPE_BY_ID } from '../server/data/serviceTypes.js';
import { companyRegionClause, isRegionFilterActive, REGION_FILTER } from '../server/utils/region-filter.js';

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
function normalizeBase(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function normName(s: string): string {
  return normalizeBase(s)
    .replace(/\b(limitee|limitée|ltee|ltee)\b/g, 'ltd')
    .replace(/\b(limited)\b/g, 'ltd')
    .replace(/\b(s a s|sas)\b/g, 'sas')
    .replace(/\b(l t d|ltd)\b/g, 'ltd')
    .replace(/\b(incorporated|inc)\b/g, 'inc')
    .replace(/\b(corporation|corp)\b/g, 'corp')
    .replace(/\b(company|co)\b/g, 'co')
    .replace(/\s+/g, ' ')
    .trim();
}

function normLocation(s: string): string {
  return normalizeBase(s);
}

function normAddress(s: string): string {
  return normalizeBase(s)
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(road|rd)\b/g, 'rd')
    .replace(/\b(unit|suite|ste)\b/g, 'unit')
    .replace(/\s+/g, ' ')
    .trim();
}
function normPhone(s: string | number): string {
  const digits = String(s || '').replace(/\D/g, '');
  const phone = digits.length > 10 ? digits.slice(-10) : digits;

  if (phone.length < 7) return '';
  if (/^(\d)\1+$/.test(phone)) return '';
  if (new Set(phone.split('')).size <= 2) return '';

  return phone;
}
function normDomain(s: string): string {
  const domain = (s || '').toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim();

  if (!domain || !domain.includes('.')) return '';

  const ignoredDomains = new Set([
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'x.com',
    'twitter.com',
    'youtube.com',
    'tiktok.com',
    'wa.me',
    'goo.gl',
    'maps.google.com',
    'google.com',
    'wikipedia.org',
  ]);

  return ignoredDomains.has(domain) ? '' : domain;
}

// ── Autenticación Google ──────────────────────────────────────────────────────
function getAuthClient() {
  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (credJson) {
    try {
      return new google.auth.GoogleAuth({
        credentials: JSON.parse(credJson),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS no es JSON válido');
    }
  }
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('Configura GOOGLE_SERVICE_ACCOUNT_CREDENTIALS o GOOGLE_SERVICE_ACCOUNT_KEY_PATH en .env');
  if (!fs.existsSync(keyPath)) throw new Error(`Archivo de credenciales no encontrado: ${keyPath}`);
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(keyPath, 'utf8')),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function explainGoogleSheetsError(error: any, spreadsheetId: string): Error {
  const rawMessage = String(
    error?.response?.data?.error?.message
    || error?.message
    || 'Error desconocido consultando Google Sheets'
  );

  if (/not supported for this document/i.test(rawMessage)) {
    return new Error(
      `El documento ${spreadsheetId} no es compatible con Google Sheets API. ` +
      'Si es un archivo Excel abierto desde Google Drive, conviértelo a Google Sheets nativo ' +
      'o usa el flujo de exportación por Excel.'
    );
  }

  if (/requested entity was not found|file not found/i.test(rawMessage)) {
    return new Error(
      `No se pudo acceder al documento ${spreadsheetId}. Verifica el ID y confirma que la service account tenga acceso de Editor al archivo.`
    );
  }

  if (/insufficient permissions|permission denied|forbidden|does not have permission/i.test(rawMessage)) {
    return new Error(
      `La service account no tiene permisos suficientes sobre el documento ${spreadsheetId}. Comparte el archivo con acceso de Editor antes de exportar.`
    );
  }

  return new Error(rawMessage);
}

interface ExistingCompanyIndex {
  rowNumber: number;
  rawName: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  domain: string;
}

interface SheetSnapshot {
  sheetId: number;
  sheetTitle: string;
  headerRowNumber: number;
  headers: string[];
  totalRows: number;
  indexedRecords: number;
  lastDataRowNumber: number;
  rowCount: number;
  byExactName: Map<string, ExistingCompanyIndex>;
  byNormalizedName: Map<string, ExistingCompanyIndex>;
  byNameCity: Map<string, ExistingCompanyIndex>;
  byNameAddress: Map<string, ExistingCompanyIndex>;
  byPhone: Map<string, ExistingCompanyIndex>;
  byDomain: Map<string, ExistingCompanyIndex>;
  allRows: ExistingCompanyIndex[];
}

interface CandidateCompany {
  id: string;
  name: string;
  phone: string;
  contact_email: string;
  exact_address: string;
  hq_province: string;
  hq_city: string;
  hq_region: string;
  hq_town: string;
  website: string;
  google_maps_status: string;
  tipo: string | null;
  suggested_services: Array<{ service_id: string; service_name?: string; reasoning?: string }> | null;
  service_type_id: string | null;
}

interface PreparedRow {
  companyId: string;
  rowNumber?: number;
  values: string[];
  company: CandidateCompany;
}

interface ValidationDecision {
  status: 'new' | 'duplicate' | 'possible_duplicate' | 'invalid';
  reason: string;
  matchedRow?: number;
}

function buildCompositeKey(...parts: Array<string | null | undefined>): string {
  return parts.map(part => part || '').filter(Boolean).join('|');
}

function hasMeaningfulValue(value: string | null | undefined): boolean {
  return Boolean((value || '').trim());
}

function getMeaningfulTokens(name: string): string[] {
  const ignored = new Set([
    'inc', 'ltd', 'corp', 'co', 'company', 'compagnie', 'groupe', 'group',
    'services', 'service', 'restaurant', 'resto', 'hotel', 'hotels',
    'canada', 'quebec', 'les', 'des', 'du', 'de', 'la', 'le', 'and', 'et',
  ]);

  return normName(name)
    .split(' ')
    .filter(token => token.length > 2 && !ignored.has(token));
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(getMeaningfulTokens(a));
  const bTokens = new Set(getMeaningfulTokens(b));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) common++;
  }

  return common / Math.min(aTokens.size, bTokens.size);
}

function sameLocation(a: string, b: string): boolean {
  return Boolean(a && b && a === b);
}

function findHeaderIndex(headers: string[], acceptedNames: string[]): number {
  const normalizedAccepted = acceptedNames.map(name => normalizeBase(name));
  return headers.findIndex(header => normalizedAccepted.includes(normalizeBase(header)));
}

function getCell(row: string[], index: number): string {
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

const REGION_RULES: Array<{
  province: string;
  region: string;
  patterns: string[];
}> = [
  { province: 'QC', region: 'Montréal', patterns: ['montreal', 'montreal-nord', 'saint-laurent', 'verdun', 'ville-marie', 'plateau-mont-royal', 'cote-des-neiges', 'saint-henri'] },
  { province: 'QC', region: 'Capitale-Nationale', patterns: ['quebec', 'cap-rouge', 'ancienne-lorette', 'sainte-foy', 'charlesbourg', 'beauport'] },
  { province: 'QC', region: 'Laval', patterns: ['laval'] },
  { province: 'QC', region: 'Montérégie', patterns: ['longueuil', 'boucherville', 'brossard', 'saint-hyacinthe', 'saint-jean-sur-richelieu', 'terrebonne', 'acton', 'hemmingford', 'saint-michel'] },
  { province: 'QC', region: 'Lanaudière', patterns: ['terrebonne', 'repentigny', 'joliette'] },
  { province: 'QC', region: 'Laurentides', patterns: ['saint-jerome', 'blainville', 'mirabel', 'sainte-anne-des-plaines'] },
  { province: 'QC', region: 'Estrie', patterns: ['sherbrooke', 'magog'] },
  { province: 'QC', region: 'Chaudière-Appalaches', patterns: ['levis', 'saint-georges', 'sainte-marie', 'beauce'] },
  { province: 'QC', region: 'Bas-Saint-Laurent', patterns: ['rimouski', 'riviere-du-loup'] },
  { province: 'QC', region: 'Gaspésie-Îles-de-la-Madeleine', patterns: ['sainte-anne-des-monts', 'gaspesie', 'gaspé'] },
  { province: 'ON', region: 'Ottawa', patterns: ['ottawa', 'orleans'] },
  { province: 'ON', region: 'GTA', patterns: ['toronto', 'mississauga', 'brampton', 'markham', 'richmond hill'] },
];

function inferRegion(city: string, province: string, address: string): string {
  const normalizedProvince = normalizeBase(province).toUpperCase();
  const haystack = [city, address]
    .map(value => normalizeBase(value))
    .filter(Boolean)
    .join(' ');

  if (!haystack || !normalizedProvince) return '';

  for (const rule of REGION_RULES) {
    if (rule.province !== normalizedProvince) continue;
    if (rule.patterns.some(pattern => haystack.includes(pattern))) {
      return rule.region;
    }
  }

  return '';
}

function assessPossibleDuplicate(
  company: CandidateCompany,
  snapshot: SheetSnapshot,
): ExistingCompanyIndex | null {
  const normalizedName = normName(company.name);
  const normalizedCity = normLocation(company.hq_city || company.hq_town);
  const normalizedAddress = normAddress(company.exact_address);
  const normalizedPhone = normPhone(company.phone);
  const normalizedDomain = normDomain(company.website);

  if (!normalizedName) return null;

  for (const existing of snapshot.allRows) {
    if (!existing.name) continue;

    const overlap = tokenOverlapScore(company.name, existing.rawName || existing.name);
    const nameContained =
      existing.name.includes(normalizedName) ||
      normalizedName.includes(existing.name);
    const sameCity = sameLocation(normalizedCity, existing.city);
    const sameAddress = sameLocation(normalizedAddress, existing.address);
    const samePhone = Boolean(normalizedPhone && existing.phone && normalizedPhone === existing.phone);
    const sameDomain = Boolean(normalizedDomain && existing.domain && normalizedDomain === existing.domain);

    if ((nameContained || overlap >= 0.85) && (sameCity || sameAddress)) {
      return existing;
    }

    if (overlap >= 0.6 && (samePhone || sameDomain || sameCity || sameAddress)) {
      return existing;
    }
  }

  return null;
}

function validateCandidateAgainstSheet(company: CandidateCompany, snapshot: SheetSnapshot): ValidationDecision {
  const normalizedName = normName(company.name);
  const normalizedCity = normLocation(company.hq_city || company.hq_town);
  const normalizedAddress = normAddress(company.exact_address);
  const normalizedPhone = normPhone(company.phone);
  const normalizedDomain = normDomain(company.website);

  if (!normalizedName) {
    return { status: 'invalid', reason: 'Nombre vacío o inválido' };
  }

  const hasContactOrLocation =
    hasMeaningfulValue(company.phone) ||
    hasMeaningfulValue(company.contact_email) ||
    hasMeaningfulValue(company.website) ||
    hasMeaningfulValue(company.exact_address) ||
    hasMeaningfulValue(company.hq_city) ||
    hasMeaningfulValue(company.hq_town);

  if (!hasContactOrLocation) {
    return { status: 'invalid', reason: 'Registro incompleto: sin contacto ni ubicación' };
  }

  const missingRequiredFields: string[] = [];
  if (!hasMeaningfulValue(company.phone)) missingRequiredFields.push('teléfono');
  if (!hasMeaningfulValue(company.contact_email)) missingRequiredFields.push('correo');
  if (!hasMeaningfulValue(company.exact_address)) missingRequiredFields.push('dirección');

  if (missingRequiredFields.length > 0) {
    return {
      status: 'invalid',
      reason: `Registro incompleto: falta ${missingRequiredFields.join(', ')}`,
    };
  }

  const exactNameMatch = snapshot.byExactName.get(company.name.trim());
  if (exactNameMatch) {
    return {
      status: 'duplicate',
      reason: 'Coincidencia exacta por nombre',
      matchedRow: exactNameMatch.rowNumber,
    };
  }

  const normalizedNameMatch = snapshot.byNormalizedName.get(normalizedName);
  if (normalizedNameMatch) {
    return {
      status: 'duplicate',
      reason: 'Coincidencia normalizada por nombre',
      matchedRow: normalizedNameMatch.rowNumber,
    };
  }

  const nameCityKey = buildCompositeKey(normalizedName, normalizedCity);
  if (nameCityKey && snapshot.byNameCity.has(nameCityKey)) {
    const match = snapshot.byNameCity.get(nameCityKey)!;
    return {
      status: 'duplicate',
      reason: 'Coincidencia por nombre + ciudad',
      matchedRow: match.rowNumber,
    };
  }

  const nameAddressKey = buildCompositeKey(normalizedName, normalizedAddress);
  if (nameAddressKey && snapshot.byNameAddress.has(nameAddressKey)) {
    const match = snapshot.byNameAddress.get(nameAddressKey)!;
    return {
      status: 'duplicate',
      reason: 'Coincidencia por nombre + dirección',
      matchedRow: match.rowNumber,
    };
  }

  if (normalizedPhone && normalizedPhone.length >= 7 && snapshot.byPhone.has(normalizedPhone)) {
    const match = snapshot.byPhone.get(normalizedPhone)!;
    const overlap = tokenOverlapScore(company.name, match.rawName || match.name);
    if (overlap >= 0.5 || sameLocation(normalizedCity, match.city) || sameLocation(normalizedAddress, match.address)) {
      return {
        status: 'possible_duplicate',
        reason: 'Coincidencia por teléfono con señales de contexto; requiere revisión manual',
        matchedRow: match.rowNumber,
      };
    }
  }

  if (normalizedDomain && normalizedDomain.includes('.') && snapshot.byDomain.has(normalizedDomain)) {
    const match = snapshot.byDomain.get(normalizedDomain)!;
    const overlap = tokenOverlapScore(company.name, match.rawName || match.name);
    if (overlap >= 0.4 || sameLocation(normalizedCity, match.city) || sameLocation(normalizedAddress, match.address)) {
      return {
        status: 'possible_duplicate',
        reason: 'Coincidencia por dominio con señales de contexto; requiere revisión manual',
        matchedRow: match.rowNumber,
      };
    }
  }

  const possibleMatch = assessPossibleDuplicate(company, snapshot);
  if (possibleMatch) {
    return {
      status: 'possible_duplicate',
      reason: 'Alta similitud nominal; requiere revisión manual',
      matchedRow: possibleMatch.rowNumber,
    };
  }

  return { status: 'new', reason: 'Registro nuevo' };
}

function registerAcceptedRow(snapshot: SheetSnapshot, prepared: PreparedRow): void {
  const rowNumber = prepared.rowNumber ?? snapshot.lastDataRowNumber + 1;
  const normalizedName = normName(prepared.company.name);
  const normalizedCity = normLocation(prepared.company.hq_city || prepared.company.hq_town);
  const normalizedAddress = normAddress(prepared.company.exact_address);
  const normalizedPhone = normPhone(prepared.company.phone);
  const normalizedDomain = normDomain(prepared.company.website);

  const record: ExistingCompanyIndex = {
    rowNumber,
    rawName: prepared.company.name,
    name: normalizedName,
    city: normalizedCity,
    address: normalizedAddress,
    phone: normalizedPhone,
    domain: normalizedDomain,
  };

  snapshot.allRows.push(record);
  if (prepared.company.name.trim()) snapshot.byExactName.set(prepared.company.name.trim(), record);
  if (normalizedName) snapshot.byNormalizedName.set(normalizedName, record);

  const nameCityKey = buildCompositeKey(normalizedName, normalizedCity);
  const nameAddressKey = buildCompositeKey(normalizedName, normalizedAddress);

  if (nameCityKey) snapshot.byNameCity.set(nameCityKey, record);
  if (nameAddressKey) snapshot.byNameAddress.set(nameAddressKey, record);
  if (normalizedPhone && normalizedPhone.length >= 7) snapshot.byPhone.set(normalizedPhone, record);
  if (normalizedDomain && normalizedDomain.includes('.')) snapshot.byDomain.set(normalizedDomain, record);
  snapshot.lastDataRowNumber = rowNumber;
  snapshot.totalRows += 1;
}

// ── Leer filas existentes del Sheet para dedup ───────────────────────────────
async function buildSheetDupIndex(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<{
  sheetSnapshot: SheetSnapshot;
}> {
  const byExactName = new Map<string, ExistingCompanyIndex>();
  const byNormalizedName = new Map<string, ExistingCompanyIndex>();
  const byNameCity = new Map<string, ExistingCompanyIndex>();
  const byNameAddress = new Map<string, ExistingCompanyIndex>();
  const byPhone = new Map<string, ExistingCompanyIndex>();
  const byDomain = new Map<string, ExistingCompanyIndex>();
  const allRows: ExistingCompanyIndex[] = [];

  // Obtener info del sheet (nombre de la primera hoja)
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId });
  } catch (error) {
    throw explainGoogleSheetsError(error, spreadsheetId);
  }
  const firstSheet = meta.data.sheets?.[0];
  const sheetTitle = firstSheet?.properties?.title ?? 'Sheet1';
  const sheetId = firstSheet?.properties?.sheetId ?? 0;
  const rowCount = firstSheet?.properties?.gridProperties?.rowCount ?? 1000;

  // Leer una sola vez para construir índices y preservar la estructura actual.
  let resp;
  try {
    resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!A:P`,
    });
  } catch (error) {
    throw explainGoogleSheetsError(error, spreadsheetId);
  }

  const rows = resp.data.values ?? [];
  const headers = (rows[0] ?? []).map(value => String(value ?? '').trim());
  const companyIdx = findHeaderIndex(headers, ['EMPRESA', 'COMPANY', 'NOMBRE']);
  const phoneIdx = findHeaderIndex(headers, ['TELEFONO', 'TELÉFONO', 'PHONE']);
  const addressIdx = findHeaderIndex(headers, ['DIRECCION', 'DIRECCIÓN', 'ADDRESS']);
  const cityIdx = findHeaderIndex(headers, ['CIUDAD', 'CITY']);
  const townIdx = findHeaderIndex(headers, ['PUEBLO', 'TOWN']);
  const domainIdx = findHeaderIndex(headers, ['DOMINIO DE PAGINA', 'DOMINIO DE PÁGINA', 'WEBSITE', 'DOMAIN']);
  let dataRows = 0;
  let indexedRecords = 0;
  let lastDataRowNumber = 1;
  let blankStreak = 0;
  const maxBlankGapBeforeStop = 25;

  for (let i = 1; i < rows.length; i++) { // saltar header
    const row = rows[i];
    const empresa = getCell(row, companyIdx);
    const telefono = getCell(row, phoneIdx);
    const direccion = getCell(row, addressIdx);
    const ciudad = getCell(row, cityIdx) || getCell(row, townIdx);
    const dominio = getCell(row, domainIdx);
    const rowHasAnyValue = row.some(value => String(value ?? '').trim() !== '');

    if (!rowHasAnyValue) {
      if (dataRows > 0) {
        blankStreak++;
        if (blankStreak >= maxBlankGapBeforeStop) {
          break;
        }
      }
      continue;
    }

    blankStreak = 0;

    const record: ExistingCompanyIndex = {
      rowNumber: i + 1,
      rawName: empresa,
      name: normName(empresa),
      city: normLocation(ciudad),
      address: normAddress(direccion),
      phone: normPhone(telefono),
      domain: normDomain(dominio),
    };

    dataRows++;
    lastDataRowNumber = i + 1;

    if (!record.name && !record.phone && !record.domain && !record.address) {
      continue;
    }

    allRows.push(record);
    if (empresa) byExactName.set(empresa, record);
    if (record.name) byNormalizedName.set(record.name, record);

    const nameCityKey = buildCompositeKey(record.name, record.city);
    const nameAddressKey = buildCompositeKey(record.name, record.address);

    if (nameCityKey) byNameCity.set(nameCityKey, record);
    if (nameAddressKey) byNameAddress.set(nameAddressKey, record);
    if (record.phone && record.phone.length >= 7) byPhone.set(record.phone, record);
    if (record.domain && record.domain.includes('.')) byDomain.set(record.domain, record);
    indexedRecords++;
  }

  console.log(`📊 Google Sheet: ${dataRows} filas usadas · ${indexedRecords} indexadas · ${byNormalizedName.size} nombres únicos`);
  return {
    sheetSnapshot: {
      sheetId,
      sheetTitle,
      headerRowNumber: 1,
      headers,
      totalRows: dataRows,
      indexedRecords,
      lastDataRowNumber,
      rowCount,
      byExactName,
      byNormalizedName,
      byNameCity,
      byNameAddress,
      byPhone,
      byDomain,
      allRows,
    },
  };
}

// ── Resultado ─────────────────────────────────────────────────────────────────
export interface SheetsExportResult {
  added: number;
  skipped: number;
  possibleDuplicates: number;
  invalid: number;
  totalRowsInSheet: number;
  possibleDuplicateDetails: Array<{ id: string; name: string; reason: string; matchedRow?: number }>;
  invalidDetails: Array<{ id: string; name: string; reason: string }>;
  transformations: string[];
}

// ── Función principal exportable ──────────────────────────────────────────────
export async function runSheetsExport(opts: {
  limit?: number;
  dryRun?: boolean;
  spreadsheetId?: string;
  pool?: pkg.Pool;
  hqProvince?: string;
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
  const { sheetSnapshot } =
    await buildSheetDupIndex(sheets, spreadsheetId);

  // 2. Consultar empresas nuevas de la BD
  let provinceClause: string;
  if (opts.hqProvince) {
    const p = opts.hqProvince.toLowerCase();
    if (p === 'ontario') {
      provinceClause = `(c.hq_province ILIKE 'on' OR c.hq_province ILIKE 'ontario')`;
    } else if (p === 'quebec') {
      provinceClause = `(c.hq_province ILIKE 'qc' OR c.hq_province ILIKE 'quebec' OR c.hq_province ILIKE 'québec')`;
    } else {
      provinceClause = `c.hq_province ILIKE '${p.replace(/'/g, "''")}'`;
    }
    console.log(`🍁 Filtrando por provincia: ${opts.hqProvince}\n`);
  } else {
    provinceClause = companyRegionClause('c');
    if (isRegionFilterActive()) {
      console.log(`🍁 Filtro regional activo: ${REGION_FILTER} — solo se exportan empresas de esa provincia\n`);
    }
  }

  const { rows: companies } = await pool.query(`
    SELECT id, name, phone, contact_email, exact_address, hq_province, hq_city,
           hq_region, hq_town, website, google_maps_status, enriched_at,
           suggested_services, tipo::text AS tipo, NULL AS service_type_id
    FROM companies
    WHERE sheets_exported_at IS NULL
      AND enrichment_status IN ('scraped', 'db_matched', 'verified')
      AND name IS NOT NULL
      AND (exact_address IS NOT NULL AND TRIM(exact_address) <> '')
      AND ${provinceClause}
    UNION ALL
    SELECT oc.id, oc.nombre, oc.telefono, oc.correo,
           oc.direccion, oc.provincia, oc.ciudad,
           oc.region, oc.pueblo, oc.dominio_de_pagina,
           NULL, oc.enriched_at,
           oc.suggested_services, oc.tipo,
           (SELECT j.service_type_id FROM jobs j
            WHERE j.province_id = oc.id AND j.province_source = 'ontario' AND j.service_type_id IS NOT NULL
            ORDER BY j.service_match_confidence DESC NULLS LAST LIMIT 1)
    FROM ontario_companies oc
    WHERE oc.sheets_exported_at IS NULL
      AND oc.enrichment_status IN ('scraped', 'db_matched')
      AND oc.nombre IS NOT NULL
      AND (oc.direccion IS NOT NULL AND TRIM(oc.direccion) <> '')
    UNION ALL
    SELECT qc.id, qc.nombre, qc.telefono, qc.correo,
           qc.direccion, qc.provincia, qc.ciudad,
           qc.region, qc.pueblo, qc.dominio_de_pagina,
           NULL, qc.enriched_at,
           qc.suggested_services, qc.tipo,
           (SELECT j.service_type_id FROM jobs j
            WHERE j.province_id = qc.id AND j.province_source = 'quebec' AND j.service_type_id IS NOT NULL
            ORDER BY j.service_match_confidence DESC NULLS LAST LIMIT 1)
    FROM quebec_companies qc
    WHERE qc.sheets_exported_at IS NULL
      AND qc.enrichment_status IN ('scraped', 'db_matched')
      AND qc.nombre IS NOT NULL
      AND (qc.direccion IS NOT NULL AND TRIM(qc.direccion) <> '')
    ORDER BY enriched_at ASC NULLS LAST
    LIMIT $1
  `, [limit]);

  console.log(`🔍 Empresas candidatas en BD: ${companies.length}`);

  let added = 0;
  let skipped = 0;
  let invalid = 0;
  let possibleDuplicates = 0;
  const exportedIds: string[] = [];
  const newRows: PreparedRow[] = [];
  const possibleDuplicateDetails: SheetsExportResult['possibleDuplicateDetails'] = [];
  const invalidDetails: SheetsExportResult['invalidDetails'] = [];
  const transformations = [
    'Deduplicación por nombre exacto, nombre normalizado, nombre+ciudad y nombre+dirección.',
    'Normalización: minúsculas, eliminación de tildes, trim de espacios y limpieza de caracteres especiales irrelevantes.',
    'Teléfono y dominio solo cuentan como posible duplicado cuando además hay señales de contexto como nombre, ciudad o dirección.',
    'REGIÓN usa hq_region cuando existe; si no, se infiere desde ciudad, provincia y dirección con reglas locales.',
    'Registros sin nombre o sin datos mínimos de contacto/ubicación se rechazan como inválidos.',
    'La inserción copia el formato de la última fila existente antes de escribir los valores nuevos.',
  ];

  const today = new Date().toLocaleDateString('es-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  for (const co of companies) {
    const company: CandidateCompany = {
      ...co,
      name: co.name || '',
      phone: co.phone || '',
      contact_email: co.contact_email || '',
      exact_address: co.exact_address || '',
      hq_province: co.hq_province || '',
      hq_city: co.hq_city || '',
      hq_region: co.hq_region || '',
      hq_town: co.hq_town || '',
      website: co.website || '',
      google_maps_status: co.google_maps_status || 'unknown',
      tipo: co.tipo || null,
      suggested_services: Array.isArray(co.suggested_services) ? co.suggested_services : [],
      service_type_id: co.service_type_id || null,
    };
    const resolvedRegion = company.hq_region || inferRegion(company.hq_city || company.hq_town, company.hq_province, company.exact_address);

    const validation = validateCandidateAgainstSheet(company, sheetSnapshot);
    if (validation.status === 'duplicate') {
      skipped++;
      exportedIds.push(company.id);
      continue;
    }
    if (validation.status === 'possible_duplicate') {
      possibleDuplicates++;
      possibleDuplicateDetails.push({
        id: company.id,
        name: company.name || 'Sin nombre',
        reason: validation.reason,
        matchedRow: validation.matchedRow,
      });
      continue;
    }
    if (validation.status === 'invalid') {
      invalid++;
      invalidDetails.push({
        id: company.id,
        name: company.name || 'Sin nombre',
        reason: validation.reason,
      });
      continue;
    }

    // WORK + DESCRIPCION
    let workField = 'GENERAL';
    let workDesc  = 'Trabajador polivalente para labores generales.';

    if (company.service_type_id && SERVICE_TO_WORK[company.service_type_id]) {
      workField = SERVICE_TO_WORK[company.service_type_id];
      workDesc  = SERVICE_TYPE_BY_ID[company.service_type_id]?.description || '';
    } else if (Array.isArray(company.suggested_services) && company.suggested_services.length > 0) {
      const top = company.suggested_services[0];
      workField = SERVICE_TO_WORK[top.service_id] || top.service_name?.toUpperCase() || 'GENERAL';
      workDesc  = SERVICE_TYPE_BY_ID[top.service_id]?.description || top.reasoning || '';
    }

    const prepared: PreparedRow = {
      companyId: company.id,
      company,
      rowNumber: sheetSnapshot.lastDataRowNumber + newRows.length + 1,
      values: [
        company.name || '',          // A: EMPRESA
        company.phone || '',         // B: TELEFONO
        company.tipo || '',          // C: TIPO
        company.contact_email || '', // D: CORREO
        today,               // E: Fecha
        company.exact_address || '', // F: DIRECCION
        company.hq_province || '',   // G: PROVINCIA
        resolvedRegion || '',        // H: REGIÓN
        company.hq_city || '',       // I: CIUDAD
        company.hq_town || company.hq_city || '', // J: PUEBLO
        workField,           // K: WORK
        workDesc,            // L: DESCRIPCION DEL TRABAJO
        company.website || '', // M: DOMINIO DE PAGINA
        '',                  // N: Lista de llamadas
        '',                  // O: LinkedIn
        '',                  // P: Rutas
      ],
    };

    newRows.push(prepared);
    registerAcceptedRow(sheetSnapshot, prepared);
    exportedIds.push(company.id);
    added++;
  }

  // 3. Escribir al Sheet
  if (!dryRun && newRows.length > 0) {
    const nextRowNumber = sheetSnapshot.lastDataRowNumber - newRows.length + 1;
    let actualStartRowNumber = nextRowNumber;
    let actualEndRowNumber = nextRowNumber + newRows.length - 1;

    try {
      const appendResponse = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetSnapshot.sheetTitle}!A:P`,
        insertDataOption: 'INSERT_ROWS',
        valueInputOption: 'RAW',
        requestBody: { values: newRows.map(row => row.values) },
      });

      const updatedRange = appendResponse.data.updates?.updatedRange || '';
      const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/i);
      if (match) {
        actualStartRowNumber = Number(match[1]);
        actualEndRowNumber = Number(match[2]);
      }

      const sourceFormatRowIndex = Math.max(sheetSnapshot.headerRowNumber, actualStartRowNumber - 1) - 1;
      const insertStartIndex = actualStartRowNumber - 1;
      const insertEndIndex = actualEndRowNumber;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              copyPaste: {
                source: {
                  sheetId: sheetSnapshot.sheetId,
                  startRowIndex: sourceFormatRowIndex,
                  endRowIndex: sourceFormatRowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: Math.max(sheetSnapshot.headers.length, 16),
                },
                destination: {
                  sheetId: sheetSnapshot.sheetId,
                  startRowIndex: insertStartIndex,
                  endRowIndex: insertEndIndex,
                  startColumnIndex: 0,
                  endColumnIndex: Math.max(sheetSnapshot.headers.length, 16),
                },
                pasteType: 'PASTE_FORMAT',
                pasteOrientation: 'NORMAL',
              },
            },
          ],
        },
      });
    } catch (error) {
      throw explainGoogleSheetsError(error, spreadsheetId);
    }

    const TIPO_COLORS: Record<string, { red: number; green: number; blue: number }> = {
      rojo:    { red: 0.96, green: 0.74, blue: 0.74 },
      verde:   { red: 0.72, green: 0.93, blue: 0.72 },
      naranja: { red: 0.99, green: 0.87, blue: 0.60 },
      morado:  { red: 0.83, green: 0.72, blue: 0.93 },
    };

    interface RowColorInfo { rowIndex: number; red: number; green: number; blue: number; }
    const colorRows: RowColorInfo[] = [];
    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      const rowIndex = actualStartRowNumber - 1 + i;
      const tipo = row.company.tipo;
      if (tipo && TIPO_COLORS[tipo]) {
        colorRows.push({ rowIndex, ...TIPO_COLORS[tipo] });
      } else if (row.company.google_maps_status === 'closed') {
        colorRows.push({ rowIndex, red: 1, green: 0.92, blue: 0.92 });
      }
    }

    if (colorRows.length > 0) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: colorRows.map(({ rowIndex, red, green, blue }) => ({
              repeatCell: {
                range: {
                  sheetId: sheetSnapshot.sheetId,
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 16,
                },
                cell: {
                  userEnteredFormat: { backgroundColor: { red, green, blue } },
                },
                fields: 'userEnteredFormat.backgroundColor',
              },
            })),
          },
        });
      } catch (error) {
        throw explainGoogleSheetsError(error, spreadsheetId);
      }
    }

    console.log(`\n💾 Google Sheet actualizado: +${added} filas`);
  }

  // 4. Marcar exportadas en BD (columna sheets_exported_at)
  if (!dryRun && exportedIds.length > 0) {
    // Try all three tables
    await pool.query(
      `UPDATE companies SET sheets_exported_at = NOW() WHERE id = ANY($1::uuid[])`,
      [exportedIds]
    ).catch(() => {});
    await pool.query(
      `UPDATE ontario_companies SET sheets_exported_at = NOW() WHERE id = ANY($1::uuid[])`,
      [exportedIds]
    ).catch(() => {});
    await pool.query(
      `UPDATE quebec_companies SET sheets_exported_at = NOW() WHERE id = ANY($1::uuid[])`,
      [exportedIds]
    ).catch(() => {});
  }

  if (ownPool) await pool.end();

  const result = {
    added,
    skipped,
    possibleDuplicates,
    invalid,
    totalRowsInSheet: sheetSnapshot.totalRows,
    possibleDuplicateDetails,
    invalidDetails,
    transformations,
  };
  console.log(
    `\n✅ Sheets: ${added} agregadas · ${skipped} duplicadas · ${possibleDuplicates} posibles duplicadas · ${invalid} inválidas · ${result.totalRowsInSheet} total`
  );
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
