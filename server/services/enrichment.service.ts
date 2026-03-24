/**
 * EnrichmentService — Orquestador con cadena de fallback automática.
 *
 * Orden de preferencia:
 *   1. Google Gemini   (GEMINI_API_KEY configurado)
 *   2. Groq API        (GROQ_API_KEY configurado)
 *   3. Ollama local    (localhost:11434 responde)
 *   4. Web Search      (DuckDuckGo + Wikipedia, siempre disponible)
 *
 * Si todos fallan devuelve { confidence_score: 0, _provider: 'none' }.
 *
 * También expone generateCoverLetter() delegando a Gemini para que
 * server.ts solo importe este servicio.
 */

import { GeminiService }    from './gemini.service.js';
import { GroqService }      from './groq.service.js';
import { OllamaService }    from './ollama.service.js';
import { WebSearchService } from './websearch.service.js';
import { EnrichmentData }   from './groq.service.js';

export type { EnrichmentData };     // re-exportar para que server.ts no cambie

export class EnrichmentService {
  /**
   * Enriquece una empresa probando cada proveedor en orden.
   * El resultado incluye el campo _provider para auditoría.
   */
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    // 1. Gemini ──────────────────────────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      try {
        const result = await GeminiService.enrichCompany(companyName);
        return { ...result, _provider: 'gemini' };
      } catch (err) {
        const msg = (err as Error).message ?? '';
        const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(msg);
        console.warn(`[Enrichment] Gemini ${isQuota ? 'quota agotada' : 'error'}: ${msg}`);
        if (!isQuota) {
          // Error no relacionado con cuota: podría ser un problema de red,
          // igual seguimos con el siguiente proveedor
        }
        // En cualquier caso, continuamos con Groq
      }
    }

    // 2. Groq ────────────────────────────────────────────────────────────────
    if (GroqService.isConfigured()) {
      try {
        const result = await GroqService.enrichCompany(companyName);
        return { ...result, _provider: 'groq' };
      } catch (err) {
        const msg = (err as Error).message ?? '';
        console.warn(`[Enrichment] Groq error: ${msg}`);
      }
    }

    // 3. Ollama (local) ──────────────────────────────────────────────────────
    if (await OllamaService.isAvailable()) {
      try {
        const result = await OllamaService.enrichCompany(companyName);
        return { ...result, _provider: 'ollama' };
      } catch (err) {
        const msg = (err as Error).message ?? '';
        console.warn(`[Enrichment] Ollama error: ${msg}`);
      }
    }

    // 4. Web Search (DuckDuckGo + Wikipedia) ─────────────────────────────────
    try {
      const result = await WebSearchService.enrichCompany(companyName);
      if (result.confidence_score && result.confidence_score > 5) {
        console.info(`[Enrichment] Usando web_search para: ${companyName}`);
        return result;
      }
    } catch (err) {
      console.warn(`[Enrichment] WebSearch error: ${(err as Error).message}`);
    }

    // ── Sin resultados ───────────────────────────────────────────────────────
    console.warn(`[Enrichment] Todos los proveedores fallaron para: ${companyName}`);
    return { confidence_score: 0, _provider: 'none' };
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
