import type { Application, ApplicationStatus, CreateApplicationInput } from './Application.js';

export interface IApplicationRepository {
  findByJobAndCandidate(jobId: string, candidateId: string): Promise<Application | null>;
  upsert(input: CreateApplicationInput): Promise<void>;
  updateStatus(jobId: string, candidateId: string, status: ApplicationStatus): Promise<boolean>;
}
