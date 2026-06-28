import type { Pool, QueryResultRow } from 'pg';
import type { User, UserWithHash, CreateUserInput, UserRole, DashboardStats } from '../../domain/user/User.js';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import { BaseRepository } from './BaseRepository.js';

const TABLE = 'users';

function toDomain(row: QueryResultRow): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDomainWithHash(row: QueryResultRow): UserWithHash {
  return { ...toDomain(row), passwordHash: row.password_hash };
}

export class UserRepository extends BaseRepository<User> implements IUserRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByIdWithHash(id: string): Promise<UserWithHash | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    return rows[0] ? toDomainWithHash(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserWithHash | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} WHERE email = $1`, [email]);
    return rows[0] ? toDomainWithHash(rows[0]) : null;
  }

  async isActive(id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT is_active FROM ${TABLE} WHERE id = $1`,
      [id],
    );
    return rows[0]?.is_active ?? false;
  }

  async countAll(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) FROM ${TABLE}`);
    return parseInt(rows[0].count, 10);
  }

  async findAll(): Promise<User[]> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`);
    return rows.map(toDomain);
  }

  async create(input: CreateUserInput): Promise<User> {
    const { rows } = await this.pool.query(
      `INSERT INTO ${TABLE} (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.email, input.passwordHash, input.firstName, input.lastName, input.role],
    );
    return toDomain(rows[0]);
  }

  async updateProfile(id: string, firstName: string, lastName: string): Promise<User> {
    const { rows } = await this.pool.query(
      `UPDATE ${TABLE} SET first_name = $2, last_name = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, firstName, lastName],
    );
    return toDomain(rows[0]);
  }

  async updatePasswordHash(id: string, hash: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${TABLE} SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [id, hash],
    );
  }

  async updateRole(id: string, role: UserRole): Promise<User | null> {
    const { rows } = await this.pool.query(
      `UPDATE ${TABLE} SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, role],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async deactivate(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${TABLE} SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async getStats(): Promise<DashboardStats> {
    const { rows } = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM jobs) AS total_jobs,
        (SELECT COUNT(*) FROM companies) AS total_companies,
        (SELECT COUNT(*) FROM companies WHERE enrichment_status IN ('scraped','db_matched','verified')) AS enriched_companies,
        (SELECT COUNT(*) FROM companies WHERE enrichment_status = 'pending') AS pending_enrichment,
        (SELECT COUNT(*) FROM applications) AS total_applications,
        (SELECT COUNT(*) FROM candidates) AS total_candidates,
        (SELECT COUNT(*) FROM candidates WHERE status = 'Available') AS active_candidates,
        (SELECT COUNT(*) FROM candidates WHERE status = 'Placed') AS placed_candidates
    `);
    return {
      totalJobs: parseInt(rows[0].total_jobs, 10),
      totalCompanies: parseInt(rows[0].total_companies, 10),
      enrichedCompanies: parseInt(rows[0].enriched_companies, 10),
      pendingEnrichment: parseInt(rows[0].pending_enrichment, 10),
      totalApplications: parseInt(rows[0].total_applications, 10),
      totalCandidates: parseInt(rows[0].total_candidates, 10),
      activeCandidates: parseInt(rows[0].active_candidates, 10),
      placedCandidates: parseInt(rows[0].placed_candidates, 10),
    };
  }
}
