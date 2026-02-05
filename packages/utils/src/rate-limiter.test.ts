import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InMemoryRateLimiter, RATE_LIMIT_TIERS } from "./rate-limiter";

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe("check", () => {
    it("allows requests within limit", async () => {
      const result = await limiter.check("test-id", 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfter).toBeUndefined();
    });

    it("blocks requests over limit", async () => {
      const identifier = "blocked-id";
      const limit = 3;
      const windowMs = 60000;

      // Make requests up to and over limit
      await limiter.check(identifier, limit, windowMs);
      await limiter.check(identifier, limit, windowMs);
      await limiter.check(identifier, limit, windowMs);

      const result = await limiter.check(identifier, limit, windowMs);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("resets after window expires", async () => {
      const identifier = "window-test";
      const windowMs = 100; // 100ms window for faster test

      // Exhaust limit
      await limiter.check(identifier, 2, windowMs);
      await limiter.check(identifier, 2, windowMs);
      const blocked = await limiter.check(identifier, 2, windowMs);
      expect(blocked.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      const allowed = await limiter.check(identifier, 2, windowMs);
      expect(allowed.allowed).toBe(true);
    });

    it("tracks different identifiers separately", async () => {
      const limit = 2;
      const windowMs = 60000;

      // Exhaust limit for user1
      await limiter.check("user1", limit, windowMs);
      await limiter.check("user1", limit, windowMs);
      const user1Result = await limiter.check("user1", limit, windowMs);

      // user2 should still be allowed
      const user2Result = await limiter.check("user2", limit, windowMs);

      expect(user1Result.allowed).toBe(false);
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe("checkMultiple", () => {
    it("applies all rate limits", async () => {
      const identifier = "multi-limit";
      const configs = [
        { limit: 5, windowMs: 1000 }, // 5 per second
        { limit: 10, windowMs: 60000 }, // 10 per minute
      ];

      const result = await limiter.checkMultiple(identifier, configs);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThanOrEqual(4); // 5-1 or 10-1
    });

    it("returns most restrictive limit when exceeded", async () => {
      const identifier = "strict-limit";
      const configs = [
        { limit: 2, windowMs: 60000 }, // Strict: 2 per minute
        { limit: 100, windowMs: 60000 }, // Lenient: 100 per minute
      ];

      // Exhaust strict limit
      await limiter.checkMultiple(identifier, configs);
      await limiter.checkMultiple(identifier, configs);
      const result = await limiter.checkMultiple(identifier, configs);

      expect(result.allowed).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears rate limit for identifier", async () => {
      const identifier = "reset-test";

      // Exhaust limit
      await limiter.check(identifier, 1, 60000);
      const blocked = await limiter.check(identifier, 1, 60000);
      expect(blocked.allowed).toBe(false);

      // Reset
      await limiter.reset(identifier);

      // Should be allowed again
      const allowed = await limiter.check(identifier, 1, 60000);
      expect(allowed.allowed).toBe(true);
    });
  });
});

describe("RATE_LIMIT_TIERS", () => {
  it("has expected tiers", () => {
    expect(RATE_LIMIT_TIERS.auth).toBeDefined();
    expect(RATE_LIMIT_TIERS.api).toBeDefined();
    expect(RATE_LIMIT_TIERS.web).toBeDefined();
    expect(RATE_LIMIT_TIERS.expensive).toBeDefined();
  });

  it("auth tier has strict limits", () => {
    const authMinuteLimit = RATE_LIMIT_TIERS.auth[0];
    expect(authMinuteLimit.limit).toBeLessThanOrEqual(10);
  });

  it("api tier has moderate limits", () => {
    const apiMinuteLimit = RATE_LIMIT_TIERS.api[0];
    expect(apiMinuteLimit.limit).toBeGreaterThan(50);
  });
});
