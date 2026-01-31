/**
 * Enterprise Email Database - Replication Support
 * Read/Write splitting and replica management
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ============================================================
// REPLICATION CONFIGURATION
// ============================================================

export interface ReplicaConfig {
  /** Replica name for identification */
  name: string;
  /** Connection URL for the replica */
  connectionUrl: string;
  /** Weight for load balancing (higher = more traffic) */
  weight: number;
  /** Maximum connections for this replica */
  maxConnections: number;
  /** Is this replica healthy? */
  healthy: boolean;
}

export interface ReplicationConfig {
  /** Primary database connection URL */
  primaryUrl: string;
  /** Replica database configurations */
  replicas: ReplicaConfig[];
  /** Maximum connections for primary */
  primaryMaxConnections: number;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Idle timeout in milliseconds */
  idleTimeout: number;
  /** SSL mode */
  ssl: "require" | "prefer" | "allow" | "verify-full" | boolean;
}

export function getReplicationConfig(): ReplicationConfig {
  const primaryUrl = process.env["DATABASE_URL"];
  if (!primaryUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  // Parse replica URLs from environment
  const replicas: ReplicaConfig[] = [];
  const replicaUrls = process.env["DATABASE_REPLICA_URLS"]?.split(",") ?? [];

  replicaUrls.forEach((url, index) => {
    if (url.trim()) {
      replicas.push({
        name: `replica_${index + 1}`,
        connectionUrl: url.trim(),
        weight: 1,
        maxConnections: parseInt(process.env["DATABASE_REPLICA_MAX_CONNECTIONS"] ?? "5"),
        healthy: true,
      });
    }
  });

  return {
    primaryUrl,
    replicas,
    primaryMaxConnections: parseInt(process.env["DATABASE_MAX_CONNECTIONS"] ?? "10"),
    healthCheckInterval: parseInt(process.env["DATABASE_HEALTH_CHECK_INTERVAL"] ?? "30000"),
    connectTimeout: parseInt(process.env["DATABASE_CONNECT_TIMEOUT"] ?? "10000"),
    idleTimeout: parseInt(process.env["DATABASE_IDLE_TIMEOUT"] ?? "20000"),
    ssl: (process.env["DATABASE_SSL"] ?? "prefer") as "require" | "prefer",
  };
}

// ============================================================
// REPLICA POOL
// ============================================================

interface ReplicaConnection {
  config: ReplicaConfig;
  connection: postgres.Sql;
  db: ReturnType<typeof drizzle>;
  lastHealthCheck: Date;
  consecutiveFailures: number;
}

class ReplicaPool {
  private replicas: ReplicaConnection[] = [];
  private currentIndex: number = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ReplicationConfig,
    private readonly onHealthChange?: (replica: string, healthy: boolean) => void
  ) {}

  /**
   * Initialize the replica pool
   */
  async initialize(): Promise<void> {
    for (const replicaConfig of this.config.replicas) {
      try {
        const connection = postgres(replicaConfig.connectionUrl, {
          max: replicaConfig.maxConnections,
          connect_timeout: this.config.connectTimeout,
          idle_timeout: this.config.idleTimeout,
          ssl: this.config.ssl,
          prepare: true,
        });

        const db = drizzle(connection, { schema });

        this.replicas.push({
          config: replicaConfig,
          connection,
          db,
          lastHealthCheck: new Date(),
          consecutiveFailures: 0,
        });
      } catch (error) {
        console.error(`Failed to initialize replica ${replicaConfig.name}:`, error);
      }
    }

    // Start health checking
    this.startHealthChecks();
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all replicas
   */
  async checkHealth(): Promise<void> {
    for (const replica of this.replicas) {
      try {
        const startTime = Date.now();
        await replica.connection`SELECT 1`;
        const latency = Date.now() - startTime;

        if (!replica.config.healthy) {
          replica.config.healthy = true;
          replica.consecutiveFailures = 0;
          this.onHealthChange?.(replica.config.name, true);
          console.log(`Replica ${replica.config.name} is now healthy (latency: ${latency}ms)`);
        }

        replica.lastHealthCheck = new Date();
      } catch (error) {
        replica.consecutiveFailures++;

        if (replica.consecutiveFailures >= 3 && replica.config.healthy) {
          replica.config.healthy = false;
          this.onHealthChange?.(replica.config.name, false);
          console.error(`Replica ${replica.config.name} marked unhealthy after ${replica.consecutiveFailures} failures`);
        }
      }
    }
  }

  /**
   * Get a healthy replica using weighted round-robin
   */
  getReadReplica(): ReturnType<typeof drizzle> | null {
    const healthyReplicas = this.replicas.filter(r => r.config.healthy);

    if (healthyReplicas.length === 0) {
      return null;
    }

    // Weighted round-robin selection
    let totalWeight = 0;
    for (const replica of healthyReplicas) {
      totalWeight += replica.config.weight;
    }

    this.currentIndex = (this.currentIndex + 1) % totalWeight;

    let currentWeight = 0;
    for (const replica of healthyReplicas) {
      currentWeight += replica.config.weight;
      if (this.currentIndex < currentWeight) {
        return replica.db;
      }
    }

    // Fallback to first healthy replica
    return healthyReplicas[0].db;
  }

  /**
   * Get all healthy replicas
   */
  getHealthyReplicas(): ReturnType<typeof drizzle>[] {
    return this.replicas
      .filter(r => r.config.healthy)
      .map(r => r.db);
  }

  /**
   * Get replica status
   */
  getStatus(): { name: string; healthy: boolean; lastCheck: Date; failures: number }[] {
    return this.replicas.map(r => ({
      name: r.config.name,
      healthy: r.config.healthy,
      lastCheck: r.lastHealthCheck,
      failures: r.consecutiveFailures,
    }));
  }

  /**
   * Close all replica connections
   */
  async close(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    for (const replica of this.replicas) {
      try {
        await replica.connection.end();
      } catch (error) {
        console.error(`Error closing replica ${replica.config.name}:`, error);
      }
    }

    this.replicas = [];
  }
}

// ============================================================
// REPLICATION-AWARE DATABASE CLIENT
// ============================================================

export class ReplicationClient {
  private primaryConnection: postgres.Sql | null = null;
  private primaryDb: ReturnType<typeof drizzle> | null = null;
  private replicaPool: ReplicaPool | null = null;
  private config: ReplicationConfig;

  constructor(config?: Partial<ReplicationConfig>) {
    this.config = { ...getReplicationConfig(), ...config };
  }

  /**
   * Initialize the replication client
   */
  async initialize(): Promise<void> {
    // Initialize primary connection
    this.primaryConnection = postgres(this.config.primaryUrl, {
      max: this.config.primaryMaxConnections,
      connect_timeout: this.config.connectTimeout,
      idle_timeout: this.config.idleTimeout,
      ssl: this.config.ssl,
      prepare: true,
    });

    this.primaryDb = drizzle(this.primaryConnection, { schema });

    // Initialize replica pool if replicas are configured
    if (this.config.replicas.length > 0) {
      this.replicaPool = new ReplicaPool(this.config, (replica, healthy) => {
        console.log(`Replica ${replica} health changed to ${healthy}`);
      });
      await this.replicaPool.initialize();
    }
  }

  /**
   * Get the primary database for writes
   */
  getPrimary(): ReturnType<typeof drizzle> {
    if (!this.primaryDb) {
      throw new Error("ReplicationClient not initialized. Call initialize() first.");
    }
    return this.primaryDb;
  }

  /**
   * Get a read replica or fall back to primary
   */
  getReadReplica(): ReturnType<typeof drizzle> {
    if (!this.primaryDb) {
      throw new Error("ReplicationClient not initialized. Call initialize() first.");
    }

    // Try to get a healthy replica
    const replica = this.replicaPool?.getReadReplica();

    // Fall back to primary if no healthy replicas
    return replica ?? this.primaryDb;
  }

  /**
   * Execute a read query on a replica
   */
  async read<T>(queryFn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
    const db = this.getReadReplica();
    return queryFn(db);
  }

  /**
   * Execute a write query on the primary
   */
  async write<T>(queryFn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
    const db = this.getPrimary();
    return queryFn(db);
  }

  /**
   * Execute a transaction on the primary
   */
  async transaction<T>(
    fn: (tx: Parameters<Parameters<ReturnType<typeof drizzle>["transaction"]>[0]>[0]) => Promise<T>
  ): Promise<T> {
    const db = this.getPrimary();
    return db.transaction(fn);
  }

  /**
   * Get replication status
   */
  getStatus(): {
    primary: { connected: boolean };
    replicas: { name: string; healthy: boolean; lastCheck: Date; failures: number }[];
  } {
    return {
      primary: { connected: !!this.primaryDb },
      replicas: this.replicaPool?.getStatus() ?? [],
    };
  }

  /**
   * Check health of primary
   */
  async healthCheck(): Promise<{
    primary: { healthy: boolean; latencyMs: number };
    replicas: { name: string; healthy: boolean }[];
  }> {
    const result = {
      primary: { healthy: false, latencyMs: 0 },
      replicas: [] as { name: string; healthy: boolean }[],
    };

    // Check primary
    if (this.primaryConnection) {
      try {
        const startTime = Date.now();
        await this.primaryConnection`SELECT 1`;
        result.primary = {
          healthy: true,
          latencyMs: Date.now() - startTime,
        };
      } catch {
        result.primary.healthy = false;
      }
    }

    // Get replica status
    result.replicas = this.replicaPool?.getStatus().map(r => ({
      name: r.name,
      healthy: r.healthy,
    })) ?? [];

    return result;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.replicaPool?.close();

    if (this.primaryConnection) {
      await this.primaryConnection.end();
      this.primaryConnection = null;
      this.primaryDb = null;
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let replicationClientInstance: ReplicationClient | null = null;

/**
 * Get or create the replication client singleton
 */
export async function getReplicationClient(): Promise<ReplicationClient> {
  if (!replicationClientInstance) {
    replicationClientInstance = new ReplicationClient();
    await replicationClientInstance.initialize();
  }
  return replicationClientInstance;
}

/**
 * Close the replication client singleton
 */
export async function closeReplicationClient(): Promise<void> {
  if (replicationClientInstance) {
    await replicationClientInstance.close();
    replicationClientInstance = null;
  }
}

// ============================================================
// REPLICATION LAG MONITORING
// ============================================================

export interface ReplicationLag {
  replicaName: string;
  lagBytes: number;
  lagSeconds: number | null;
  state: string;
}

/**
 * Get replication lag from the primary server
 */
export async function getReplicationLag(
  primaryConnection: postgres.Sql
): Promise<ReplicationLag[]> {
  const result = await primaryConnection`
    SELECT
      application_name as replica_name,
      pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as lag_bytes,
      EXTRACT(EPOCH FROM replay_lag)::float as lag_seconds,
      state
    FROM pg_stat_replication
  `;

  return result.map((row) => ({
    replicaName: row["replica_name"] as string,
    lagBytes: Number(row["lag_bytes"]),
    lagSeconds: row["lag_seconds"] as number | null,
    state: row["state"] as string,
  }));
}

/**
 * Check if replication is healthy (lag within acceptable limits)
 */
export async function isReplicationHealthy(
  primaryConnection: postgres.Sql,
  maxLagBytes: number = 1024 * 1024 * 10, // 10MB default
  maxLagSeconds: number = 30 // 30 seconds default
): Promise<boolean> {
  const lags = await getReplicationLag(primaryConnection);

  for (const lag of lags) {
    if (lag.lagBytes > maxLagBytes) {
      console.warn(`Replica ${lag.replicaName} lag too high: ${lag.lagBytes} bytes`);
      return false;
    }

    if (lag.lagSeconds !== null && lag.lagSeconds > maxLagSeconds) {
      console.warn(`Replica ${lag.replicaName} lag too high: ${lag.lagSeconds} seconds`);
      return false;
    }
  }

  return true;
}
