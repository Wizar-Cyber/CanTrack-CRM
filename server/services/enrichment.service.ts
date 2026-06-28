import { GeminiProvider, GroqProvider, OllamaProvider, WebSearchProvider, ProviderChain } from './providers/index.js';
import type { EnrichmentData } from './providers/IEnrichmentProvider.js';
import { GeminiService } from './gemini.service.js';

export type { EnrichmentData };

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
    return res.ok || res.status === 405 || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

const defaultChain = new ProviderChain([
  new GeminiProvider(),
  new GroqProvider(),
  new OllamaProvider(),
  new WebSearchProvider(),
]);

export class EnrichmentService {
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    const merged = await defaultChain.enrich(companyName);

    if (merged.website) {
      const alive = await verifyUrl(merged.website);
      if (!alive) {
        delete merged.website;
      }
    }

    return merged as EnrichmentData;
  }

  static async generateCoverLetter(candidate: any, job: any): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'Cover letter generation requires GEMINI_API_KEY. ' +
        'Set the environment variable and restart the server.'
      );
    }
    return GeminiService.generateCoverLetter(candidate, job);
  }

  static async activeProvider(): Promise<string> {
    if (process.env.GEMINI_API_KEY)    return 'gemini';
    const groq = new GroqProvider();
    if (await groq.isAvailable())      return 'groq';
    const ollama = new OllamaProvider();
    if (await ollama.isAvailable())    return 'ollama';
    return 'web_search';
  }
}
