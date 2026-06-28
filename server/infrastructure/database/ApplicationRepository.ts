import type { Pool } from 'pg';
import type { Application, ApplicationStatus, CreateApplicationInput } from '../../domain/application/Application.js';
import type { IApplicationRepository } from '../../domain/application/IApplicationRepository.js';
import { BaseRepository } from './BaseRepository.js';

const TABLE = 'applications';

export class ApplicationRepository extends BaseRepository<Application> implements IApplicationRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async findByJobAndCandidate(jobId: string, candidateId: string): Promise<Application | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${TABLE} WHERE job_id = $1 AND candidate_id = $2`,
      [jobId, candidateId],
    );
    return rows[0] ?? null;
  }

  async upsert(input: CreateApplicationInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${TABLE} (job_id, candidate_id, status, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, candidate_id)
       DO UPDATE SET status = COALESCE(EXCLUDED.status, applications.status),
                     notes = COALESCE(EXCLUDED.notes, applications.notes),
                     updated_at = NOW()`,
      [input.jobId, input.candidateId, input.status ?? 'Applied', input.notes ?? null],
    );
  }

  async updateStatus(jobId: string, candidateId: string, status: ApplicationStatus): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${TABLE} SET status = $3, updated_at = NOW()
       WHERE job_id = $1 AND candidate_id = $2`,
      [jobId, candidateId, status],
    );
    return (rowCount ?? 0) > 0;
  }
}
