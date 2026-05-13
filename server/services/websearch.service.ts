/**
 * WebSearchService — Basic enrichment without LLMs using:
 *   1. DuckDuckGo Instant Answer API (free, no API key)
 *   2. Wikipedia REST API (free, no API key)
 *
 * Provides less structured data than an LLM, but serves as a last resort
 * for obtaining descriptions, country, and URLs of known companies.
 *
 * No env vars required.
 */

import { EnrichmentData } from './groq.service.js';

interface DDGResult {
  Abstract?:       string;
  AbstractURL?:    string;
  AbstractSource?: string;
  Heading?:        string;
  Image?:          string;
  Type?:           string;
}

interface WikiSummary {
  extract?:     string;
  description?: string;
  content_urls?: { desktop?: { page?: string } };
}

export class WebSearchService {
  /**
   * Attempts to get basic company data using DuckDuckGo + Wikipedia.
   * Returns a low confidence_score (20-40) because data is partial.
   */
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    const results = await Promise.allSettled([
      this.queryDuckDuckGo(companyName),
      this.queryWikipedia(companyName),
    ]);

    const ddg  = results[0].status === 'fulfilled' ? results[0].value : null;
    const wiki = results[1].status === 'fulfilled' ? results[1].value : null;

    const description =
      wiki?.extract?.split('.').slice(0, 3).join('. ').trim() ||
      ddg?.Abstract ||
      '';

    const website =
      wiki?.content_urls?.desktop?.page ||
      ddg?.AbstractURL ||
      '';

    // Attempt to infer country from description
    const hq_country = this.inferCountry(description);

    if (!description && !website) {
      // No data from any source → minimum confidence
      return { confidence_score: 5, _provider: 'web_search_empty' };
    }

    return {
      description:  description || undefined,
      website:      website || undefined,
      hq_country:   hq_country || undefined,
      confidence_score: description ? 30 : 10,
      _provider: 'web_search',
    };
  }

  // ── DuckDuckGo Instant Answer API ─────────────────────────────────────────

  private static async queryDuckDuckGo(companyName: string): Promise<DDGResult | null> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(companyName + ' company')}&format=json&no_html=1&skip_disambig=1`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CanTrack-CRM/1.0 (company enrichment)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return null;
      const json: DDGResult = await res.json();
      // Only accept if DuckDuckGo returned a concrete result (not ambiguous)
      return json.Abstract ? json : null;
    } catch (error) {
      console.error('[WebSearch DDG Error]', (error as Error).message);
      return null;
    }
  }

  // ── Wikipedia REST API ────────────────────────────────────────────────────

  private static async queryWikipedia(companyName: string): Promise<WikiSummary | null> {
    // Try Spanish first, then English
    for (const lang of ['es', 'en']) {
      try {
        const slug = encodeURIComponent(companyName.trim());
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'CanTrack-CRM/1.0 (company enrichment)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) continue;
        const json: WikiSummary = await res.json();
        // Discard disambiguation pages
        if (json.extract && json.extract.length > 50) return json;
      } catch { /* continuar al siguiente idioma */ }
    }
    return null;
  }

  // ── Basic Country Inference ───────────────────────────────────────────────

  private static inferCountry(text: string): string | undefined {
    if (!text) return undefined;
    const lower = text.toLowerCase();
    const COUNTRIES: Array<[RegExp, string]> = [
      [/\bcolombi/i,   'Colombia'],
      [/\bmexic/i,     'Mexico'],
      [/\bargentin/i,  'Argentina'],
      [/\bchile/i,     'Chile'],
      [/\bperou?/i,    'Peru'],
      [/\bbrasil|brazil/i, 'Brazil'],
      [/\bespañ|spain/i,    'Spain'],
      [/\bunited states|usa\b|u\.s\.a/i, 'United States'],
      [/\bcanad/i,     'Canada'],
      [/\bfranci|france/i,  'France'],
      [/\bgerman/i,    'Germany'],
    ];
    for (const [pattern, country] of COUNTRIES) {
      if (pattern.test(lower)) return country;
    }
    return undefined;
  }
}
