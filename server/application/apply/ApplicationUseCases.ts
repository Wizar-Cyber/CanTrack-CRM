import type { IApplicationRepository } from '../../domain/application/IApplicationRepository.js';
import type { Application, ApplicationStatus } from '../../domain/application/Application.js';
import { NotFoundError, DomainError } from '../../domain/shared/DomainError.js';

// ── IAutomationPort — injected, so use-case never imports Express or Playwright ──
export interface AutomationJobInput {
  id: string;
  url: string;
  [key: string]: unknown;
}
export interface AutomationCandidateInput {
  id: string;
  name: string;
  [key: string]: unknown;
}
export interface AutomationResult {
  success: boolean;
  message: string;
  strategy: string;
  logs: unknown[];
  requiresExtension?: boolean;
  applicationId?: string;
}

export interface IAutomationPort {
  execute(job: AutomationJobInput, candidate: AutomationCandidateInput): Promise<AutomationResult>;
}

const VALID_STATUSES: ApplicationStatus[] = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Placed'];

export class AutoApplyUseCase {
  constructor(
    private readonly applications: IApplicationRepository,
    private readonly automation:   IAutomationPort,
  ) {}

  async execute(job: AutomationJobInput, candidate: AutomationCandidateInput): Promise<AutomationResult> {
    if (!job?.id || !candidate?.id) throw new DomainError('job.id and candidate.id are required.');
    const result = await this.automation.execute(job, candidate);
    const status: ApplicationStatus = result.success ? 'Applied' : 'Saved';
    await this.applications.upsert({ jobId: job.id, candidateId: candidate.id, status });
    return result;
  }
}

export class RecordApplicationUseCase {
  constructor(private readonly applications: IApplicationRepository) {}

  async execute(jobId: string, candidateId: string): Promise<void> {
    if (!jobId || !candidateId) throw new DomainError('jobId and candidateId are required.');
    try {
      await this.applications.upsert({ jobId, candidateId, status: 'Applied' });
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23503') throw new NotFoundError('Job o candidato');
      throw err;
    }
  }
}

export class UpdateApplicationStatusUseCase {
  constructor(private readonly applications: IApplicationRepository) {}

  async execute(jobId: string, candidateId: string, status: string): Promise<void> {
    if (!VALID_STATUSES.includes(status as ApplicationStatus)) {
      throw new DomainError('Invalid status.');
    }
    const ok = await this.applications.updateStatus(jobId, candidateId, status as ApplicationStatus);
    if (!ok) throw new NotFoundError('Application');
  }
}

export class GetApplicationStatusUseCase {
  constructor(private readonly applications: IApplicationRepository) {}

  async execute(jobId: string, candidateId: string): Promise<Application | null> {
    if (!jobId || !candidateId) throw new DomainError('Missing jobId or candidateId.');
    return this.applications.findByJobAndCandidate(jobId, candidateId);
  }
}
