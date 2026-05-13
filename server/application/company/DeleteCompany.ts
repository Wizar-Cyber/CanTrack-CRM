import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import { NotFoundError, ConflictError } from '../../domain/shared/DomainError.js';

export class DeleteCompanyUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(id: string): Promise<void> {
    try {
      await this.companies.delete(id);
    } catch (err: unknown) {
      const dbErr = err as { code?: string; statusCode?: number };
      if (dbErr.statusCode === 404) throw new NotFoundError('Company');
      if (dbErr.code === '23503') {
        throw new ConflictError('Cannot delete: company has associated job vacancies.');
      }
      throw err;
    }
  }
}
