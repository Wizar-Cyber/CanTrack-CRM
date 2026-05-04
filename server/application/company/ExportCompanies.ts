import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { IExcelPort } from '../../domain/company/ports.js';

export class ExportCompaniesUseCase {
  constructor(
    private readonly companies: ICompanyRepository,
    private readonly excel: IExcelPort,
  ) {}

  async execute(ids?: string[]): Promise<Buffer> {
    const rows = await this.companies.findForExport(ids);
    return this.excel.generateCompaniesWorkbook(
      rows.map(c => ({
        name:          c.name,
        exact_address: c.exactAddress,
        industry:      c.industry,
      })),
    );
  }
}
