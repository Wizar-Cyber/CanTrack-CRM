import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { EmailLog } from '../../domain/company/Company.js';

export class GetEmailLogsUseCase {
  constructor(private readonly companies: ICompanyRepository) {}

  async execute(companyId: string): Promise<EmailLog[]> {
    return this.companies.getEmailLogs(companyId);
  }
}
