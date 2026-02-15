/**
 * Redis client singleton for shared Redis connections
 *
 * Provides a centralized Redis connection with:
 * - Connection pooling (handled by ioredis internally)
 * - Automatic reconnection
 * - Graceful error handling
 * - Fallback behavior when Redis is unavailable
 *
 * ioredis is a CJS module. Under ESM + NodeNext with verbatimModuleSyntax,
 * we use createRequire for correct CJS interop.
 */

import { createRequire } from "node:module";
import type { Redis, RedisOptions } from "ioredis";

const require = createRequire(import.meta.url);
const IORedis = require("ioredis") as new (
  urlOrOptions?: string | RedisOptions,
  options?: RedisOptions
) => Redis;

export type { Redis, RedisOptions } from "ioredis";

export interface RedisClientOptions {
  /** Redis connection URL (e.g., redis://localhost:6379) */
  url?: string;
  /** Redis host (used when url is not provided) */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number (default: 0) */
  db?: number;
  /** Key prefix for all operations */
  keyPrefix?: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
  /** Max retries per request (default: 3) */
  maxRetriesPerRequest?: number;
  /** Enable TLS (default: false) */
  tls?: boolean;
  /** Enable ready check (default: true) */
  enableReadyCheck?: boolean;
  /** Lazy connect - don't connect until first command (default: false) */
  lazyConnect?: boolean;
}

// Singleton instance
let instance: Redis | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
let lastError: Error | null = null;

/**
 * Get or create the Redis client singleton
 *
 * Uses environment variables for configuration:
 * - REDIS_URL: Full connection URL (takes precedence)
 * - REDIS_HOST: Hostname (default: localhost)
 * - REDIS_PORT: Port (default: 6379)
 * - REDIS_PASSWORD: Password
 * - REDIS_DB: Database number (default: 0)
 * - REDIS_KEY_PREFIX: Key prefix
 * - REDIS_TLS: Enable TLS (default: false)
 */
export function getRedisClient(options?: RedisClientOptions): Redis {
  if (instance) {
    return instance;
  }

  const config = resolveConfig(options);

  let client: Redis;

  if (config.url) {
    client = new IORedis(config.url, {
      ...(config.keyPrefix ? { keyPrefix: config.keyPrefix } : {}),
      connectTimeout: config.connectTimeout,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableReadyCheck: config.enableReadyCheck,
      lazyConnect: config.lazyConnect,
      retryStrategy: defaultRetryStrategy,
    });
  } else {
    const redisOptions: RedisOptions = {
      host: config.host,
      port: config.port,
      db: config.db,
      connectTimeout: config.connectTimeout,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableReadyCheck: config.enableReadyCheck,
      lazyConnect: config.lazyConnect,
      retryStrategy: defaultRetryStrategy,
    };

    if (config.password) {
      redisOptions.password = config.password;
    }

    if (config.keyPrefix) {
      redisOptions.keyPrefix = config.keyPrefix;
    }

    if (config.tls) {
      redisOptions.tls = {};
    }

    client = new IORedis(redisOptions);
  }

  instance = client;

  // Set up event handlers
  client.on("connect", () => {
    connectionStatus = "connecting";
  });

  client.on("ready", () => {
    connectionStatus = "connected";
    lastError = null;
    console.info("[Redis] Connected successfully");
  });

  client.on("error", (err: Error) => {
    connectionStatus = "error";
    lastError = err;
    console.error("[Redis] Connection error:", err.message);
  });

  client.on("close", () => {
    connectionStatus = "disconnected";
  });

  client.on("reconnecting", () => {
    connectionStatus = "connecting";
  });

  return client;
}

/**
 * Get the current connection status
 */
export function getRedisStatus(): {
  status: typeof connectionStatus;
  error: string | null;
  isReady: boolean;
} {
  return {
    status: connectionStatus,
    error: lastError?.message ?? null,
    isReady: connectionStatus === "connected",
  };
}

/**
 * Check if Redis is currently available
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (!instance) return false;
  try {
    await instance.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnect the Redis client
 * Call this during application shutdown
 */
export async function disconnectRedis(): Promise<void> {
  if (instance) {
    try {
      await instance.quit();
    } catch {
      // Force disconnect if graceful quit fails
      instance.disconnect();
    }
    instance = null;
    connectionStatus = "disconnected";
    lastError = null;
  }
}

/**
 * Reset the singleton (primarily for testing)
 */
export function resetRedisClient(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
  connectionStatus = "disconnected";
  lastError = null;
}

/**
 * Default retry strategy with exponential backoff
 * Gives up after ~30 seconds total retry time
 */
function defaultRetryStrategy(times: number): number | null {
  if (times > 10) {
    console.error(`[Redis] Max reconnection attempts (${times}) reached`);
    return null; // Stop retrying
  }
  // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms...
  const delay = Math.min(times * 200, 5000);
  return delay;
}

interface ResolvedConfig {
  url: string | undefined;
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  keyPrefix: string | undefined;
  connectTimeout: number;
  maxRetriesPerRequest: number;
  tls: boolean;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
}

/**
 * Resolve configuration from options and environment variables
 */
function resolveConfig(options?: RedisClientOptions): ResolvedConfig {
  return {
    url: options?.url ?? getEnv("REDIS_URL"),
    host: options?.host ?? getEnv("REDIS_HOST") ?? "localhost",
    port: options?.port ?? Number.parseInt(getEnv("REDIS_PORT") ?? "6379", 10),
    password: options?.password ?? getEnv("REDIS_PASSWORD"),
    db: options?.db ?? Number.parseInt(getEnv("REDIS_DB") ?? "0", 10),
    keyPrefix: options?.keyPrefix ?? getEnv("REDIS_KEY_PREFIX"),
    connectTimeout: options?.connectTimeout ?? 5000,
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? 3,
    tls: options?.tls ?? getEnv("REDIS_TLS") === "true",
    enableReadyCheck: options?.enableReadyCheck ?? true,
    lazyConnect: options?.lazyConnect ?? false,
  };
}

/**
 * Safe environment variable access (works in Node.js and edge runtimes)
 */
function getEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  try {
    return process.env[key];
  } catch {
    return undefined;
  }
}
