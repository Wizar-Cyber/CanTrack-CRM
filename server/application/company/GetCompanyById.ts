import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { Company } from '../../domain/company/Company.js';
import { NotFoundError } from '../../domain/shared/DomainError.js';

export class GetCompanyByIdUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(id: string): Promise<Company> {
    const company = await this.companies.findById(id);
    if (!company) throw new NotFoundError('Company');
    return company;
  }
}
