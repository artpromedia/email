/**
 * Database connection singleton for server-side routes
 * Uses postgres.js (same driver as @email/database package)
 */
import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url =
      process.env["DATABASE_URL"] ||
      "postgres://oonrumail:lBIkhjAXmPfAmgx5ED1rKoHQyMgXUn@postgres:5432/oonrumail";
    _sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }
  return _sql;
}

export type Sql = ReturnType<typeof postgres>;
