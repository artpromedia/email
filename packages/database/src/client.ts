/**
 * OonruMail Database - Client
 * PostgreSQL connection with Drizzle ORM
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

// ============================================================
// DATABASE CONFIGURATION
// ============================================================

export interface DatabaseConfig {
  /** PostgreSQL connection URL */
  connectionUrl: string;
  /** Maximum number of connections in the pool */
  maxConnections: number;
  /** Idle timeout in milliseconds */
  idleTimeout: number;
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Enable SSL */
  ssl: "require" | "prefer" | "allow" | "verify-full" | boolean;
  /** Prepare statements */
  prepare: boolean;
}

export function getDatabaseConfig(): DatabaseConfig {
  const connectionUrl = getRequiredEnv("DATABASE_URL");

  return {
    connectionUrl,
    maxConnections: parseInt(getOptionalEnv("DATABASE_MAX_CONNECTIONS", "10")),
    idleTimeout: parseInt(getOptionalEnv("DATABASE_IDLE_TIMEOUT", "20000")),
    connectTimeout: parseInt(getOptionalEnv("DATABASE_CONNECT_TIMEOUT", "10000")),
    ssl: getOptionalEnv("DATABASE_SSL", "prefer") as "require" | "prefer",
    prepare: getOptionalEnv("DATABASE_PREPARE", "true") === "true",
  };
}

// ============================================================
// CONNECTION MANAGEMENT
// ============================================================

let connectionInstance: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * Create a new PostgreSQL connection
 */
export function createConnection(config?: Partial<DatabaseConfig>): postgres.Sql {
  const fullConfig = { ...getDatabaseConfig(), ...config };

  return postgres(fullConfig.connectionUrl, {
    max: fullConfig.maxConnections,
    idle_timeout: fullConfig.idleTimeout,
    connect_timeout: fullConfig.connectTimeout,
    ssl: fullConfig.ssl,
    prepare: fullConfig.prepare,
    // Transform column names from snake_case to camelCase
    transform: {
      undefined: null,
    },
    onnotice: (notice) => {
      if (process.env["NODE_ENV"] === "development") {
        // eslint-disable-next-line no-console
        console.log("[DB Notice]", notice["message"]);
      }
    },
  });
}

/**
 * Create a Drizzle ORM instance with schema
 */
export function createDrizzle(connection: postgres.Sql) {
  return drizzle(connection, { schema });
}

/**
 * Get or create a singleton database connection
 */
export function getConnection(): postgres.Sql {
  connectionInstance ??= createConnection();
  return connectionInstance;
}

/**
 * Get or create a singleton Drizzle ORM instance
 */
export function getDatabase() {
  dbInstance ??= createDrizzle(getConnection());
  return dbInstance;
}

/**
 * Close the database connection
 */
export async function closeConnection(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.end();
    connectionInstance = null;
    dbInstance = null;
  }
}

// ============================================================
// TRANSACTION HELPERS
// ============================================================

export type Database = ReturnType<typeof getDatabase>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Execute a function within a transaction
 */
export async function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = getDatabase();
  return db.transaction(fn);
}

/**
 * Execute a function within a serializable transaction
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  return db.transaction(fn, {
    isolationLevel: "serializable",
  });
}

// ============================================================
// HEALTH CHECK
// ============================================================

export interface HealthCheckResult {
  connected: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

/**
 * Check database connection health
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const connection = getConnection();
    const result = await connection`SELECT version()`;
    const latencyMs = Date.now() - startTime;

    return {
      connected: true,
      latencyMs,
      version: result[0]?.["version"] as string,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      connected: false,
      latencyMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================

// Default export is the singleton database instance
export const db = getDatabase();

// Re-export schema for convenience
export { schema };
export * from "./schema";
