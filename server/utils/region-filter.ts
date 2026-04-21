/**
 * Region filter — restringe TODA la operación del CRM a una provincia canadiense.
 *
 * Activado vía env var `REGION_FILTER`:
 *   REGION_FILTER=QC      → solo Quebec
 *   REGION_FILTER=ON      → solo Ontario
 *   REGION_FILTER=        → sin filtro (modo multi-provincia)
 *
 * Cuando está activo se aplica a:
 *   • GET  /api/companies
 *   • GET  /api/jobs
 *   • GET  /api/stats
 *   • POST /api/companies/export
 *   • POST /api/sync/scraped-jobs (no se vinculan vacantes fuera de la región)
 *   • POST /api/webhook/scraper   (se rechazan vacantes fuera de la región)
 *   • scripts/enrich-companies.ts (solo empresas candidatas de la región)
 */

/**
 * IMPORTANTE: quien importe este módulo debe asegurarse de que `dotenv` ya
 * haya corrido (ej: `import 'dotenv/config'` como primera línea de server.ts).
 */
export const REGION_FILTER = (process.env.REGION_FILTER || '').trim().toUpperCase();

/** true si el filtro está activo */
export function isRegionFilterActive(): boolean {
  return REGION_FILTER.length > 0;
}

/** Mapeo código provincial → set de tokens aceptados en texto libre */
const PROVINCE_TOKENS: Record<string, string[]> = {
  QC: ['QC', 'QUEBEC', 'QUÉBEC'],
  ON: ['ON', 'ONTARIO'],
  BC: ['BC', 'BRITISH COLUMBIA'],
  AB: ['AB', 'ALBERTA'],
  MB: ['MB', 'MANITOBA'],
  SK: ['SK', 'SASKATCHEWAN'],
  NS: ['NS', 'NOVA SCOTIA'],
  NB: ['NB', 'NEW BRUNSWICK'],
  NL: ['NL', 'NEWFOUNDLAND'],
  PE: ['PE', 'PEI', 'PRINCE EDWARD ISLAND'],
  YT: ['YT', 'YUKON'],
  NT: ['NT', 'NORTHWEST TERRITORIES'],
  NU: ['NU', 'NUNAVUT'],
};

/** Devuelve los tokens a buscar en texto para la provincia configurada */
export function regionTokens(): string[] {
  return PROVINCE_TOKENS[REGION_FILTER] ?? [REGION_FILTER];
}

/**
 * Fragmento SQL para filtrar companies por provincia.
 * Criterio:
 *   hq_province = 'QC' OR hq_province ILIKE 'Quebec%' OR exact_address ILIKE '%, QC %'
 *   OR exact_address ILIKE '%Quebec%'
 *
 * Si el filtro está desactivado devuelve `TRUE` (no-op).
 * Sin parámetros — todos los literales son seguros (enum provincial).
 */
export function companyRegionClause(alias: string = 'c'): string {
  if (!isRegionFilterActive()) return 'TRUE';
  const tokens = regionTokens();
  const code = tokens[0]; // siempre el código de 2 letras
  const likeBits: string[] = [];
  for (const t of tokens) {
    // Escape single quotes for SQL literals
    const safe = t.replace(/'/g, "''");
    likeBits.push(`UPPER(${alias}.exact_address) ILIKE '%${safe}%'`);
    likeBits.push(`UPPER(${alias}.hq_province)  = '${safe}'`);
    likeBits.push(`UPPER(${alias}.hq_region)    ILIKE '%${safe}%'`);
  }
  // Caso especial: empresa sin province pero con hq_country null y sin scraping
  // aún se considera IN si cualquier campo contiene el token.
  return `(${likeBits.join(' OR ')})`;
}

/**
 * Fragmento SQL para filtrar jobs por provincia.
 * Un job es de la región si:
 *   • Su company vinculada lo es, OR
 *   • Su location/country contiene el token provincial (vacantes sin empresa aún)
 */
export function jobRegionClause(jobAlias: string = 'j', companyAlias: string = 'c'): string {
  if (!isRegionFilterActive()) return 'TRUE';
  const tokens = regionTokens();
  const likeJob: string[] = [];
  for (const t of tokens) {
    const safe = t.replace(/'/g, "''");
    likeJob.push(`UPPER(${jobAlias}.location) ILIKE '%${safe}%'`);
    likeJob.push(`UPPER(${jobAlias}.country)  ILIKE '%${safe}%'`);
  }
  // company null + location match  O  company no-null + company cumple región
  return `(
    (${companyAlias}.id IS NULL AND (${likeJob.join(' OR ')}))
    OR (${companyAlias}.id IS NOT NULL AND ${companyRegionClause(companyAlias)})
  )`;
}

/**
 * Chequeo en JS para cualquier texto libre (location, ubicacion, address scrappeado).
 * Útil al ingerir webhook scraper y al sincronizar scraped_jobs legacy.
 */
export function isRegionMatch(...fields: (string | null | undefined)[]): boolean {
  if (!isRegionFilterActive()) return true;
  const tokens = regionTokens();
  const blob = fields.filter(Boolean).join(' | ').toUpperCase();
  return tokens.some(t => blob.includes(t));
}
