import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { EnrichmentStatusSummary } from '../../domain/company/Company.js';

export class GetEnrichmentStatusUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(): Promise<EnrichmentStatusSummary> {
    return this.companies.getEnrichmentStatus();
  }
}
