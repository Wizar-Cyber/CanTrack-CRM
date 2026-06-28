import type { Pool, QueryResultRow } from 'pg';

/**
 * Abstract base repository providing common CRUD operations.
 * All database repositories should extend this class.
 * Manages parameterized queries for safe SQL execution.
 */
export abstract class BaseRepository<T extends { id: string }> {
  constructor(protected readonly pool: Pool) {}

  /** Find a record by its UUID */
  protected async findById(table: string, id: string): Promise<T | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** List all records from a table with optional ordering */
  protected async findAllByTable(table: string, orderBy = 'created_at DESC'): Promise<T[]> {
    const { rows } = await this.pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    return rows;
  }

  /** Insert a new record and return the created entity */
  protected async createReturning(table: string, data: Record<string, any>): Promise<T> {
    const keys = Object.keys(data);
    const cols = keys.map(k => `"${k}"`);
    const vals = keys.map((_, i) => `$${i + 1}`);
    const { rows } = await this.pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
      Object.values(data),
    );
    return rows[0];
  }

  /** Update a record and return the updated entity */
  protected async updateReturning(table: string, id: string, fields: Record<string, any>): Promise<T | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(table, id);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => fields[k])],
    );
    return rows[0] ?? null;
  }

  /** Delete a record and return whether it existed */
  protected async deleteById(table: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  protected rowToCamel<R extends QueryResultRow>(row: R): R {
    return row;
  }
}
