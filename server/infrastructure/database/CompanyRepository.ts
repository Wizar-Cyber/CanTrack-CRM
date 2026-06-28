import type { Pool, QueryResultRow } from 'pg';
import type {
  Company, CreateCompanyInput, UpdateCompanyFields,
  EnrichmentStatusSummary, EmailLog,
} from '../../domain/company/Company.js';
import type { ICompanyRepository } from '../../domain/company/ICompanyRepository.js';
import { BaseRepository } from './BaseRepository.js';

const TABLE = 'companies';

function toDomain(row: QueryResultRow): Company {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name ?? null,
    industry: row.industry ?? null,
    companySize: row.company_size ?? null,
    hqCity: row.hq_city ?? null,
    hqProvince: row.hq_province ?? null,
    hqCountry: row.hq_country ?? null,
    exactAddress: row.exact_address ?? null,
    phone: row.phone ?? null,
    contactEmail: row.contact_email ?? null,
    website: row.website ?? null,
    description: row.description ?? null,
    knownAtsPortal: row.known_ats_portal ?? null,
    enrichmentStatus: row.enrichment_status,
    enrichedAt: row.enriched_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * PostgreSQL implementation of ICompanyRepository.
 * Handles CRUD operations, enrichment queue management,
 * email logging, and export queries for the companies table.
 */
export class CompanyRepository extends BaseRepository<Company> implements ICompanyRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async findAll(): Promise<Company[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${TABLE} ORDER BY created_at DESC`,
    );
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Company | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Company | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${TABLE} WHERE slug = $1`, [slug]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(input: CreateCompanyInput & { slug: string }): Promise<Company> {
    const { rows } = await this.pool.query(
      `INSERT INTO ${TABLE} (name, slug, legal_name, website, industry, enrichment_status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [input.name, input.slug, input.legalName ?? null, input.website ?? null, input.industry ?? null],
    );
    return toDomain(rows[0]);
  }

  async update(id: string, fields: UpdateCompanyFields): Promise<void> {
    const dbFields: Record<string, any> = {};
    if (fields.enrichmentStatus !== undefined) dbFields.enrichment_status = fields.enrichmentStatus;
    if (fields.industry !== undefined) dbFields.industry = fields.industry;
    if (fields.companySize !== undefined) dbFields.company_size = fields.companySize;
    if (fields.hqCity !== undefined) dbFields.hq_city = fields.hqCity;
    if (fields.hqProvince !== undefined) dbFields.hq_province = fields.hqProvince;
    if (fields.hqCountry !== undefined) dbFields.hq_country = fields.hqCountry;
    if (fields.exactAddress !== undefined) dbFields.exact_address = fields.exactAddress;
    if (fields.phone !== undefined) dbFields.phone = fields.phone;
    if (fields.contactEmail !== undefined) dbFields.contact_email = fields.contactEmail;
    if (fields.website !== undefined) dbFields.website = fields.website;
    if (fields.description !== undefined) dbFields.description = fields.description;
    if (fields.knownAtsPortal !== undefined) dbFields.known_ats_portal = fields.knownAtsPortal;
    if (fields.legalName !== undefined) dbFields.legal_name = fields.legalName;
    if (fields.name !== undefined) dbFields.name = fields.name;

    const keys = Object.keys(dbFields);
    if (keys.length === 0) return;
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    await this.pool.query(
      `UPDATE ${TABLE} SET ${setClause}, updated_at = NOW(), enriched_at = NOW() WHERE id = $1`,
      [id, ...keys.map(k => dbFields[k])],
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
  }

  async findForExport(ids?: string[]): Promise<Company[]> {
    if (ids && ids.length > 0) {
      const { rows } = await this.pool.query(
        `SELECT c.*,
                (SELECT j.service_type_id FROM jobs j
                  WHERE j.company_id = c.id AND j.service_type_id IS NOT NULL
                  ORDER BY j.created_at DESC LIMIT 1) AS job_service_type_id,
                c.suggested_services
         FROM ${TABLE} c
         WHERE c.id = ANY($1::uuid[])
         ORDER BY c.name`,
        [ids],
      );
      return rows.map(toDomain);
    }
    const { rows } = await this.pool.query(
      `SELECT c.*,
              (SELECT j.service_type_id FROM jobs j
                WHERE j.company_id = c.id AND j.service_type_id IS NOT NULL
                ORDER BY j.created_at DESC LIMIT 1) AS job_service_type_id,
              c.suggested_services
       FROM ${TABLE} c
       ORDER BY c.name`,
    );
    return rows.map(toDomain);
  }

  async lockNextPending(): Promise<Pick<Company, 'id' | 'name'> | null> {
    const { rows } = await this.pool.query(`
      UPDATE ${TABLE} SET enrichment_status = 'processing'
      WHERE id = (
        SELECT id FROM ${TABLE}
        WHERE enrichment_status = 'pending'
        ORDER BY created_at ASC LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, name
    `);
    return rows[0] ?? null;
  }

  async getEnrichmentStatus(): Promise<EnrichmentStatusSummary> {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE enrichment_status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE enrichment_status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE enrichment_status = 'scraped') AS scraped,
        COUNT(*) FILTER (WHERE enrichment_status = 'db_matched') AS db_matched
      FROM ${TABLE}
    `);
    return {
      pending: parseInt(rows[0].pending, 10),
      processing: parseInt(rows[0].processing, 10),
      scraped: parseInt(rows[0].scraped, 10),
      db_matched: parseInt(rows[0].db_matched, 10),
    };
  }

  async resetAllEnrichmentData(limit?: number): Promise<void> {
    await this.pool.query(`
      UPDATE ${TABLE} SET
        industry = NULL, company_size = NULL, hq_city = NULL,
        hq_province = NULL, hq_country = NULL, exact_address = NULL,
        phone = NULL, contact_email = NULL, website = NULL,
        description = NULL, known_ats_portal = NULL, legal_name = NULL,
        enrichment_status = 'skipped', enriched_at = NULL, updated_at = NOW()
    `);
    if (limit && limit > 0) {
      await this.pool.query(
        `UPDATE ${TABLE} SET enrichment_status = 'pending'
         WHERE id IN (SELECT id FROM ${TABLE} ORDER BY created_at ASC LIMIT $1)`,
        [limit],
      );
    } else {
      await this.pool.query(`UPDATE ${TABLE} SET enrichment_status = 'pending'`);
    }
  }

  async logEmail(input: Record<string, any> & { mdirectorMessageId: string | null }): Promise<void> {
    await this.pool.query(
      `INSERT INTO email_logs (company_id, sent_by, to_email, to_name, subject, employee_type_id, employee_type_name, mdirector_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [input.companyId, input.sentByUserId, input.toEmail, input.toName ?? null,
       input.subject, input.employeeTypeId, input.employeeTypeName, input.mdirectorMessageId],
    );
  }

  async getEmailLogs(companyId: string): Promise<EmailLog[]> {
    const { rows } = await this.pool.query(
      `SELECT el.*, u.first_name || ' ' || u.last_name AS sent_by_name
       FROM email_logs el
       LEFT JOIN users u ON el.sent_by = u.id
       WHERE el.company_id = $1
       ORDER BY el.sent_at DESC
       LIMIT 50`,
      [companyId],
    );
    return rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      sentBy: r.sent_by,
      sentByName: r.sent_by_name ?? null,
      toEmail: r.to_email,
      toName: r.to_name,
      subject: r.subject,
      employeeTypeId: r.employee_type_id,
      employeeTypeName: r.employee_type_name,
      mdirectorMessageId: r.mdirector_message_id,
      sentAt: r.sent_at,
    }));
  }
}
