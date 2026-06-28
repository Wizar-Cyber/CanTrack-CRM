import type { Pool } from 'pg';

let _exportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _exportRunning = false;

export async function flushToExcel(pool: Pool) {
  if (_exportRunning) {
    _exportDebounceTimer = setTimeout(() => flushToExcel(pool), 5000);
    return;
  }
  _exportRunning = true;
  const target = (process.env.EXPORT_TARGET || 'excel').toLowerCase();

  try {
    if (target === 'excel' || target === 'both') {
      const { runExport } = await import('../../scripts/export-to-excel.js')
        .catch(() => ({ runExport: null })) as any;
      if (runExport) {
        const r = await runExport({ limit: 2000, dryRun: false, pool });
        if (r.added > 0)
          console.log(`[AutoExport/Excel] ✅ +${r.added} nuevas · ${r.skipped} duplicadas · ${r.totalRowsInExcel} total`);
      }
    }

    if (target === 'sheets' || target === 'both') {
      const onId = process.env.ONTARIO_SHEETS_ID;
      const qcId = process.env.QUEBEC_SHEETS_ID;
      const creds = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
      if (!onId || !qcId || !creds) {
        console.warn('[AutoExport/Sheets] ONTARIO_SHEETS_ID o QUEBEC_SHEETS_ID o GOOGLE_SERVICE_ACCOUNT_CREDENTIALS no configurados — omitiendo.');
      } else {
        try {
          const { google } = await import('googleapis');
          const { JWT } = await import('google-auth-library');
          const credentials = JSON.parse(creds);
          const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });
          await auth.authorize();
          const sheets = google.sheets({ version: 'v4', auth });

          const today = new Date();
          const fecha = String(today.getDate()).padStart(2,'0')+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+today.getFullYear();

          for (const [table, sheetId, isOntario] of [['ontario_companies', onId, true], ['quebec_companies', qcId, false]] as const) {
            const { rows } = await pool.query(`
              SELECT id, nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina
              FROM ${table}
              WHERE sheets_exported_at IS NULL
                AND nombre IS NOT NULL AND correo IS NOT NULL AND correo != ''
              ORDER BY nombre ASC
              LIMIT 500
            `);
            if (rows.length === 0) continue;

            const values = rows.map((r: any) => {
              const prov = r.provincia ? (r.provincia.toLowerCase()==='on'||r.provincia.toLowerCase()==='ontario'?'Ontario':
                         r.provincia.toLowerCase()==='qc'||r.provincia.toLowerCase()==='quebec'||r.provincia.toLowerCase()==='québec'?'Quebec':r.provincia) : '';
              if (isOntario) {
                return [r.nombre, r.telefono||'', r.tipo||'', r.correo||'', r.direccion||'', prov, r.region||'', r.ciudad||'', r.pueblo||'', r.work||'', r.descripcion||'', r.dominio_de_pagina||''];
              } else {
                return [r.nombre, r.telefono||'', r.tipo||'', r.correo||'', fecha, r.direccion||'', prov, r.region||'', r.ciudad||'', r.pueblo||'', r.work||'', r.descripcion||'', r.dominio_de_pagina||''];
              }
            });

            await sheets.spreadsheets.values.append({
              spreadsheetId: sheetId,
              range: 'Hoja 1!A1',
              valueInputOption: 'USER_ENTERED',
              insertDataOption: 'INSERT_ROWS',
              requestBody: { values },
            });

            await pool.query(`UPDATE ${table} SET sheets_exported_at = NOW() WHERE id = ANY($1::uuid[])`, [rows.map((r: any) => r.id)]);
            console.log(`[AutoExport/Sheets] ✅ ${rows.length} empresas añadidas a ${isOntario ? 'Ontario' : 'Quebec'} sheet`);
          }
        } catch (err: any) {
          console.error('[AutoExport/Sheets] Error:', err.message);
        }
      }
    }
  } catch (err: any) {
    console.error('[AutoExport] Error:', err.message);
  } finally {
    _exportRunning = false;
  }
}

export function scheduleExcelExport(pool: Pool) {
  if (_exportDebounceTimer) clearTimeout(_exportDebounceTimer);
  _exportDebounceTimer = setTimeout(() => flushToExcel(pool), 10_000);
}

export function getExportRunning() {
  return _exportRunning;
}

export function isExportPending() {
  return _exportDebounceTimer !== null;
}

export function runFlushNow(pool: Pool) {
  if (_exportDebounceTimer) { clearTimeout(_exportDebounceTimer); _exportDebounceTimer = null; }
  flushToExcel(pool);
}
