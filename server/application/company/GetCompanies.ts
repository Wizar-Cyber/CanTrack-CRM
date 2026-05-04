import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { Company } from '../../domain/company/Company.js';

export class GetCompaniesUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(): Promise<Company[]> {
    return this.companies.findAll();
  }
}
