/**
 * OonruMail Database - Main Export
 * @email/database package entry point
 */

// Database client and connection
export {
  db,
  getDatabase,
  getConnection,
  createConnection,
  createDrizzle,
  closeConnection,
  withTransaction,
  withSerializableTransaction,
  healthCheck,
  getDatabaseConfig,
  type Database,
  type Transaction,
  type DatabaseConfig,
  type HealthCheckResult,
} from "./client";

// Schema exports
export * from "./schema";

// Migration utilities
export {
  runMigrations,
  getMigrationStatus,
  resetDatabase,
  getDefaultMigrationConfig,
  type MigrationConfig,
} from "./migrate";

// Seed utilities
export { seed } from "./seed";

// Replication support
export {
  ReplicationClient,
  getReplicationClient,
  closeReplicationClient,
  getReplicationLag,
  isReplicationHealthy,
  type ReplicationConfig,
  type ReplicaConfig,
  type ReplicationLag,
} from "./replication";

// Re-export drizzle-orm utilities for convenience
export {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  ilike,
  and,
  or,
  not,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  between,
  sql,
  desc,
  asc,
  count,
  sum,
  avg,
  min,
  max,
} from "drizzle-orm";
