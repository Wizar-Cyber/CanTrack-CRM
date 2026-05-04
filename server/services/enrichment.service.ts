/**
 * EnrichmentService — Orquestador con merge campo-por-campo entre proveedores.
 *
 * Orden de preferencia:
 *   1. Groq API        (GROQ_API_KEY configurado)
 *   2. Google Gemini   (GEMINI_API_KEY configurado)
 *   3. Ollama local    (localhost:11434 responde)
 *   4. Web Search      (DuckDuckGo + Wikipedia, siempre disponible)
 *
 * Cuando un proveedor devuelve datos incompletos (campos vacíos/null), se
 * continúa con el siguiente proveedor y se rellena SOLO los campos que
 * siguen sin valor. Si todos conocen un campo, se queda el del primero.
 * Solo se para antes si todos los campos requeridos están completos.
 */

import { GeminiService }    from './gemini.service.js';
import { GroqService }      from './groq.service.js';
import { OllamaService }    from './ollama.service.js';
import { WebSearchService } from './websearch.service.js';
import { EnrichmentData }   from './groq.service.js';

export type { EnrichmentData };

// Campos que se intentan completar con la cadena de fallback
const FIELDS: (keyof EnrichmentData)[] = [
  'industry', 'company_size', 'hq_city', 'hq_province', 'hq_country',
  'exact_address', 'phone', 'contact_email', 'website', 'description',
];

/** Devuelve true si el valor tiene contenido real (no nulo, vacío ni 0). */
function filled(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  return s !== '' && s !== '0';
}

/** Copia hacia `base` todos los campos de `patch` que `base` aún no tiene. */
function mergeInto(base: Partial<EnrichmentData>, patch: Partial<EnrichmentData>): void {
  for (const key of FIELDS) {
    if (!filled((base as any)[key]) && filled((patch as any)[key])) {
      (base as any)[key] = (patch as any)[key];
    }
  }
}

/** Devuelve la lista de campos que aún están vacíos. */
function missing(data: Partial<EnrichmentData>): string[] {
  return FIELDS.filter(f => !filled((data as any)[f]));
}

/**
 * Verifica que una URL responde realmente (HEAD request, timeout 5 s).
 * Sigue hasta 2 redirecciones. Devuelve false si la URL es inválida,
 * no responde o devuelve un error HTTP (4xx/5xx).
 */
async function verifyUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CanTrackBot/1.0)' },
    });
    // Algunos servidores devuelven 405 para HEAD pero responden bien a GET.
    // Consideramos válidos 2xx, 3xx finales y 405.
    return res.ok || res.status === 405 || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

export class EnrichmentService {
  /**
   * Enriquece una empresa usando todos los proveedores disponibles.
   * Cada proveedor solo aporta los campos que los anteriores dejaron vacíos.
   * El resultado final incluye `_provider` con todos los que contribuyeron.
   */
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    const merged: Partial<EnrichmentData> = {};
    const usedProviders: string[] = [];

    // ── Devuelve el resultado final verificando el website ───────────────────
    async function finalize(): Promise<EnrichmentData> {
      if (merged.website) {
        const alive = await verifyUrl(merged.website);
        if (!alive) {
          console.warn(`[Enrichment] Website no responde (posible alucinación), descartado: ${merged.website}`);
          delete merged.website;
        } else {
          console.info(`[Enrichment] Website verificado: ${merged.website}`);
        }
      }
      return { ...merged, _provider: usedProviders.join('+') };
    }

    // ── Helper: llama a un proveedor, mergea campos faltantes ────────────────
    async function tryProvider(
      name: string,
      call: () => Promise<Partial<EnrichmentData>>,
    ): Promise<void> {
      const before = missing(merged).length;
      try {
        const result = await call();
        mergeInto(merged, result);
        const filled_count = before - missing(merged).length;
        if (filled_count > 0) {
          usedProviders.push(name);
          console.info(`[Enrichment] ${name} aportó ${filled_count} campo(s) para: ${companyName}`);
        }
      } catch (err) {
        console.warn(`[Enrichment] ${name} error: ${(err as Error).message}`);
      }
    }

    // 1. Groq ─────────────────────────────────────────────────────────────────
    if (GroqService.isConfigured()) {
      await tryProvider('groq', () => GroqService.enrichCompany(companyName));
      if (missing(merged).length === 0) return finalize();
      console.info(`[Enrichment] Groq dejó vacíos: ${missing(merged).join(', ')} — continuando…`);
    }

    // 2. Gemini ───────────────────────────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      await tryProvider('gemini', () => GeminiService.enrichCompany(companyName));
      if (missing(merged).length === 0) return finalize();
      if (missing(merged).length < FIELDS.length) {
        console.info(`[Enrichment] Gemini dejó vacíos: ${missing(merged).join(', ')} — continuando…`);
      }
    }

    // 3. Ollama (local) ───────────────────────────────────────────────────────
    if (await OllamaService.isAvailable()) {
      await tryProvider('ollama', () => OllamaService.enrichCompany(companyName));
      if (missing(merged).length === 0) return finalize();
      if (missing(merged).length < FIELDS.length) {
        console.info(`[Enrichment] Ollama dejó vacíos: ${missing(merged).join(', ')} — continuando…`);
      }
    }

    // 4. Web Search (DuckDuckGo + Wikipedia) ──────────────────────────────────
    await tryProvider('web_search', async () => {
      const result = await WebSearchService.enrichCompany(companyName);
      return result;
    });

    // ── Resultado final ───────────────────────────────────────────────────────
    if (usedProviders.length === 0) {
      console.warn(`[Enrichment] Todos los proveedores fallaron para: ${companyName}`);
      return { _provider: 'none' };
    }

    const stillMissing = missing(merged);
    if (stillMissing.length > 0) {
      console.info(`[Enrichment] Campos que quedaron vacíos para "${companyName}": ${stillMissing.join(', ')}`);
    }

    return finalize();
  }

  /**
   * Genera una carta de presentación. Delega siempre a Gemini ya que
   * esta funcionalidad requiere generación de texto de calidad.
   * Si Gemini no está disponible lanza un error descriptivo.
   */
  static async generateCoverLetter(candidate: any, job: any): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'La generación de cartas de presentación requiere GEMINI_API_KEY. ' +
        'Configura la variable de entorno y reinicia el servidor.'
      );
    }
    return GeminiService.generateCoverLetter(candidate, job);
  }

  /**
   * Devuelve una descripción del proveedor activo (útil para logs/UI).
   */
  static async activeProvider(): Promise<string> {
    if (process.env.GEMINI_API_KEY)    return 'gemini';
    if (GroqService.isConfigured())    return 'groq';
    if (await OllamaService.isAvailable()) return 'ollama';
    return 'web_search';
  }
}
