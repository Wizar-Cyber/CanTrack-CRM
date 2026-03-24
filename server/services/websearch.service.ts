/**
 * WebSearchService — Enriquecimiento básico sin LLMs usando:
 *   1. DuckDuckGo Instant Answer API (gratuito, sin clave)
 *   2. Wikipedia REST API (gratuito, sin clave)
 *
 * No da datos tan estructurados como un LLM, pero sirve como último recurso
 * para obtener descripción, país y URL de empresas conocidas.
 *
 * No requiere ninguna env var.
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
   * Intenta obtener datos básicos de la empresa usando DuckDuckGo + Wikipedia.
   * Devuelve confidence_score bajo (20-40) porque los datos son parciales.
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

    // Intentar inferir el país desde la descripción
    const hq_country = this.inferCountry(description);

    if (!description && !website) {
      // Sin datos de ninguna fuente → confidence mínima
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
      // Solo aceptar si DuckDuckGo devolvió un result concreto (no ambiguo)
      return json.Abstract ? json : null;
    } catch (error) {
      console.error('[WebSearch DDG Error]', (error as Error).message);
      return null;
    }
  }

  // ── Wikipedia REST API ────────────────────────────────────────────────────

  private static async queryWikipedia(companyName: string): Promise<WikiSummary | null> {
    // Prueba primero en español, luego en inglés
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
        // Descartar páginas de desambiguación
        if (json.extract && json.extract.length > 50) return json;
      } catch { /* continuar al siguiente idioma */ }
    }
    return null;
  }

  // ── Inferencia básica de país ─────────────────────────────────────────────

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
