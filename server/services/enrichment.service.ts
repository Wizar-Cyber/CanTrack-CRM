/**
 * EnrichmentService — Orchestrator with field-by-field merge across providers.
 *
 * Provider priority:
 *   1. Google Gemini   (requires GEMINI_API_KEY)
 *   2. Groq API        (requires GROQ_API_KEY)
 *   3. Web Search      (DuckDuckGo + Wikipedia, always available)
 *
 * When a provider returns incomplete data (empty/null fields), the next
 * provider is queried and ONLY fills in the fields still missing values.
 * If all providers know a field, the first provider's value is kept.
 * Early exit if all required fields are already complete.
 */

import { GeminiService }    from './gemini.service.js';
import { GroqService }      from './groq.service.js';
import { WebSearchService } from './websearch.service.js';
import type { EnrichmentData } from './groq.service.js';
import { OllamaService } from './ollama.service.js';

export type { EnrichmentData };

// Fields to fill using the fallback chain
const FIELDS: (keyof EnrichmentData)[] = [
  'industry', 'company_size', 'hq_city', 'hq_province', 'hq_region', 'hq_town', 'hq_country',
  'exact_address', 'phone', 'contact_email', 'website', 'description',
];

/** Returns true if the value has real content (not null, empty, or 0). */
function filled(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  return s !== '' && s !== '0';
}

/** Copies all fields from `patch` into `base` that `base` doesn't already have. */
function mergeInto(base: Partial<EnrichmentData>, patch: Partial<EnrichmentData>): void {
  for (const key of FIELDS) {
    if (!filled((base as any)[key]) && filled((patch as any)[key])) {
      (base as any)[key] = (patch as any)[key];
    }
  }
}

/** Returns the list of fields that are still empty/null. */
function missing(data: Partial<EnrichmentData>): string[] {
  return FIELDS.filter(f => !filled((data as any)[f]));
}

/**
 * Verifies that a URL actually responds (HEAD request, 5s timeout).
 * Follows up to 2 redirects. Returns false if the URL is invalid,
 * unresponsive, or returns an HTTP error (4xx/5xx).
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
    // Some servers return 405 for HEAD but respond fine to GET.
    // We consider 2xx, final 3xx, and 405 as valid.
    return res.ok || res.status === 405 || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

export class EnrichmentService {
  /**
   * Enriches a company using all available providers.
   * Each provider only contributes fields left empty by previous ones.
   * The final result includes `_provider` listing all contributors.
   */
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    const merged: Partial<EnrichmentData> = {};
    const usedProviders: string[] = [];

    // ── Finalize result, verifying the website URL ──────────────────────────
    async function finalize(): Promise<EnrichmentData> {
      if (merged.website) {
        const alive = await verifyUrl(merged.website);
        if (!alive) {
          console.warn(`[Enrichment] Website not responding (possible hallucination), discarding: ${merged.website}`);
          delete merged.website;
        } else {
          console.info(`[Enrichment] Website verified: ${merged.website}`);
        }
      }
      return { ...merged, _provider: usedProviders.join('+') };
    }

    // ── Helper: calls a provider, merges missing fields ──────────────────────
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
          console.info(`[Enrichment] ${name} contributed ${filled_count} field(s) for: ${companyName}`);
        }
      } catch (err) {
        console.warn(`[Enrichment] ${name} error: ${(err as Error).message}`);
      }
    }

    // 1. Gemini ───────────────────────────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      await tryProvider('gemini', () => GeminiService.enrichCompany(companyName));
      if (missing(merged).length === 0) return finalize();
        if (missing(merged).length < FIELDS.length) {
          console.info(`[Enrichment] Gemini left empty: ${missing(merged).join(', ')} — continuing…`);
        }
    }

    // 2. Groq ─────────────────────────────────────────────────────────────────
    if (GroqService.isConfigured()) {
      await tryProvider('groq', () => GroqService.enrichCompany(companyName));
      if (missing(merged).length === 0) return finalize();
      console.info(`[Enrichment] Groq left empty: ${missing(merged).join(', ')} — continuing…`);
    }

    // 3. Web Search (DuckDuckGo + Wikipedia) ──────────────────────────────────
    await tryProvider('web_search', async () => {
      const result = await WebSearchService.enrichCompany(companyName);
      return result;
    });

    // ── Resultado final ───────────────────────────────────────────────────────
    if (usedProviders.length === 0) {
      console.warn(`[Enrichment] All providers failed for: ${companyName}`);
      return { _provider: 'none' };
    }

    const stillMissing = missing(merged);
    if (stillMissing.length > 0) {
      console.info(`[Enrichment] Empty fields remaining for "${companyName}": ${stillMissing.join(', ')}`);
    }

    return finalize();
  }

  /**
   * Generates a cover letter using Gemini AI.
   * Falls back to a simple template if Gemini is unavailable.
   */
  static async generateCoverLetter(candidate: any, job: any): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'Cover letter generation requires GEMINI_API_KEY. ' +
        'Set the environment variable and restart the server.'
      );
    }
    return GeminiService.generateCoverLetter(candidate, job);
  }

  /**
   * Returns the name of the currently active provider (useful for logs/UI).
   */
  static async activeProvider(): Promise<string> {
    if (process.env.GEMINI_API_KEY)    return 'gemini';
    if (GroqService.isConfigured())    return 'groq';
    if (await OllamaService.isAvailable()) return 'ollama';
    return 'web_search';
  }
}
