export interface EnrichmentData {
  industry?: string;
  company_size?: string;
  hq_city?: string;
  hq_province?: string;
  hq_region?: string;
  hq_town?: string;
  hq_country?: string;
  exact_address?: string;
  phone?: string;
  contact_email?: string;
  website?: string;
  description?: string;
  is_closed?: boolean;
  tipo?: string;
  primary_service?: string;
  confidence_score?: number;
  _provider?: string;
}

export interface IEnrichmentProvider {
  readonly name: string;
  isAvailable(): boolean | Promise<boolean>;
  enrich(companyName: string): Promise<Partial<EnrichmentData>>;
}
