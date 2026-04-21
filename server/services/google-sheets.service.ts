/**
 * Google Sheets Service
 * 
 * Integración con Google Sheets API v4 para:
 * - Leer datos existentes
 * - Validar duplicados en memoria
 * - Insertar nuevos registros en batch
 * - Mantener estructura intacta
 */

import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { normalizeString, createCompanyKey, assessDuplication, extractTokens } from '../utils/normalization.js';

const SHEET_ID = '1641BkXjvd7yBSnYFuHuGZnJ5OfJ-A7xq';
const SHEET_NAME = 'Companies'; // Cambiar según sea necesario

interface CompanyRecord {
  [key: string]: any;
  name?: string;
  city?: string;
  address?: string;
}

interface ImportResult {
  total: number;
  inserted: number;
  duplicates: Array<{ name: string; reason: string; matchedRow?: number }>;
  possibleDuplicates: Array<{ name: string; confidence: string; matchedRow?: number }>;
  errors: Array<{ name: string; error: string }>;
  stats: {
    processedTime: number;
    deduplicationTime: number;
    insertionTime: number;
  };
}

export class GoogleSheetsService {
  private static sheets: sheets_v4.Sheets | null = null;
  private static authClient: JWT | null = null;

  /**
   * Inicializa el cliente de Google Sheets con credenciales de service account
   */
  static async initialize(serviceAccountKey: Record<string, any>): Promise<void> {
    try {
      this.authClient = new JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
        ],
      });

      this.sheets = google.sheets({
        version: 'v4',
        auth: this.authClient,
      });

      console.log('[GoogleSheets] ✅ Autenticación exitosa');
    } catch (error) {
      console.error('[GoogleSheets] ❌ Error de autenticación:', error);
      throw error;
    }
  }

  /**
   * Lee todos los registros de la hoja
   * Retorna array de objetos con headers como keys
   */
  static async getAllRecords(): Promise<CompanyRecord[]> {
    if (!this.sheets) throw new Error('GoogleSheets no inicializado');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:Z`,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return [];

      const headers = rows[0].map(h => String(h).trim());
      const records: CompanyRecord[] = [];

      // Convertir filas en objetos
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const record: CompanyRecord = {};
        
        for (let j = 0; j < headers.length; j++) {
          record[headers[j]] = row[j] ?? null;
        }
        
        records.push(record);
      }

      console.log(`[GoogleSheets] ✅ Leídos ${records.length} registros`);
      return records;
    } catch (error) {
      console.error('[GoogleSheets] ❌ Error leyendo datos:', error);
      throw error;
    }
  }

  /**
   * Construye índices en memoria para O(1) lookup
   * Estrategia: crear múltiples índices por diferentes campos
   */
  static buildIndices(
    records: CompanyRecord[],
  ): {
    byExactName: Map<string, CompanyRecord & { rowNumber: number }>;
    byNormalizedName: Map<string, CompanyRecord & { rowNumber: number }>;
    byKey: Map<string, CompanyRecord & { rowNumber: number }>;
    allRecords: Array<CompanyRecord & { rowNumber: number }>;
  } {
    const byExactName = new Map();
    const byNormalizedName = new Map();
    const byKey = new Map();
    const allRecords: Array<CompanyRecord & { rowNumber: number }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = { ...records[i], rowNumber: i + 2 }; // +2 porque fila 1 es header, indexing comienza en 1
      allRecords.push(record);

      const name = record.name?.toString() || '';
      if (name) {
        byExactName.set(name, record);
        byNormalizedName.set(normalizeString(name), record);

        const key = createCompanyKey(name, record.city?.toString());
        byKey.set(key, record);
      }
    }

    console.log(`[GoogleSheets] ✅ Índices construidos (${records.length} registros indexados)`);
    return { byExactName, byNormalizedName, byKey, allRecords };
  }

  /**
   * Valida un nuevo registro contra los existentes
   */
  static validateCompany(
    newCompany: CompanyRecord,
    indices: ReturnType<typeof GoogleSheetsService.buildIndices>,
  ): {
    status: 'new' | 'duplicate' | 'possible_duplicate';
    matchedRecord?: CompanyRecord & { rowNumber: number };
    reason?: string;
  } {
    const name = newCompany.name?.toString() || '';
    if (!name) {
      return { status: 'duplicate', reason: 'Nombre vacío' };
    }

    // Cheque exacto por nombre normalizado
    const normalizedName = normalizeString(name);
    if (indices.byNormalizedName.has(normalizedName)) {
      const matched = indices.byNormalizedName.get(normalizedName)!;
      return {
        status: 'duplicate',
        matchedRecord: matched,
        reason: `Match exacto normalizado con fila ${matched.rowNumber}`,
      };
    }

    // Cheque fuzzy contra todos los registros
    let bestMatch: { record: CompanyRecord & { rowNumber: number }; confidence: string } | null = null;

    for (const existingRecord of indices.allRecords) {
      const assessment = assessDuplication(
        {
          name: newCompany.name?.toString() || '',
          city: newCompany.city?.toString() || '',
          address: newCompany.address?.toString() || '',
        },
        {
          name: existingRecord.name?.toString() || '',
          city: existingRecord.city?.toString() || '',
          address: existingRecord.address?.toString() || '',
        },
      );

      if (assessment === 'exact' || assessment === 'fuzzy') {
        return {
          status: 'duplicate',
          matchedRecord: existingRecord,
          reason: `Match fuzzy (${assessment}) con fila ${existingRecord.rowNumber}`,
        };
      }

      if (assessment === 'possible') {
        if (!bestMatch || assessment === 'possible') {
          bestMatch = { record: existingRecord, confidence: assessment };
        }
      }
    }

    if (bestMatch) {
      return {
        status: 'possible_duplicate',
        matchedRecord: bestMatch.record,
        reason: `Posible duplicado (${bestMatch.confidence}) con fila ${bestMatch.record.rowNumber}`,
      };
    }

    return { status: 'new' };
  }

  /**
   * Inserta nuevos registros en batch
   * Respeta orden de columnas y estructura existente
   */
  static async batchInsertRecords(
    headers: string[],
    newRecords: CompanyRecord[],
  ): Promise<void> {
    if (!this.sheets || newRecords.length === 0) return;

    try {
      // Preparar valores en orden de headers
      const values = newRecords.map(record => {
        return headers.map(header => record[header] ?? '');
      });

      // Obtener siguiente fila disponible
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:A`,
      });

      const nextRow = (response.data.values?.length || 0) + 1;

      // Insertar en batch
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          data: [
            {
              range: `${SHEET_NAME}!A${nextRow}`,
              values,
            },
          ],
          valueInputOption: 'RAW',
        },
      });

      console.log(`[GoogleSheets] ✅ ${newRecords.length} registros insertados a partir de fila ${nextRow}`);
    } catch (error) {
      console.error('[GoogleSheets] ❌ Error insertando registros:', error);
      throw error;
    }
  }

  /**
   * Obtiene headers de la hoja
   */
  static async getHeaders(): Promise<string[]> {
    if (!this.sheets) throw new Error('GoogleSheets no inicializado');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:Z1`,
      });

      const headers = (response.data.values?.[0] || []).map(h => String(h).trim());
      return headers;
    } catch (error) {
      console.error('[GoogleSheets] ❌ Error obteniendo headers:', error);
      throw error;
    }
  }

  /**
   * Proceso completo de importación
   */
  static async importCompanies(
    newCompanies: CompanyRecord[],
    options?: { autoInsert?: boolean; markPossibleDuplicates?: boolean },
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const result: ImportResult = {
      total: newCompanies.length,
      inserted: 0,
      duplicates: [],
      possibleDuplicates: [],
      errors: [],
      stats: {
        processedTime: 0,
        deduplicationTime: 0,
        insertionTime: 0,
      },
    };

    try {
      // Paso 1: Leer registros existentes
      console.log('[Import] 📖 Leyendo registros existentes...');
      const existingRecords = await this.getAllRecords();
      const headers = await this.getHeaders();

      // Paso 2: Construir índices
      const dedupStartTime = Date.now();
      const indices = this.buildIndices(existingRecords);
      result.stats.deduplicationTime = Date.now() - dedupStartTime;

      // Paso 3: Validar cada nuevo registro
      const recordsToInsert: CompanyRecord[] = [];

      for (const newCompany of newCompanies) {
        try {
          const validation = this.validateCompany(newCompany, indices);

          if (validation.status === 'duplicate') {
            result.duplicates.push({
              name: newCompany.name?.toString() || 'Sin nombre',
              reason: validation.reason || 'Duplicado',
              matchedRow: validation.matchedRecord?.rowNumber,
            });
          } else if (validation.status === 'possible_duplicate') {
            result.possibleDuplicates.push({
              name: newCompany.name?.toString() || 'Sin nombre',
              confidence: validation.reason || 'Posible duplicado',
              matchedRow: validation.matchedRecord?.rowNumber,
            });

            // Insertar si está habilitado auto-insert
            if (options?.autoInsert) {
              recordsToInsert.push(newCompany);
            }
          } else {
            // Status === 'new'
            recordsToInsert.push(newCompany);
          }
        } catch (err) {
          result.errors.push({
            name: newCompany.name?.toString() || 'Sin nombre',
            error: (err as Error).message,
          });
        }
      }

      // Paso 4: Insertar registros nuevos en batch
      if (recordsToInsert.length > 0) {
        const insertStartTime = Date.now();
        await this.batchInsertRecords(headers, recordsToInsert);
        result.stats.insertionTime = Date.now() - insertStartTime;
        result.inserted = recordsToInsert.length;
      }

      result.stats.processedTime = Date.now() - startTime;

      console.log(`[Import] ✅ Importación completada:`);
      console.log(`   - Insertados: ${result.inserted}`);
      console.log(`   - Duplicados: ${result.duplicates.length}`);
      console.log(`   - Posibles duplicados: ${result.possibleDuplicates.length}`);
      console.log(`   - Errores: ${result.errors.length}`);
      console.log(`   - Tiempo total: ${result.stats.processedTime}ms`);

      return result;
    } catch (error) {
      console.error('[Import] ❌ Error en importación:', error);
      throw error;
    }
  }
}
