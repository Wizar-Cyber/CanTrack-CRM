/**
 * Normalización de textos para deduplicación
 * Convierte strings a una forma canónica para comparación
 */

/**
 * Normaliza un string: minúsculas, elimina tildes, espacios extras, caracteres especiales
 */
export function normalizeString(text: string | null | undefined): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Elimina marcas diacríticas
    .replace(/[^\w\s]/g, '') // Elimina caracteres especiales (excepto letras, números, espacios)
    .trim()
    .replace(/\s+/g, ' '); // Convierte espacios múltiples en uno solo
}

/**
 * Crea un slug único para la empresa (para índices rápidos)
 */
export function createCompanyKey(name: string, city?: string): string {
  const normalizedName = normalizeString(name);
  const normalizedCity = city ? normalizeString(city) : '';
  
  return normalizedCity 
    ? `${normalizedName}|${normalizedCity}`
    : normalizedName;
}

/**
 * Calcula similaridad simple entre dos strings (Levenshtein-like)
 * Retorna 0-1 donde 1 es match exacto
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  // Exacto
  if (norm1 === norm2) return 1;
  
  // Contención (uno contiene al otro)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = Math.min(norm1.length, norm2.length);
    const longer = Math.max(norm1.length, norm2.length);
    return shorter / longer;
  }
  
  // Distancia Levenshtein básica
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 1;
  
  let distance = 0;
  const minLen = Math.min(norm1.length, norm2.length);
  
  for (let i = 0; i < minLen; i++) {
    if (norm1[i] !== norm2[i]) distance++;
  }
  distance += Math.abs(norm1.length - norm2.length);
  
  return 1 - distance / maxLen;
}

/**
 * Extrae palabras clave principales (tokens)
 * Útil para matching fuzzy
 */
export function extractTokens(text: string): Set<string> {
  const normalized = normalizeString(text);
  const words = normalized.split(/\s+/).filter(w => w.length > 2); // Solo palabras > 2 chars
  return new Set(words);
}

/**
 * Valida si dos empresas probablemente son la misma
 * Retorna:
 *  - 'exact': match exacto
 *  - 'fuzzy': match fuzzy con alta confianza
 *  - 'possible': posible duplicado (requiere revisión manual)
 *  - 'different': probablemente diferentes
 */
export function assessDuplication(
  company1: { name: string; city?: string; address?: string },
  company2: { name: string; city?: string; address?: string },
): 'exact' | 'fuzzy' | 'possible' | 'different' {
  
  const nameMatch = calculateSimilarity(company1.name, company2.name);
  
  // Exacto en nombre
  if (nameMatch === 1) return 'exact';
  
  // Muy similar (>85%)
  if (nameMatch > 0.85) return 'fuzzy';
  
  // Si coinciden nombre + ciudad (>70% similaridad en nombre)
  if (company1.city && company2.city && nameMatch > 0.7) {
    const cityMatch = calculateSimilarity(company1.city, company2.city);
    if (cityMatch > 0.8) return 'fuzzy';
  }
  
  // Si coinciden nombre + dirección
  if (company1.address && company2.address && nameMatch > 0.6) {
    const addressMatch = calculateSimilarity(company1.address, company2.address);
    if (addressMatch > 0.7) return 'possible';
  }
  
  // Tokens comunes (palabras significativas que aparecen en ambos)
  if (nameMatch > 0.6) {
    const tokens1 = extractTokens(company1.name);
    const tokens2 = extractTokens(company2.name);
    const commonTokens = [...tokens1].filter(t => tokens2.has(t));
    
    if (commonTokens.length >= 2) return 'possible'; // 2+ palabras iguales
  }
  
  return 'different';
}

/**
 * Tipo para resultado de deduplicación
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  confidence: 'exact' | 'fuzzy' | 'possible' | 'different';
  matchedRecord?: Record<string, any>;
  reason?: string;
}
