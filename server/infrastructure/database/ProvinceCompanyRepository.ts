import type { Pool } from 'pg';

export type ProvinceTable = 'ontario_companies' | 'quebec_companies';
export type ProvinceSource = 'ontario' | 'quebec';

export interface ProvinceCompany {
  id: string;
  nombre: string;
  telefono: string | null;
  tipo: string | null;
  correo: string | null;
  direccion: string | null;
  provincia: string | null;
  region: string | null;
  ciudad: string | null;
  pueblo: string | null;
  work: string | null;
  descripcion: string | null;
  dominio_de_pagina: string | null;
  lista_de_llamadas: string | null;
  is_duplicate: boolean;
  status: string;
  slug: string | null;
  enrichment_status: string | null;
  enrichment_provider: string | null;
  enriched_at: Date | null;
  sheets_exported_at: Date | null;
  suggested_services: any;
  suggested_services_at: Date | null;
  industry: string | null;
  company_size: string | null;
  email_status: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_status: string | null;
  created_at: Date;
  updated_at: Date;
}

export class ProvinceCompanyRepository {
  constructor(private readonly pool: Pool) {}

  async findByName(companyName: string): Promise<{ id: string; table: ProvinceTable; src: ProvinceSource } | null> {
    const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nameNorm = companyName.trim().toLowerCase();

    for (const [table, src] of [['ontario_companies', 'ontario'], ['quebec_companies', 'quebec']] as const) {
      const found = await this.pool.query(
        `SELECT id FROM ${table} WHERE slug = $1 OR LOWER(TRIM(nombre)) = $2 LIMIT 1`,
        [slug, nameNorm],
      );
      if (found.rows.length > 0) return { id: found.rows[0].id, table, src: src as ProvinceSource };
    }
    return null;
  }

  async findBySlug(table: ProvinceTable, slug: string): Promise<ProvinceCompany | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${table} WHERE slug = $1`, [slug]);
    return rows[0] ?? null;
  }

  async findById(table: ProvinceTable, id: string): Promise<ProvinceCompany | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(table: ProvinceTable, limit = 500, offset = 0): Promise<ProvinceCompany[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  }

  async insert(table: ProvinceTable, data: Record<string, any>): Promise<ProvinceCompany | null> {
    const keys = Object.keys(data);
    const cols = keys.map(k => `"${k}"`);
    const vals = keys.map((_, i) => `$${i + 1}`);
    const { rows } = await this.pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING RETURNING *`,
      Object.values(data),
    );
    return rows[0] ?? null;
  }

  async updateStatus(table: ProvinceTable, id: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${table} SET enrichment_status = $2, updated_at = NOW() WHERE id = $1`,
      [id, status],
    );
  }

  async countPending(table: ProvinceTable): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) FROM ${table} WHERE enrichment_status = 'pending'`,
    );
    return parseInt(rows[0].count, 10);
  }
}
