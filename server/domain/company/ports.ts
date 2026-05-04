import type { UpdateCompanyFields } from './Company.js';

// ── Enrichment port (AI providers) ──────────────────────────────────────────
export interface EnrichmentResult extends UpdateCompanyFields {
  _provider?: string;
}

export interface IEnrichmentPort {
  enrich(companyName: string): Promise<EnrichmentResult>;
}

// ── Email port (transactional email provider) ────────────────────────────────
export interface BuildEmailInput {
  companyName: string;
  contactName?: string;
  employeeTypeName: string;
  employeeTypeDescription: string;
  customMessage?: string;
  senderName: string;
}

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  companyId: string;
  employeeTypeId: string;
  sentByUserId: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailPort {
  buildOfferHtml(input: BuildEmailInput): string;
  send(input: SendEmailInput): Promise<EmailSendResult>;
}

// ── Excel export port ────────────────────────────────────────────────────────
export interface IExcelPort {
  generateCompaniesWorkbook(
    companies: Array<{ name: string; exact_address: string | null; industry: string | null }>,
  ): Promise<Buffer>;
}
