/**
 * All Job use cases bundled — each class is independent and testable.
 * Bundled in one file because each is trivially small (< 15 lines).
 */
import type { IJobRepository } from '../../domain/job/IJobRepository.js';
import type { Job, CreateJobInput, UpdateJobFields, JobListResult, JobListQuery } from '../../domain/job/Job.js';
import { NotFoundError, DomainError } from '../../domain/shared/DomainError.js';

const VALID_SOURCES = ['linkedin', 'indeed', 'glassdoor', 'company_website', 'other'];

export class GetJobsUseCase {
  constructor(private readonly jobs: IJobRepository) {}
  async execute(query: JobListQuery): Promise<JobListResult> {
    return this.jobs.findAll(query);
  }
}

export class GetJobByIdUseCase {
  constructor(private readonly jobs: IJobRepository) {}
  async execute(id: string): Promise<Job> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundError('Job');
    return job;
  }
}

export class CreateJobUseCase {
  constructor(private readonly jobs: IJobRepository) {}
  async execute(input: CreateJobInput): Promise<Job> {
    if (!input.title || !input.source || !input.url)
      throw new DomainError('title, source and url are required.');
    if (!input.companyId && !input.rawCompanyName)
      throw new DomainError('company_id or raw_company_name is required.');
    if (!VALID_SOURCES.includes(input.source))
      throw new DomainError('Invalid source.');
    try {
      return await this.jobs.create(input);
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23503') throw new NotFoundError('Specified company');
      throw err;
    }
  }
}

export class UpdateJobUseCase {
  constructor(private readonly jobs: IJobRepository) {}
  async execute(id: string, fields: UpdateJobFields): Promise<Job> {
    if (Object.keys(fields).length === 0) throw new DomainError('No valid fields provided.');
    const updated = await this.jobs.update(id, fields);
    if (!updated) throw new NotFoundError('Job');
    return updated;
  }
}

export class DeleteJobUseCase {
  constructor(private readonly jobs: IJobRepository) {}
  async execute(id: string): Promise<void> {
    const ok = await this.jobs.softDelete(id);
    if (!ok) throw new NotFoundError('Job');
  }
}
