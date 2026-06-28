import type { Pool, QueryResultRow } from 'pg';
import type { Candidate, CreateCandidateInput, UpdateCandidateInput } from '../../domain/candidate/Candidate.js';
import type { ICandidateRepository } from '../../domain/candidate/ICandidateRepository.js';
import { BaseRepository } from './BaseRepository.js';

const TABLE = 'candidates';

function toDomain(row: QueryResultRow): Candidate {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    location: row.location ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    resumeUrl: row.resume_url ?? null,
    yearsOfExperience: row.years_of_experience ?? null,
    status: row.status,
    bio: row.bio ?? null,
    skills: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CandidateRepository extends BaseRepository<Candidate> implements ICandidateRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async findAll(): Promise<Candidate[]> {
    const { rows } = await this.pool.query(
      `SELECT c.*, COALESCE(
        (SELECT json_agg(s.skill) FROM candidate_skills s WHERE s.candidate_id = c.id),
        '[]'::json
      ) AS skills
       FROM ${TABLE} c
       ORDER BY c.created_at DESC`,
    );
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Candidate | null> {
    const { rows } = await this.pool.query(
      `SELECT c.*, COALESCE(
        (SELECT json_agg(s.skill) FROM candidate_skills s WHERE s.candidate_id = c.id),
        '[]'::json
      ) AS skills
       FROM ${TABLE} c WHERE c.id = $1`,
      [id],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(input: CreateCandidateInput): Promise<Candidate> {
    const { rows } = await this.pool.query(
      `INSERT INTO ${TABLE} (name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, bio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        input.name,
        input.role ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.location ?? null,
        input.linkedinUrl ?? null,
        input.resumeUrl ?? null,
        input.yearsOfExperience ?? null,
        input.bio ?? null,
      ],
    );

    if (input.skills?.length) {
      for (const skill of input.skills) {
        await this.pool.query(
          `INSERT INTO candidate_skills (candidate_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [rows[0].id, skill],
        );
      }
    }

    return toDomain(rows[0]);
  }

  async update(id: string, input: UpdateCandidateInput): Promise<Candidate | null> {
    const dbFields: Record<string, any> = {};
    if (input.name !== undefined) dbFields.name = input.name;
    if (input.role !== undefined) dbFields.role = input.role;
    if (input.email !== undefined) dbFields.email = input.email;
    if (input.phone !== undefined) dbFields.phone = input.phone;
    if (input.location !== undefined) dbFields.location = input.location;
    if (input.linkedinUrl !== undefined) dbFields.linkedin_url = input.linkedinUrl;
    if (input.resumeUrl !== undefined) dbFields.resume_url = input.resumeUrl;
    if (input.yearsOfExperience !== undefined) dbFields.years_of_experience = input.yearsOfExperience;
    if (input.status !== undefined) dbFields.status = input.status;
    if (input.bio !== undefined) dbFields.bio = input.bio;

    const keys = Object.keys(dbFields);
    if (keys.length === 0) return this.findById(id);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    await this.pool.query(
      `UPDATE ${TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1`,
      [id, ...keys.map(k => dbFields[k])],
    );

    if (input.skills) {
      await this.pool.query(`DELETE FROM candidate_skills WHERE candidate_id = $1`, [id]);
      for (const skill of input.skills) {
        await this.pool.query(
          `INSERT INTO candidate_skills (candidate_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, skill],
        );
      }
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    await this.pool.query(`DELETE FROM candidate_skills WHERE candidate_id = $1`, [id]);
    return this.deleteById(TABLE, id);
  }
}
