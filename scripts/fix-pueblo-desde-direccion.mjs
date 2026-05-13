#!/usr/bin/env node
/**
 * fix-pueblo-desde-direccion.mjs
 * Extrae el municipio (pueblo) desde la dirección para:
 *   Caso A: registros sin pueblo pero con dirección
 *   Caso B: registros donde pueblo=ciudad (se copio antes en bloque)
 *
 * Uso:
 *   node scripts/fix-pueblo-desde-direccion.mjs          → diagnóstico (sin cambios)
 *   node scripts/fix-pueblo-desde-direccion.mjs --fix    → aplica cambios
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Leer DATABASE_URL del .env
function loadEnv() {
  try {
    const env = readFileSync(join(rootDir, '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  } catch { /* .env no encontrado */ }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no configurado');
  process.exit(1);
}

const FIX_MODE = process.argv.includes('--fix');

// Provincias canadienses a ignorar
const PROVINCES = new Set([
  'ON','QC','BC','AB','MB','SK','NS','NB','NL','PE','NT','NU','YT',
  'ONTARIO','QUEBEC','BRITISH COLUMBIA','ALBERTA','MANITOBA',
  'SASKATCHEWAN','NOVA SCOTIA','NEW BRUNSWICK','NEWFOUNDLAND',
  'PRINCE EDWARD ISLAND','NORTHWEST TERRITORIES','NUNAVUT','YUKON',
]);

// Palabras clave a rechazar como municipio
const REJECT_PATTERNS = [
  /^canad[aáàâ]?$/i,                         // Canada / Canadá / Canada
  /^[A-Z]{0,3}\s*[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, // código postal: H3N1S2, QC H3N 1S2
  /^[A-Z0-9]{4}\+[A-Z0-9]{2,}/,              // Plus Code: G62C+XH
  /^\d+$/,                                    // solo números
  /^RR\s*\d+/i,                               // Rural Route
  /^LOT\s*\d+/i,                              // Lote
  /^(Chem|Ch)\.\s/i,                          // Chemins (rutas Quebec)
  /^(PO Box|CP|Boite)/i,                      // apartado de correos
  /^(Suite|Ste|Apt|Unit|Bldg)\s*\d+/i,        // unidades de edificio
  /^\d+\s+(St|Ave|Blvd|Dr|Rd|Hwy|Rue|Boul)/i, // número + calle
  /^[A-Z]{2}\s+[A-Z]\d[A-Z]/i,               // "QC H3N..." provincia+postal juntos
  /[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,             // cualquier string que TERMINA en postal
  /Ã/,                                        // encoding roto (latin1 en UTF-8)
];

function extractMunicipio(direccion) {
  if (!direccion || direccion.trim() === '') return null;
  const parts = direccion.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  // Iterar de atrás hacia adelante buscando el municipio
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    // Saltar si es provincia conocida
    if (PROVINCES.has(part.toUpperCase())) continue;
    // Saltar si coincide con patrones de rechazo
    if (REJECT_PATTERNS.some(re => re.test(part))) continue;
    // Saltar si muy corto
    if (part.length < 3) continue;
    // Saltar si contiene números mezclados con texto de calle
    if (/^\d/.test(part) && /[A-Za-z]/.test(part) && part.includes(' ')) {
      // podría ser "123 Main" — saltar
      continue;
    }
    return part;
  }
  return null;
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  for (const table of ['ontario_companies', 'quebec_companies']) {
    console.log(`\n═══ ${table.toUpperCase()} ═══`);

    // --- Caso A: pueblo NULL o vacío con dirección ---
    const casoA = await pool.query(`
      SELECT id, nombre, ciudad, pueblo, direccion
      FROM ${table}
      WHERE (pueblo IS NULL OR TRIM(pueblo) = '')
        AND direccion IS NOT NULL AND TRIM(direccion) != ''
      ORDER BY id
      LIMIT 5000
    `);

    let fixedA = 0, skippedA = 0;
    const updatesA = [];

    for (const row of casoA.rows) {
      const extracted = extractMunicipio(row.direccion);
      if (!extracted) { skippedA++; continue; }
      // No asignar si es igual a la ciudad
      if (extracted.toLowerCase() === (row.ciudad || '').toLowerCase()) { skippedA++; continue; }
      updatesA.push({ id: row.id, pueblo: extracted, nombre: row.nombre });
      fixedA++;
    }

    console.log(`Caso A (sin pueblo): ${casoA.rows.length} candidatos → ${fixedA} a actualizar, ${skippedA} sin municipio válido`);
    if (updatesA.length > 0) {
      console.log('  Ejemplos:', updatesA.slice(0, 5).map(u => `"${u.pueblo}" ← ${u.nombre}`).join('\n           '));
    }

    // --- Caso B: pueblo = ciudad con dirección más específica ---
    const casoB = await pool.query(`
      SELECT id, nombre, ciudad, pueblo, direccion
      FROM ${table}
      WHERE pueblo IS NOT NULL AND ciudad IS NOT NULL
        AND LOWER(TRIM(pueblo)) = LOWER(TRIM(ciudad))
        AND direccion IS NOT NULL AND TRIM(direccion) != ''
      ORDER BY id
      LIMIT 5000
    `);

    let fixedB = 0, skippedB = 0;
    const updatesB = [];

    for (const row of casoB.rows) {
      const extracted = extractMunicipio(row.direccion);
      if (!extracted) { skippedB++; continue; }
      if (extracted.toLowerCase() === (row.pueblo || '').toLowerCase()) { skippedB++; continue; }
      updatesB.push({ id: row.id, pueblo: extracted, old: row.pueblo, nombre: row.nombre });
      fixedB++;
    }

    console.log(`Caso B (pueblo=ciudad): ${casoB.rows.length} candidatos → ${fixedB} a actualizar, ${skippedB} sin cambio`);
    if (updatesB.length > 0) {
      console.log('  Ejemplos:', updatesB.slice(0, 5).map(u => `"${u.old}" → "${u.pueblo}" (${u.nombre})`).join('\n           '));
    }

    if (FIX_MODE) {
      let applied = 0;
      for (const u of [...updatesA, ...updatesB]) {
        await pool.query(
          `UPDATE ${table} SET pueblo = $1, updated_at = NOW() WHERE id = $2`,
          [u.pueblo, u.id]
        );
        applied++;
      }
      console.log(`  ✓ ${applied} registros actualizados en ${table}`);
    }
  }

  await pool.end();

  if (!FIX_MODE) {
    console.log('\n─── Modo diagnóstico. Para aplicar cambios: node scripts/fix-pueblo-desde-direccion.mjs --fix ───');
  } else {
    console.log('\n✓ Corrección completada.');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
