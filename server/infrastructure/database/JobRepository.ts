import type { Pool, QueryResultRow } from 'pg';
import type { Job, CreateJobInput, UpdateJobFields, JobListResult, JobListQuery } from '../../domain/job/Job.js';
import type { IJobRepository } from '../../domain/job/IJobRepository.js';
import { BaseRepository } from './BaseRepository.js';

const TABLE = 'jobs';

function toDomain(row: QueryResultRow): Job {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    rawCompanyName: row.raw_company_name ?? null,
    companyName: row.company_name ?? null,
    title: row.title,
    source: row.source,
    url: row.url,
    location: row.location ?? null,
    country: row.country ?? null,
    category: row.category ?? null,
    applicationType: row.application_type ?? null,
    isEasyApply: row.is_easy_apply ?? false,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class JobRepository extends BaseRepository<Job> implements IJobRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async findAll(query: JobListQuery): Promise<JobListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;
    const search = query.search?.trim();

    let where = 'TRUE';
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      where = `(j.title ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR j.raw_company_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM ${TABLE} j LEFT JOIN companies c ON j.company_id = c.id WHERE ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const { rows } = await this.pool.query(
      `SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name
       FROM ${TABLE} j
       LEFT JOIN companies c ON j.company_id = c.id
       WHERE ${where}
       ORDER BY j.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params,
    );

    return {
      data: rows.map(toDomain),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Job | null> {
    const { rows } = await this.pool.query(
      `SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name
       FROM ${TABLE} j
       LEFT JOIN companies c ON j.company_id = c.id
       WHERE j.id = $1`,
      [id],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const { rows } = await this.pool.query(
      `INSERT INTO ${TABLE} (company_id, raw_company_name, title, source, url, location, country, category, application_type, is_easy_apply)
       VALUES ($1, $2, $3, $4::job_source_enum, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.companyId ?? null,
        input.rawCompanyName ?? null,
        input.title,
        input.source,
        input.url,
        input.location ?? null,
        input.country ?? null,
        input.category ?? null,
        input.applicationType ?? null,
        input.isEasyApply ?? false,
      ],
    );
    return toDomain(rows[0]);
  }

  async update(id: string, fields: UpdateJobFields): Promise<Job | null> {
    const dbFields: Record<string, any> = {};
    if (fields.title !== undefined) dbFields.title = fields.title;
    if (fields.url !== undefined) dbFields.url = fields.url;
    if (fields.location !== undefined) dbFields.location = fields.location;
    if (fields.country !== undefined) dbFields.country = fields.country;
    if (fields.category !== undefined) dbFields.category = fields.category;
    if (fields.applicationType !== undefined) dbFields.application_type = fields.applicationType;
    if (fields.isEasyApply !== undefined) dbFields.is_easy_apply = fields.isEasyApply;
    if (fields.isActive !== undefined) dbFields.is_active = fields.isActive;

    const keys = Object.keys(dbFields);
    if (keys.length === 0) return this.findById(id);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE ${TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => dbFields[k])],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${TABLE} SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}
