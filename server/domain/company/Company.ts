/**
 * Enrichment status lifecycle:
 * pending → processing → scraped | db_matched | verified | failed | skipped
 */
export type EnrichmentStatus =
  | 'pending' | 'processing' | 'db_matched' | 'scraped' | 'verified' | 'failed' | 'skipped';

/**
 * Core Company entity representing a business in the CRM.
 * Used by the main `companies` table and as enriched data cache.
 */
export interface Company {
  id: string;
  name: string;
  slug: string;
  legalName:     string | null;
  industry:      string | null;
  companySize:   string | null;
  hqCity:        string | null;
  hqProvince:    string | null;
  hqCountry:     string | null;
  exactAddress:  string | null;
  phone:         string | null;
  contactEmail:  string | null;
  website:       string | null;
  description:   string | null;
  knownAtsPortal: string | null;
  enrichmentStatus: EnrichmentStatus;
  enrichedAt:    Date | null;
  createdAt:     Date;
  updatedAt:     Date;
}

/** Input for creating a new company record */
export interface CreateCompanyInput {
  name: string;
  legalName?: string;
  website?: string;
  industry?: string;
}

/** Fields that can be safely updated on a company record */
export interface UpdateCompanyFields {
  enrichmentStatus?: EnrichmentStatus;
  industry?: string;
  companySize?: string;
  hqCity?: string;
  hqProvince?: string;
  hqCountry?: string;
  exactAddress?: string;
  phone?: string;
  contactEmail?: string;
  website?: string;
  description?: string;
  knownAtsPortal?: string;
  legalName?: string;
  name?: string;
}

/** Counts of companies by enrichment status for the queue dashboard */
export interface EnrichmentStatusSummary {
  pending:    number;
  processing: number;
  scraped:    number;
  db_matched: number;
}

/** Email send log entry for a company */
export interface EmailLog {
  id: string;
  companyId: string;
  sentBy: string;
  sentByName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string;
  employeeTypeId: string;
  employeeTypeName: string;
  mdirectorMessageId: string | null;
  sentAt: Date;
}

/** Input for sending a staffing offer email to a company */
export interface SendOfferInput {
  companyId: string;
  toEmail: string;
  toName?: string;
  employeeTypeId: string;
  employeeTypeName: string;
  employeeTypeDescription?: string;
  subject: string;
  customMessage?: string;
  sentByUserId: string;
  senderName: string;
  companyName: string;
}
