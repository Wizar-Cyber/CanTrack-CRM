-- ═══════════════════════════════════════════════════════════════════════
-- Migration 004: Normalizar direcciones (ciudad, pueblo, region, provincia)
-- Elimina tildes, estandariza mayúsculas/minúsculas, limpia duplicados
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Función de normalización reutilizable ───────────────────────────
CREATE OR REPLACE FUNCTION normalize_location_name(val TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF val IS NULL OR TRIM(val) = '' OR TRIM(val) = 'null' OR TRIM(val) = E'\u2014' OR TRIM(val) = '-' THEN
    RETURN NULL;
  END IF;

  normalized := TRIM(val);

  -- Quitar caracteres no imprimibles y normalizar espacios
  normalized := regexp_replace(normalized, '[[:cntrl:]]', '', 'g');
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');

  -- Reemplazar caracteres acentuados comunes
  normalized := REPLACE(normalized, 'Á', 'A');
  normalized := REPLACE(normalized, 'É', 'E');
  normalized := REPLACE(normalized, 'Í', 'I');
  normalized := REPLACE(normalized, 'Ó', 'O');
  normalized := REPLACE(normalized, 'Ú', 'U');
  normalized := REPLACE(normalized, 'Ü', 'U');
  normalized := REPLACE(normalized, 'á', 'a');
  normalized := REPLACE(normalized, 'é', 'e');
  normalized := REPLACE(normalized, 'í', 'i');
  normalized := REPLACE(normalized, 'ó', 'o');
  normalized := REPLACE(normalized, 'ú', 'u');
  normalized := REPLACE(normalized, 'ü', 'u');
  normalized := REPLACE(normalized, 'Ñ', 'N');
  normalized := REPLACE(normalized, 'ñ', 'n');
  normalized := REPLACE(normalized, 'Ç', 'C');
  normalized := REPLACE(normalized, 'ç', 'c');
  normalized := REPLACE(normalized, 'È', 'E');
  normalized := REPLACE(normalized, 'è', 'e');
  normalized := REPLACE(normalized, 'À', 'A');
  normalized := REPLACE(normalized, 'à', 'a');
  normalized := REPLACE(normalized, 'Â', 'A');
  normalized := REPLACE(normalized, 'â', 'a');
  normalized := REPLACE(normalized, 'Ê', 'E');
  normalized := REPLACE(normalized, 'ê', 'e');
  normalized := REPLACE(normalized, 'Ë', 'E');
  normalized := REPLACE(normalized, 'ë', 'e');
  normalized := REPLACE(normalized, 'Î', 'I');
  normalized := REPLACE(normalized, 'î', 'i');
  normalized := REPLACE(normalized, 'Ï', 'I');
  normalized := REPLACE(normalized, 'ï', 'i');
  normalized := REPLACE(normalized, 'Ô', 'O');
  normalized := REPLACE(normalized, 'ô', 'o');
  normalized := REPLACE(normalized, 'Ù', 'U');
  normalized := REPLACE(normalized, 'ù', 'u');
  normalized := REPLACE(normalized, 'Û', 'U');
  normalized := REPLACE(normalized, 'û', 'u');
  normalized := REPLACE(normalized, 'Œ', 'OE');
  normalized := REPLACE(normalized, 'œ', 'oe');
  normalized := REPLACE(normalized, 'Æ', 'AE');
  normalized := REPLACE(normalized, 'æ', 'ae');

  -- Reemplazar apóstrofes y comillas por apóstrofe recto
  normalized := REPLACE(normalized, '''', '''');
  normalized := REPLACE(normalized, '`', '''');

  -- Quitar espacios alrededor de apóstrofe
  normalized := regexp_replace(normalized, E'\\s+''\\s+', '''', 'g');

  -- Reemplazar guiones especiales
  normalized := REPLACE(normalized, '–', '-');
  normalized := REPLACE(normalized, '—', '-');

  -- Limpiar comas y puntos sobrantes al final
  normalized := regexp_replace(normalized, '[,.\s]+$', '');

  -- Quitar contenidos entre parentesis al final (ej: "Montreal (distrito)")
  normalized := regexp_replace(normalized, E'\\s*\\(.*?\\)\\s*$', '');

  -- Quitar asteriscos y marcas
  normalized := REPLACE(normalized, '*', '');
  normalized := REPLACE(normalized, '?', '');

  -- Capitalizar: primera letra de cada palabra en mayuscula
  normalized := initcap(normalized);

  -- Arreglar comunes: "St" -> "St." (abreviatura de Saint)
  normalized := regexp_replace(normalized, E'\\mSt\\b', 'St.', 'g');

  -- Limpiar espacios multiples finales
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  normalized := TRIM(normalized);

  IF normalized = '' OR LENGTH(normalized) < 2 THEN
    RETURN NULL;
  END IF;

  RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 2. Normalizar ciudad ────────────────────────────────────────────────
UPDATE ontario_companies SET ciudad = normalize_location_name(ciudad)
WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '' AND TRIM(ciudad) <> 'null';

UPDATE quebec_companies SET ciudad = normalize_location_name(ciudad)
WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '' AND TRIM(ciudad) <> 'null';

-- ── 3. Normalizar pueblo ────────────────────────────────────────────────
UPDATE ontario_companies SET pueblo = normalize_location_name(pueblo)
WHERE pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null';

UPDATE quebec_companies SET pueblo = normalize_location_name(pueblo)
WHERE pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null';

-- ── 4. Normalizar region ────────────────────────────────────────────────
UPDATE ontario_companies SET region = normalize_location_name(region)
WHERE region IS NOT NULL AND TRIM(region) <> '' AND TRIM(region) <> 'null';

UPDATE quebec_companies SET region = normalize_location_name(region)
WHERE region IS NOT NULL AND TRIM(region) <> '' AND TRIM(region) <> 'null';

-- ── 5. Limpiar datos basura conocidos en ciudad ─────────────────────────
UPDATE ontario_companies SET ciudad = NULL
WHERE ciudad IS NOT NULL AND (
  LOWER(ciudad) IN ('(Falta Ciudad)**', '(No Especificado)', '(No Especificado)', 'Desconocido', 'Incompleta', 'Desconocida')
  OR ciudad ~ '^\d'
  OR LENGTH(ciudad) <= 2
);

UPDATE quebec_companies SET ciudad = NULL
WHERE ciudad IS NOT NULL AND (
  LOWER(ciudad) IN ('(Desconocida)', '(Desconocido)', 'Desconocida', 'Desconocido', 'Incompleta')
  OR ciudad ~ '^\d'
  OR LENGTH(ciudad) <= 2
);

-- ── 6. Limpiar datos basura conocidos en pueblo ─────────────────────────
UPDATE ontario_companies SET pueblo = NULL
WHERE pueblo IS NOT NULL AND (
  pueblo ~ '^#' OR pueblo ~ '^\d'
  OR LENGTH(TRIM(pueblo)) <= 2
  OR LOWER(pueblo) IN ('-', 'Desconocido')
);

UPDATE quebec_companies SET pueblo = NULL
WHERE pueblo IS NOT NULL AND (
  pueblo ~ '^#' OR pueblo ~ '^\d'
  OR LENGTH(TRIM(pueblo)) <= 2
  OR LOWER(pueblo) IN ('-', 'Desconocido', 'Desconocida')
  OR LOWER(ciudad) LIKE '%calle%' OR LOWER(ciudad) LIKE '%street%'
  OR LOWER(ciudad) LIKE '%avenue%' OR LOWER(ciudad) LIKE '%drive%'
  OR LOWER(ciudad) LIKE '%road%' OR LOWER(ciudad) LIKE '%route%'
  OR LOWER(ciudad) LIKE '%boulevard%' OR LOWER(ciudad) LIKE '%promenade%'
  OR LOWER(ciudad) LIKE '%rue%' OR LOWER(ciudad) LIKE '%chemin%'
);

-- ── 7. Corregir ciudad "Ottawa-Rideau" a "Ottawa" ──────────────────────
UPDATE ontario_companies SET ciudad = 'Ottawa'
WHERE ciudad = 'Ottawa-Rideau';

-- ── 8. Corregir provincia ───────────────────────────────────────────────
UPDATE ontario_companies SET provincia = 'Ontario'
WHERE provincia IS NOT NULL AND TRIM(provincia) <> '' AND TRIM(provincia) <> 'null'
  AND LOWER(REPLACE(TRIM(provincia), 'é', 'e')) IN ('on', 'ont', 'ontario', 'ont.');

UPDATE quebec_companies SET provincia = 'Quebec'
WHERE provincia IS NOT NULL AND TRIM(provincia) <> '' AND TRIM(provincia) <> 'null'
  AND LOWER(REPLACE(REPLACE(TRIM(provincia), 'é', 'e'), 'è', 'e')) IN ('qc', 'quebec', 'québec', 'queb.');

-- Casos restantes en provincia que no son Ontario/Quebec estandarizar
UPDATE ontario_companies SET provincia = 'Ontario'
WHERE provincia IS NOT NULL AND TRIM(provincia) <> '' AND TRIM(provincia) <> 'null'
  AND provincia NOT IN ('Ontario', 'Quebec', 'QC')
  AND LOWER(TRIM(provincia)) NOT LIKE '%ontar%';

UPDATE quebec_companies SET provincia = 'Quebec'
WHERE provincia IS NOT NULL AND TRIM(provincia) <> '' AND TRIM(provincia) <> 'null'
  AND provincia NOT IN ('Quebec', 'Québec', 'QC')
  AND LOWER(TRIM(provincia)) NOT LIKE '%quebec%' AND LOWER(TRIM(provincia)) NOT LIKE '%québec%';

SELECT 'Normalizacion completada.' AS result;
