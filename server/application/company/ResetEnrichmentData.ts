import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';

export interface ResetEnrichmentResult {
  message: string;
}

export class ResetEnrichmentDataUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(limit?: number): Promise<ResetEnrichmentResult> {
    await this.companies.resetAllEnrichmentData(limit);
    const message = limit && limit > 0
      ? `Reset done. First ${limit} companies queued for enrichment, rest skipped.`
      : 'All company enrichment data cleared. Ready to re-scrape.';
    return { message };
  }
}
