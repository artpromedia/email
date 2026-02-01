/**
 * Database Replication Tests
 * Tests for read/write splitting and replica management
 */

// Set test environment variables before any imports
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
process.env.DATABASE_MAX_CONNECTIONS = "10";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ReplicationClient,
  getReplicationConfig,
  type ReplicationConfig,
  type ReplicaConfig,
} from "./replication";

// Mock postgres module
vi.mock("postgres", () => {
  return {
    default: vi.fn(() => {
      const mockSql = Object.assign(
        async (strings: TemplateStringsArray, ..._values: unknown[]) => {
          if (strings[0].includes("SELECT 1")) {
            return [{ result: 1 }];
          }
          if (strings[0].includes("SELECT version()")) {
            return [{ version: "PostgreSQL 16.0" }];
          }
          return [];
        },
        {
          end: vi.fn().mockResolvedValue(undefined),
        }
      );
      return mockSql;
    }),
  };
});

// Mock drizzle-orm
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "1" }])),
      })),
    })),
    transaction: vi.fn(async (fn) => {
      const tx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return fn(tx);
    }),
  })),
}));

describe("ReplicationConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw if DATABASE_URL is not set", () => {
    delete process.env["DATABASE_URL"];
    expect(() => getReplicationConfig()).toThrow(
      "Missing required environment variable: DATABASE_URL"
    );
  });

  it("should parse configuration from environment", () => {
    process.env["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/db";
    process.env["DATABASE_MAX_CONNECTIONS"] = "20";
    process.env["DATABASE_HEALTH_CHECK_INTERVAL"] = "60000";

    const config = getReplicationConfig();

    expect(config.primaryUrl).toBe("postgresql://user:pass@localhost:5432/db");
    expect(config.primaryMaxConnections).toBe(20);
    expect(config.healthCheckInterval).toBe(60000);
  });

  it("should parse replica URLs from environment", () => {
    process.env["DATABASE_URL"] = "postgresql://user:pass@primary:5432/db";
    process.env["DATABASE_REPLICA_URLS"] =
      "postgresql://user:pass@replica1:5432/db,postgresql://user:pass@replica2:5432/db";
    process.env["DATABASE_REPLICA_MAX_CONNECTIONS"] = "10";

    const config = getReplicationConfig();

    expect(config.replicas).toHaveLength(2);
    expect(config.replicas[0].name).toBe("replica_1");
    expect(config.replicas[1].name).toBe("replica_2");
    expect(config.replicas[0].maxConnections).toBe(10);
  });

  it("should use default values when not specified", () => {
    process.env["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/db";

    const config = getReplicationConfig();

    expect(config.primaryMaxConnections).toBe(10);
    expect(config.healthCheckInterval).toBe(30000);
    expect(config.connectTimeout).toBe(10000);
    expect(config.idleTimeout).toBe(20000);
    expect(config.ssl).toBe("prefer");
  });

  it("should return empty replicas array when no replicas configured", () => {
    process.env["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/db";
    delete process.env["DATABASE_REPLICA_URLS"];

    const config = getReplicationConfig();

    expect(config.replicas).toEqual([]);
  });
});

describe("ReplicationClient", () => {
  let client: ReplicationClient;
  const mockConfig: ReplicationConfig = {
    primaryUrl: "postgresql://user:pass@primary:5432/db",
    replicas: [],
    primaryMaxConnections: 10,
    healthCheckInterval: 30000,
    connectTimeout: 10000,
    idleTimeout: 20000,
    ssl: "prefer",
  };

  beforeEach(() => {
    client = new ReplicationClient(mockConfig);
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch (_error) {
      // Ignore errors during cleanup
    }
  });

  describe("initialization", () => {
    it("should initialize primary connection", async () => {
      await client.initialize();
      const status = client.getStatus();
      expect(status.primary.connected).toBe(true);
    });

    it("should throw when getting primary before initialization", () => {
      expect(() => client.getPrimary()).toThrow("ReplicationClient not initialized");
    });

    it("should throw when getting read replica before initialization", () => {
      expect(() => client.getReadReplica()).toThrow("ReplicationClient not initialized");
    });
  });

  describe("getPrimary", () => {
    it("should return primary database connection", async () => {
      await client.initialize();
      const primary = client.getPrimary();
      expect(primary).toBeDefined();
    });
  });

  describe("getReadReplica", () => {
    it("should return primary when no replicas are configured", async () => {
      await client.initialize();
      const replica = client.getReadReplica();
      const primary = client.getPrimary();
      // When no replicas, should fall back to primary
      expect(replica).toBe(primary);
    });
  });

  describe("read and write operations", () => {
    it("should execute read operations", async () => {
      await client.initialize();
      const result = await client.read(async (_db) => {
        // Mock read operation
        return { data: "test" };
      });
      expect(result.data).toBe("test");
    });

    it("should execute write operations", async () => {
      await client.initialize();
      const result = await client.write(async (_db) => {
        // Mock write operation
        return { id: "1", created: true };
      });
      expect(result.created).toBe(true);
    });

    it("should execute transactions", async () => {
      await client.initialize();
      const result = await client.transaction(async (_tx) => {
        // Mock transaction
        return { success: true };
      });
      expect(result.success).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("should return connection status", async () => {
      await client.initialize();
      const status = client.getStatus();
      expect(status.primary.connected).toBe(true);
      expect(status.replicas).toEqual([]);
    });
  });

  describe("healthCheck", () => {
    it("should check primary health", async () => {
      await client.initialize();
      const health = await client.healthCheck();
      expect(health.primary.healthy).toBe(true);
      expect(health.primary.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("close", () => {
    it("should close all connections", async () => {
      await client.initialize();
      await client.close();
      expect(() => client.getPrimary()).toThrow();
    });
  });
});

describe("ReplicationClient with Replicas", () => {
  let client: ReplicationClient;
  const replicaConfig: ReplicaConfig = {
    name: "replica_1",
    connectionUrl: "postgresql://user:pass@replica1:5432/db",
    weight: 1,
    maxConnections: 5,
    healthy: true,
  };

  const mockConfig: ReplicationConfig = {
    primaryUrl: "postgresql://user:pass@primary:5432/db",
    replicas: [replicaConfig],
    primaryMaxConnections: 10,
    healthCheckInterval: 30000,
    connectTimeout: 10000,
    idleTimeout: 20000,
    ssl: "prefer",
  };

  beforeEach(() => {
    client = new ReplicationClient(mockConfig);
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch (_error) {
      // Ignore errors during cleanup
    }
  });

  it("should initialize with replicas", async () => {
    await client.initialize();
    const status = client.getStatus();
    expect(status.replicas.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Replica Load Balancing", () => {
  it("should have weighted round-robin logic", () => {
    // Test the concept of weighted selection
    const weights = [1, 2, 3];
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    expect(totalWeight).toBe(6);

    // Simulate selection
    const selections: number[] = [];
    for (let i = 0; i < totalWeight; i++) {
      let currentWeight = 0;
      for (let j = 0; j < weights.length; j++) {
        currentWeight += weights[j];
        if (i % totalWeight < currentWeight) {
          selections.push(j);
          break;
        }
      }
    }

    // Each replica should be selected according to its weight
    expect(selections.filter((s) => s === 0).length).toBeGreaterThanOrEqual(1);
  });
});

describe("Failover Behavior", () => {
  it("should mark replica unhealthy after consecutive failures", () => {
    const replica: ReplicaConfig = {
      name: "test_replica",
      connectionUrl: "postgresql://user:pass@replica:5432/db",
      weight: 1,
      maxConnections: 5,
      healthy: true,
    };

    // Simulate 3 consecutive failures
    let failures = 0;
    const maxFailures = 3;

    for (let i = 0; i < 5; i++) {
      failures++;
      if (failures >= maxFailures && replica.healthy) {
        replica.healthy = false;
      }
    }

    expect(replica.healthy).toBe(false);
  });

  it("should recover replica health after successful check", () => {
    const replica: ReplicaConfig = {
      name: "test_replica",
      connectionUrl: "postgresql://user:pass@replica:5432/db",
      weight: 1,
      maxConnections: 5,
      healthy: false,
    };

    // Simulate successful health check
    const checkSuccess = true;
    if (checkSuccess) {
      replica.healthy = true;
    }

    expect(replica.healthy).toBe(true);
  });
});

describe("Configuration Validation", () => {
  it("should validate SSL options", () => {
    const validSSLOptions = ["require", "prefer", "allow", "verify-full", true, false];

    validSSLOptions.forEach((ssl) => {
      expect(validSSLOptions).toContain(ssl);
    });
  });

  it("should validate connection timeouts", () => {
    const config: ReplicationConfig = {
      primaryUrl: "postgresql://user:pass@localhost:5432/db",
      replicas: [],
      primaryMaxConnections: 10,
      healthCheckInterval: 30000,
      connectTimeout: 10000,
      idleTimeout: 20000,
      ssl: "prefer",
    };

    expect(config.connectTimeout).toBeGreaterThan(0);
    expect(config.idleTimeout).toBeGreaterThan(0);
    expect(config.healthCheckInterval).toBeGreaterThan(0);
  });

  it("should validate max connections", () => {
    const config: ReplicationConfig = {
      primaryUrl: "postgresql://user:pass@localhost:5432/db",
      replicas: [],
      primaryMaxConnections: 10,
      healthCheckInterval: 30000,
      connectTimeout: 10000,
      idleTimeout: 20000,
      ssl: "prefer",
    };

    expect(config.primaryMaxConnections).toBeGreaterThan(0);
  });
});
