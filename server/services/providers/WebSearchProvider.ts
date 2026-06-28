import type { IEnrichmentProvider, EnrichmentData } from './IEnrichmentProvider.js';
import { WebSearchService } from '../websearch.service.js';

export class WebSearchProvider implements IEnrichmentProvider {
  readonly name = 'web_search';

  isAvailable(): boolean {
    return true;
  }

  async enrich(companyName: string): Promise<Partial<EnrichmentData>> {
    return WebSearchService.enrichCompany(companyName);
  }
}
