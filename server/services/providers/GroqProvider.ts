import type { IEnrichmentProvider, EnrichmentData } from './IEnrichmentProvider.js';
import { GroqService } from '../groq.service.js';

export class GroqProvider implements IEnrichmentProvider {
  readonly name = 'groq';

  isAvailable(): boolean {
    return GroqService.isConfigured();
  }

  async enrich(companyName: string): Promise<Partial<EnrichmentData>> {
    return GroqService.enrichCompany(companyName);
  }
}
