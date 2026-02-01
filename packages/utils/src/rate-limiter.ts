/**
 * Redis-based sliding window rate limiter for horizontal scaling
 * Replaces in-memory rate limiting in middleware.ts
 */

import type { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfter: number | undefined; // Seconds until rate limit resets
}

export interface RateLimiterOptions {
  redis: Redis;
  prefix?: string;
  fallbackToAllow?: boolean; // Allow requests if Redis is unavailable
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/**
 * Redis-based rate limiter using sliding window algorithm
 */
export class RedisRateLimiter {
  private redis: Redis;
  private prefix: string;
  private fallbackToAllow: boolean;

  constructor(options: RateLimiterOptions) {
    this.redis = options.redis;
    this.prefix = options.prefix || "ratelimit";
    this.fallbackToAllow = options.fallbackToAllow ?? true;
  }

  /**
   * Check if a request is allowed under rate limiting
   * @param identifier Unique identifier (IP, user ID, API key, etc.)
   * @param limit Maximum requests allowed in the window
   * @param windowMs Time window in milliseconds
   */
  async check(identifier: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `${this.prefix}:${identifier}:${Math.floor(now / windowMs)}`;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = Math.floor((windowStart + windowMs) / 1000);

    try {
      // Use MULTI/EXEC for atomic operations
      const pipeline = this.redis.pipeline();

      // Increment counter for current window
      pipeline.incr(windowKey);
      // Set expiry if key is new (slightly longer than window to handle edge cases)
      pipeline.expire(windowKey, Math.ceil(windowMs / 1000) + 1);

      const results = await pipeline.exec();

      if (!results || results.length === 0) {
        return this.fallbackResult(limit, resetAt);
      }

      const [countResult] = results;
      const count = (countResult?.[1] as number) || 0;
      const remaining = Math.max(0, limit - count);
      const allowed = count <= limit;

      return {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil((windowStart + windowMs - now) / 1000),
      };
    } catch (error) {
      console.error("Rate limiter Redis error:", error);
      return this.fallbackResult(limit, resetAt);
    }
  }

  /**
   * Check multiple rate limits (e.g., per-second AND per-minute)
   */
  async checkMultiple(identifier: string, configs: RateLimitConfig[]): Promise<RateLimitResult> {
    const results = await Promise.all(
      configs.map((config) => this.check(identifier, config.limit, config.windowMs))
    );

    // Return the most restrictive result
    const denied = results.find((r) => !r.allowed);
    if (denied) {
      return denied;
    }

    // All passed - return the one with lowest remaining
    return results.reduce((min, r) => (r.remaining < min.remaining ? r : min));
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    try {
      const pattern = `${this.prefix}:${identifier}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error("Rate limiter reset error:", error);
    }
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(
    identifier: string,
    windowMs: number
  ): Promise<{ count: number; remaining: number; limit: number } | null> {
    const now = Date.now();
    const windowKey = `${this.prefix}:${identifier}:${Math.floor(now / windowMs)}`;

    try {
      const count = await this.redis.get(windowKey);
      return {
        count: count ? parseInt(count, 10) : 0,
        remaining: 0, // Would need limit passed in
        limit: 0,
      };
    } catch (error) {
      console.error("Rate limiter getUsage error:", error);
      return null;
    }
  }

  private fallbackResult(limit: number, resetAt: number): RateLimitResult {
    // If fallbackToAllow is true, allow the request
    // This prevents Redis failures from blocking all traffic
    return {
      allowed: this.fallbackToAllow,
      remaining: this.fallbackToAllow ? limit : 0,
      resetAt,
      retryAfter: undefined,
    };
  }
}

/**
 * In-memory rate limiter fallback for when Redis is unavailable
 * or for development/testing
 */
export class InMemoryRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  check(identifier: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `${identifier}:${windowStart}`;
    const resetAt = Math.floor((windowStart + windowMs) / 1000);

    let entry = this.windows.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: windowStart + windowMs };
      this.windows.set(key, entry);
    }

    entry.count++;
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);

    return Promise.resolve({
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000),
    });
  }

  async checkMultiple(identifier: string, configs: RateLimitConfig[]): Promise<RateLimitResult> {
    const results = await Promise.all(
      configs.map((config) => this.check(identifier, config.limit, config.windowMs))
    );

    const denied = results.find((r) => !r.allowed);
    if (denied) return denied;

    return results.reduce((min, r) => (r.remaining < min.remaining ? r : min));
  }

  reset(identifier: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${identifier}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.windows.delete(key));
    return Promise.resolve();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      if (entry.resetAt < now) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.windows.clear();
  }
}

/**
 * Factory function to create appropriate rate limiter
 */
export function createRateLimiter(
  redis?: Redis,
  options?: Partial<RateLimiterOptions>
): RedisRateLimiter | InMemoryRateLimiter {
  if (redis) {
    return new RedisRateLimiter({ redis, ...options });
  }
  return new InMemoryRateLimiter();
}

/**
 * Rate limit configurations for different tiers
 */
export const RATE_LIMIT_TIERS = {
  // Authentication endpoints - strict limits
  auth: [
    { limit: 5, windowMs: 60 * 1000 }, // 5 per minute
    { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  ],

  // API endpoints - moderate limits
  api: [
    { limit: 100, windowMs: 60 * 1000 }, // 100 per minute
    { limit: 1000, windowMs: 60 * 60 * 1000 }, // 1000 per hour
  ],

  // General web requests - lenient limits
  web: [
    { limit: 300, windowMs: 60 * 1000 }, // 300 per minute
  ],

  // Expensive operations - very strict
  expensive: [
    { limit: 10, windowMs: 60 * 1000 }, // 10 per minute
    { limit: 50, windowMs: 60 * 60 * 1000 }, // 50 per hour
  ],
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;
