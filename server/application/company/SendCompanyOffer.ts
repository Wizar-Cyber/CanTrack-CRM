import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import type { IEmailPort } from '../../domain/company/ports.js';
import { NotFoundError, DomainError } from '../../domain/shared/DomainError.js';

export interface SendOfferInput {
  companyId: string;
  toEmail: string;
  toName?: string;
  employeeTypeId: string;
  employeeTypeName: string;
  employeeTypeDescription?: string;
  subject: string;
  customMessage?: string;
  sentByUserId: string;
  senderName: string;
}

export class SendCompanyOfferUseCase {
  constructor(
    private readonly companies: ICompanyRepository,
    private readonly email: IEmailPort,
  ) {}

  async execute(input: SendOfferInput): Promise<{ messageId?: string }> {
    const company = await this.companies.findById(input.companyId);
    if (!company) throw new NotFoundError('Empresa');

    const htmlBody = this.email.buildOfferHtml({
      companyName:              company.name,
      contactName:              input.toName,
      employeeTypeName:         input.employeeTypeName,
      employeeTypeDescription:  input.employeeTypeDescription ?? '',
      customMessage:            input.customMessage ?? '',
      senderName:               input.senderName,
    });

    const result = await this.email.send({
      toEmail:         input.toEmail,
      toName:          input.toName ?? company.name,
      subject:         input.subject,
      htmlBody,
      companyId:       input.companyId,
      employeeTypeId:  input.employeeTypeId,
      sentByUserId:    input.sentByUserId,
    });

    if (!result.success) throw new DomainError(result.error ?? 'Error al enviar el correo.', 502);

    await this.companies.logEmail({
      ...input,
      companyName:      company.name,
      mdirectorMessageId: result.messageId ?? null,
    });

    return { messageId: result.messageId };
  }
}
