import type { IEnrichmentProvider, EnrichmentData } from './IEnrichmentProvider.js';

const FIELDS: (keyof EnrichmentData)[] = [
  'industry', 'company_size', 'hq_city', 'hq_province', 'hq_region', 'hq_town', 'hq_country',
  'exact_address', 'phone', 'contact_email', 'website', 'description',
];

function filled(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  return s !== '' && s !== '0';
}

function missing(data: Partial<EnrichmentData>): string[] {
  return FIELDS.filter(f => !filled((data as any)[f]));
}

function mergeInto(base: Partial<EnrichmentData>, patch: Partial<EnrichmentData>): void {
  for (const key of FIELDS) {
    if (!filled((base as any)[key]) && filled((patch as any)[key])) {
      (base as any)[key] = (patch as any)[key];
    }
  }
}

export class ProviderChain {
  constructor(private readonly providers: IEnrichmentProvider[]) {}

  async enrich(companyName: string): Promise<Partial<EnrichmentData>> {
    const merged: Partial<EnrichmentData> = {};
    const usedProviders: string[] = [];

    for (const provider of this.providers) {
      if (missing(merged).length === 0) break;

      let available: boolean;
      try { available = await provider.isAvailable(); }
      catch { available = false; }

      if (!available) continue;

      const before = missing(merged).length;
      try {
        const result = await provider.enrich(companyName);
        mergeInto(merged, result);
        const filledCount = before - missing(merged).length;
        if (filledCount > 0) {
          usedProviders.push(provider.name);
        }
      } catch {
        continue;
      }
    }

    return { ...merged, _provider: usedProviders.join('+') || 'none' };
  }
}
