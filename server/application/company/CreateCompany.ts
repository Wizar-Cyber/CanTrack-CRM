import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { Company, CreateCompanyInput } from '../../domain/company/Company.js';
import { ConflictError, DomainError } from '../../domain/shared/DomainError.js';
import { slugify } from '../../utils/slug.js';

export class CreateCompanyUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(input: CreateCompanyInput): Promise<Company> {
    if (!input.name?.trim()) throw new DomainError('El nombre es requerido.');
    const slug = slugify(input.name.trim());

    try {
      return await this.companies.create({ ...input, name: input.name.trim(), slug });
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23505') throw new ConflictError('Ya existe una empresa con ese nombre.');
      throw err;
    }
  }
}
