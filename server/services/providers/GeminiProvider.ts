import type { IEnrichmentProvider, EnrichmentData } from './IEnrichmentProvider.js';
import { GeminiService } from '../gemini.service.js';

export class GeminiProvider implements IEnrichmentProvider {
  readonly name = 'gemini';

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async enrich(companyName: string): Promise<Partial<EnrichmentData>> {
    return GeminiService.enrichCompany(companyName);
  }
}
