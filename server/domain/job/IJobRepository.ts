import type { Job, CreateJobInput, UpdateJobFields, JobListResult, JobListQuery } from './Job.js';

export interface IJobRepository {
  findAll(query: JobListQuery): Promise<JobListResult>;
  findById(id: string): Promise<Job | null>;
  create(input: CreateJobInput): Promise<Job>;
  update(id: string, fields: UpdateJobFields): Promise<Job | null>;
  softDelete(id: string): Promise<boolean>;
}
