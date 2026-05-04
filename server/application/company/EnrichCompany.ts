import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { IEnrichmentPort, EnrichmentResult } from '../../domain/company/ports.js';
import { DomainError } from '../../domain/shared/DomainError.js';

export interface EnrichCompanyOutput {
  source: string;
  data: EnrichmentResult;
}

export class EnrichCompanyUseCase {
  constructor(
    private readonly companies: ICompanyRepository,
    private readonly enrichment: IEnrichmentPort,
  ) {}

  async execute(companyId: string, companyName: string): Promise<EnrichCompanyOutput> {
    if (!companyId || !companyName) {
      throw new DomainError('companyId y companyName son requeridos.');
    }

    const existing = await this.companies.findById(companyId);
    if (existing?.industry || existing?.website || existing?.description) {
      if (existing.enrichmentStatus !== 'pending') {
        await this.companies.update(companyId, { enrichmentStatus: 'db_matched' });
        return { source: 'db_matched', data: {} };
      }
    }

    const data = await this.enrichment.enrich(companyName);
    const hasData = data.industry || data.description || data.website;
    await this.companies.update(companyId, {
      enrichmentStatus: hasData ? 'scraped' : 'failed',
      ...data,
    });
    return { source: data._provider ?? 'unknown', data };
  }
}
