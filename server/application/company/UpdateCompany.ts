import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { UpdateCompanyFields } from '../../domain/company/Company.js';
import { DomainError } from '../../domain/shared/DomainError.js';

const ALLOWED: (keyof UpdateCompanyFields)[] = [
  'enrichmentStatus', 'industry', 'companySize', 'hqCity', 'hqProvince',
  'hqCountry', 'exactAddress', 'phone', 'contactEmail', 'website',
  'description', 'knownAtsPortal', 'legalName', 'name',
];

export class UpdateCompanyUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(id: string, rawFields: Record<string, unknown>): Promise<void> {
    const fields: UpdateCompanyFields = {};
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(rawFields, key)) {
        (fields as Record<string, unknown>)[key] = rawFields[key];
      }
    }
    if (Object.keys(fields).length === 0) {
      throw new DomainError('No hay campos válidos para actualizar.');
    }
    await this.companies.update(id, fields);
  }
}
