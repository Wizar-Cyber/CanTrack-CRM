import type {
  Company, CreateCompanyInput, UpdateCompanyFields,
  EnrichmentStatusSummary, EmailLog, SendOfferInput,
} from './Company.js';

export interface ICompanyRepository {
  findAll(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
  findBySlug(slug: string): Promise<Company | null>;
  create(input: CreateCompanyInput & { slug: string }): Promise<Company>;
  update(id: string, fields: UpdateCompanyFields): Promise<void>;
  delete(id: string): Promise<void>;
  findForExport(ids?: string[]): Promise<Company[]>;

  // Enrichment queue
  lockNextPending(): Promise<Pick<Company, 'id' | 'name'> | null>;
  getEnrichmentStatus(): Promise<EnrichmentStatusSummary>;
  resetAllEnrichmentData(limit?: number): Promise<void>;

  // Email logs
  logEmail(input: SendOfferInput & { mdirectorMessageId: string | null }): Promise<void>;
  getEmailLogs(companyId: string): Promise<EmailLog[]>;
}
