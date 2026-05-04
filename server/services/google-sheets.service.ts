/**
 * Google Sheets Service — formato Acton Vale (3 columnas: Empresa | DIRECCION | WORK)
 *
 * Config vía .env:
 *   GOOGLE_SHEETS_ID              → ID del spreadsheet
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH → ruta al JSON de la service account
 *   SHEETS_TAB_NAME               → nombre de la pestaña (default: "Hoja1")
 */

import fs from 'fs';
import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { normalizeString, assessDuplication } from '../utils/normalization.js';

// ── Config desde env ──────────────────────────────────────────────────────────
function getSheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID || '';
  if (!id) throw new Error('GOOGLE_SHEETS_ID no configurado en .env');
  return id;
}
function getTabName(): string {
  return (process.env.SHEETS_TAB_NAME || 'Hoja1').trim();
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface ActonValeRow {
  empresa:     string;   // A — EMPRESA
  telefono:    string;   // B — TELEFONO
  tipo:        string;   // C — TIPO
  correo:      string;   // D — CORREO
  fecha:       string;   // E — Fecha
  direccion:   string;   // F — DIRECCION
  provincia:   string;   // G — PROVINCIA
  region:      string;   // H — REGIÓN
  ciudad:      string;   // I — CIUDAD
  pueblo:      string;   // J — PUEBLO
  work:        string;   // K — WORK
  descripcion: string;   // L — DESCRIPCION DEL TRABAJO
  dominio:     string;   // M — DOMINIO DE PAGINA
}

export interface ExportResult {
  total:              number;
  inserted:           number;
  duplicates:         number;
  possibleDuplicates: number;
  details: {
    duplicateNames:         string[];
    possibleDuplicateNames: string[];
  };
  durationMs: number;
}

// ── Servicio ──────────────────────────────────────────────────────────────────
export class GoogleSheetsService {
  private static sheetsClient: sheets_v4.Sheets | null = null;
  private static resolvedTabName: string | null = null; // caché del nombre real de la hoja

  /**
   * Resuelve el nombre real de la primera pestaña del spreadsheet.
   * Prioridad: env SHEETS_TAB_NAME → nombre real leído de la API → fallback 'Sheet1'
   */
  private static async resolveTabName(): Promise<string> {
    if (this.resolvedTabName) return this.resolvedTabName;
    // Si el usuario lo configuró explícitamente, usarlo
    const envTab = (process.env.SHEETS_TAB_NAME || '').trim();
    if (envTab) { this.resolvedTabName = envTab; return envTab; }
    // Leer el nombre real de la primera hoja
    try {
      const meta = await this.api.spreadsheets.get({ spreadsheetId: getSheetId() });
      const realName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
      this.resolvedTabName = realName;
      console.log(`[Sheets] Pestaña detectada: "${realName}"`);
      return realName;
    } catch {
      this.resolvedTabName = 'Sheet1';
      return 'Sheet1';
    }
  }

  /** Inicializa la autenticación. Debe llamarse antes de cualquier operación. */
  static async init(): Promise<void> {
    if (this.sheetsClient) return; // ya inicializado

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || '';
    if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH no configurado en .env');

    const keyJson = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

    const auth = new JWT({
      email: keyJson.client_email,
      key:   keyJson.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[Sheets] ✅ Autenticado como:', keyJson.client_email);
  }

  private static get api(): sheets_v4.Sheets {
    if (!this.sheetsClient) throw new Error('GoogleSheetsService no inicializado — llama a init() primero');
    return this.sheetsClient;
  }

  /**
   * Convierte el color de fondo de una celda al tipo comercial.
   * Google Sheets devuelve RGB como floats 0–1.
   *
   * Lógica:
   *  - Blanco / sin color → null
   *  - Verde dominante    → 'verde'
   *  - Rojo + verde alto  → 'naranja'  (en RGB naranja = rojo + bastante verde)
   *  - Rojo dominante     → 'rojo'
   *  - Azul / morado      → 'morado'
   */
  private static bgColorToTipo(
    bg?: { red?: number | null; green?: number | null; blue?: number | null } | null,
  ): string | null {
    if (!bg) return null;
    const r = bg.red   ?? 1;
    const g = bg.green ?? 1;
    const b = bg.blue  ?? 1;

    // Celda sin color (blanca o casi blanca)
    if (r > 0.92 && g > 0.92 && b > 0.92) return null;

    // Verde: canal verde dominante
    if (g > r && g > b && g > 0.3) return 'verde';

    // Rojo dominante — distinguir naranja vs rojo puro
    if (r > g && r > b) {
      // Naranja: rojo alto + verde significativo (en RGB naranja = rojo + verde)
      if (g > 0.35 && b < 0.4) return 'naranja';
      return 'rojo';
    }

    // Azul / morado (azul solo o mezcla rojo+azul)
    if (b > g) return 'morado';

    return null;
  }

  /** Lee todas las filas de datos (sin la fila de encabezado). */
  static async readRows(): Promise<ActonValeRow[]> {
    const tab = await this.resolveTabName();
    const sheetId = getSheetId();

    // 1. Leer valores de texto (A2:M)
    const resp = await this.api.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A2:M`,   // 13 columnas: A=EMPRESA … M=DOMINIO
    });
    const values = resp.data.values || [];
    if (values.length === 0) return [];

    // 2. Leer colores de fondo de la columna C (TIPO) para detectar verde/naranja/morado/rojo
    //    Usamos spreadsheets.get con includeGridData=true solo en el rango C2:C<N>
    let tipoColors: Array<string | null> = [];
    try {
      const lastRow = values.length + 1; // +1 porque la fila 1 es el encabezado
      const fmtResp = await this.api.spreadsheets.get({
        spreadsheetId: sheetId,
        ranges: [`${tab}!C2:C${lastRow}`],
        includeGridData: true,
        fields: 'sheets(data(rowData(values(userEnteredFormat(backgroundColor)))))',
      });
      const rowData = fmtResp.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
      tipoColors = rowData.map(row => {
        const bg = row.values?.[0]?.userEnteredFormat?.backgroundColor;
        return this.bgColorToTipo(bg as any);
      });
    } catch (e) {
      console.warn('[Sheets] No se pudieron leer los colores de tipo:', (e as Error).message);
    }

    return values.map((r, i) => {
      // Prioridad: color de celda > texto en columna C
      const tipoFromColor = tipoColors[i] ?? null;
      const tipoFromText  = (r[2] ?? '').trim();
      return {
        empresa:     (r[0]  ?? '').trim(),
        telefono:    (r[1]  ?? '').trim(),
        tipo:        tipoFromColor || tipoFromText,
        correo:      (r[3]  ?? '').trim(),
        fecha:       (r[4]  ?? '').trim(),
        direccion:   (r[5]  ?? '').trim(),   // columna F
        provincia:   (r[6]  ?? '').trim(),
        region:      (r[7]  ?? '').trim(),
        ciudad:      (r[8]  ?? '').trim(),
        pueblo:      (r[9]  ?? '').trim(),
        work:        (r[10] ?? '').trim(),   // columna K
        descripcion: (r[11] ?? '').trim(),
        dominio:     (r[12] ?? '').trim(),
      };
    }).filter(r => r.empresa !== '');
  }

  /**
   * Limpia TODAS las filas de datos (conserva la fila 1 de encabezados).
   * Devuelve cuántas filas borró.
   */
  static async clearDataRows(): Promise<number> {
    const sheetId = getSheetId();
    const tab = await this.resolveTabName();

    // Averiguar cuántas filas hay actualmente
    const existing = await this.api.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A2:A`,
    });
    const count = (existing.data.values || []).length;
    if (count === 0) {
      console.log('[Sheets] Hoja ya vacía — nada que limpiar.');
      return 0;
    }

    // Clear solo el rango de datos (fila 2 en adelante)
    await this.api.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${tab}!A2:C`,
    });
    console.log(`[Sheets] 🧹 ${count} filas de datos eliminadas.`);
    return count;
  }

  /**
   * Asegura que la fila de encabezado exista.
   * Si la fila 1 está vacía escribe los headers del formato Acton Vale.
   */
  static async ensureHeaders(): Promise<void> {
    const tab = await this.resolveTabName();
    const resp = await this.api.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: `${tab}!A1:C1`,
    });
    const row = resp.data.values?.[0] || [];
    if (row.length === 0 || !row[0]) {
      await this.api.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `${tab}!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['Empresa', 'DIRECCION', 'WORK']] },
      });
      console.log('[Sheets] 📋 Encabezados escritos.');
    }
  }

  /**
   * Exportación completa con deduplicación.
   *
   * Flujo:
   *  1. Leer filas existentes y construir índice en memoria.
   *  2. Para cada empresa nueva, evaluar si es duplicado.
   *  3. Insertar solo las nuevas en un único batchUpdate.
   *
   * @param rows          Filas a exportar (ya en formato Acton Vale).
   * @param clearFirst    Si true, borra todos los datos antes de insertar (útil para re-sync total).
   */
  static async exportRows(rows: ActonValeRow[], clearFirst = false): Promise<ExportResult> {
    const t0 = Date.now();
    await this.init();
    await this.ensureHeaders();

    if (clearFirst) {
      await this.clearDataRows();
    }

    // ── Leer existentes y construir índice normalizado ──────────────────────
    const existingRows = clearFirst ? [] : await this.readRows();
    const existingIndex = new Map<string, ActonValeRow>();
    for (const r of existingRows) {
      const key = normalizeString(r.empresa);
      if (key) existingIndex.set(key, r);
    }
    console.log(`[Sheets] 📖 ${existingRows.length} filas existentes en la hoja.`);

    // ── Deduplicar ──────────────────────────────────────────────────────────
    const toInsert: ActonValeRow[] = [];
    const duplicateNames: string[] = [];
    const possibleDuplicateNames: string[] = [];

    for (const row of rows) {
      const key = normalizeString(row.empresa);
      if (!key) continue; // nombre vacío → skip

      // Exact match
      if (existingIndex.has(key)) {
        duplicateNames.push(row.empresa);
        continue;
      }

      // Fuzzy match contra todos los existentes
      let skip = false;
      for (const [, existing] of existingIndex) {
        const result = assessDuplication(
          { name: row.empresa,      address: row.direccion },
          { name: existing.empresa, address: existing.direccion },
        );
        if (result === 'exact' || result === 'fuzzy') {
          duplicateNames.push(row.empresa);
          skip = true;
          break;
        }
        if (result === 'possible') {
          possibleDuplicateNames.push(row.empresa);
          skip = true;
          break;
        }
      }
      if (skip) continue;

      toInsert.push(row);
      // Añadir al índice para detectar dupes dentro del mismo batch
      existingIndex.set(key, row);
    }

    console.log(`[Sheets] 🔍 A insertar: ${toInsert.length} | Duplicados: ${duplicateNames.length} | Posibles: ${possibleDuplicateNames.length}`);

    // ── Insertar en batch ───────────────────────────────────────────────────
    if (toInsert.length > 0) {
      const tab = await this.resolveTabName();
      // Siguiente fila disponible
      const currentCount = await this.api.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `${tab}!A:A`,
      });
      const nextRow = (currentCount.data.values?.length || 0) + 1;

      const values = toInsert.map(r => [r.empresa, r.direccion, r.work]);
      await this.api.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `${tab}!A${nextRow}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
      console.log(`[Sheets] ✅ ${toInsert.length} filas insertadas a partir de la fila ${nextRow}.`);
    }

    return {
      total:              rows.length,
      inserted:           toInsert.length,
      duplicates:         duplicateNames.length,
      possibleDuplicates: possibleDuplicateNames.length,
      details:            { duplicateNames, possibleDuplicateNames },
      durationMs:         Date.now() - t0,
    };
  }
}
