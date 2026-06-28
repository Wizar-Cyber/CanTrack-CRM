import type { IEnrichmentProvider, EnrichmentData } from './IEnrichmentProvider.js';
import { OllamaService } from '../ollama.service.js';

export class OllamaProvider implements IEnrichmentProvider {
  readonly name = 'ollama';

  async isAvailable(): Promise<boolean> {
    return OllamaService.isAvailable();
  }

  async enrich(companyName: string): Promise<Partial<EnrichmentData>> {
    return OllamaService.enrichCompany(companyName);
  }
}
