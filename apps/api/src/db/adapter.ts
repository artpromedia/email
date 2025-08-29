export interface QueryResult {
  rows: any[];
  rowCount: number;
}

export interface DatabaseAdapter {
  query(text: string, params?: any[]): Promise<QueryResult>;
  transaction<T>(fn: (client: DatabaseAdapter) => Promise<T>): Promise<T>;
}

export class PostgresAdapter implements DatabaseAdapter {
  constructor(private pool: any) {}

  async query(text: string, params?: any[]): Promise<QueryResult> {
    const result = await this.pool.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount
    };
  }

  async transaction<T>(fn: (client: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const adapter = new PostgresAdapter(client);
      const result = await fn(adapter);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
