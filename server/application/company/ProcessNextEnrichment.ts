import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { IEnrichmentPort, EnrichmentResult } from '../../domain/company/ports.js';

export interface ProcessNextResult {
  done: boolean;
  source?: string;
  companyId?: string;
  companyName?: string;
  data?: EnrichmentResult;
  remaining?: number;
  message?: string;
}

export class ProcessNextEnrichmentUseCase {
  constructor(
    private readonly companies: ICompanyRepository,
    private readonly enrichment: IEnrichmentPort,
  ) {}

  async execute(): Promise<ProcessNextResult> {
    const locked = await this.companies.lockNextPending();
    if (!locked) return { done: true, message: 'No pending companies.' };

    const { id: companyId, name: companyName } = locked;
    const existing = await this.companies.findById(companyId);

    if (existing?.industry || existing?.website || existing?.description) {
      await this.companies.update(companyId, { enrichmentStatus: 'db_matched' });
      return { done: false, source: 'db_matched', companyId, companyName };
    }

    const data = await this.enrichment.enrich(companyName);
    const hasData = data.industry || data.description || data.website;
    await this.companies.update(companyId, {
      enrichmentStatus: hasData ? 'scraped' : 'failed',
      ...data,
    });

    const status = await this.companies.getEnrichmentStatus();
    return {
      done:        status.pending === 0,
      source:      data._provider ?? 'unknown',
      companyId,
      companyName,
      data,
      remaining:   status.pending,
    };
  }
}
