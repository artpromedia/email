import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  InMemoryRateLimiter,
  RedisRateLimiter,
  createRateLimiter,
  RATE_LIMIT_TIERS,
  type RateLimitTier,
} from "./rate-limiter.js";

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

  it("web tier has lenient limits", () => {
    const webMinuteLimit = RATE_LIMIT_TIERS.web[0];
    expect(webMinuteLimit.limit).toBeGreaterThanOrEqual(300);
  });

  it("expensive tier has very strict limits", () => {
    const expensiveMinuteLimit = RATE_LIMIT_TIERS.expensive[0];
    expect(expensiveMinuteLimit.limit).toBeLessThanOrEqual(10);
  });

  it("each tier has windowMs values", () => {
    const tiers: RateLimitTier[] = ["auth", "api", "web", "expensive"];
    tiers.forEach((tier) => {
      RATE_LIMIT_TIERS[tier].forEach((config) => {
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.limit).toBeGreaterThan(0);
      });
    });
  });
});

describe("RedisRateLimiter", () => {
  let limiter: RedisRateLimiter;

  function createMockRedis(overrides: Record<string, unknown> = {}) {
    const mockPipeline = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 1], // INCR result
        [null, 1], // EXPIRE result
      ]),
      ...overrides,
    };
    return {
      pipeline: vi.fn(() => mockPipeline),
      keys: vi.fn().mockResolvedValue([]),
      del: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      __pipeline: mockPipeline,
    };
  }

  describe("check", () => {
    it("allows first request", async () => {
      const mockRedis = createMockRedis();
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.check("test-id", 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfter).toBeUndefined();
    });

    it("blocks requests over limit", async () => {
      const mockRedis = createMockRedis();
      mockRedis.__pipeline.exec.mockResolvedValue([
        [null, 6], // INCR result: 6th request
        [null, 1],
      ]);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.check("test-id", 5, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("returns fallback result on Redis error (fallbackToAllow=true)", async () => {
      const mockRedis = createMockRedis();
      mockRedis.__pipeline.exec.mockRejectedValue(new Error("Redis connection failed"));
      limiter = new RedisRateLimiter({ redis: mockRedis as any, fallbackToAllow: true });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await limiter.check("test-id", 5, 60000);
      consoleSpy.mockRestore();

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it("returns fallback result on Redis error (fallbackToAllow=false)", async () => {
      const mockRedis = createMockRedis();
      mockRedis.__pipeline.exec.mockRejectedValue(new Error("Redis connection failed"));
      limiter = new RedisRateLimiter({ redis: mockRedis as any, fallbackToAllow: false });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await limiter.check("test-id", 5, 60000);
      consoleSpy.mockRestore();

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("handles null pipeline results", async () => {
      const mockRedis = createMockRedis();
      mockRedis.__pipeline.exec.mockResolvedValue(null);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.check("test-id", 5, 60000);

      // Should use fallback
      expect(result.allowed).toBe(true);
    });

    it("handles empty pipeline results", async () => {
      const mockRedis = createMockRedis();
      mockRedis.__pipeline.exec.mockResolvedValue([]);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.check("test-id", 5, 60000);
      expect(result.allowed).toBe(true);
    });

    it("uses custom prefix", async () => {
      const mockRedis = createMockRedis();
      limiter = new RedisRateLimiter({
        redis: mockRedis as any,
        prefix: "custom-prefix",
      });

      await limiter.check("test-id", 5, 60000);

      expect(mockRedis.__pipeline.incr).toHaveBeenCalledWith(
        expect.stringContaining("custom-prefix:")
      );
    });
  });

  describe("checkMultiple", () => {
    it("returns most restrictive result when denied", async () => {
      const mockRedis = createMockRedis();
      let callCount = 0;
      mockRedis.__pipeline.exec.mockImplementation(() => {
        callCount++;
        // First call: count=1 (allowed), Second call: count=3 (denied with limit 2)
        if (callCount === 1) {
          return Promise.resolve([
            [null, 1],
            [null, 1],
          ]);
        }
        return Promise.resolve([
          [null, 3],
          [null, 1],
        ]);
      });
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.checkMultiple("test-id", [
        { limit: 100, windowMs: 60000 },
        { limit: 2, windowMs: 60000 },
      ]);

      expect(result.allowed).toBe(false);
    });

    it("returns lowest remaining when all pass", async () => {
      const mockRedis = createMockRedis();
      let callCount = 0;
      mockRedis.__pipeline.exec.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            [null, 1],
            [null, 1],
          ]); // remaining = 99
        }
        return Promise.resolve([
          [null, 1],
          [null, 1],
        ]); // remaining = 4
      });
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const result = await limiter.checkMultiple("test-id", [
        { limit: 100, windowMs: 60000 },
        { limit: 5, windowMs: 60000 },
      ]);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe("reset", () => {
    it("deletes all keys matching identifier", async () => {
      const mockRedis = createMockRedis();
      mockRedis.keys.mockResolvedValue(["ratelimit:test-id:123", "ratelimit:test-id:456"]);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      await limiter.reset("test-id");

      expect(mockRedis.keys).toHaveBeenCalledWith("ratelimit:test-id:*");
      expect(mockRedis.del).toHaveBeenCalledWith("ratelimit:test-id:123", "ratelimit:test-id:456");
    });

    it("handles no keys to delete", async () => {
      const mockRedis = createMockRedis();
      mockRedis.keys.mockResolvedValue([]);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      await limiter.reset("test-id");

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it("handles Redis error during reset", async () => {
      const mockRedis = createMockRedis();
      mockRedis.keys.mockRejectedValue(new Error("Redis error"));
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(limiter.reset("test-id")).resolves.toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe("getUsage", () => {
    it("returns current count", async () => {
      const mockRedis = createMockRedis();
      mockRedis.get.mockResolvedValue("5");
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const usage = await limiter.getUsage("test-id", 60000);

      expect(usage).not.toBeNull();
      expect(usage!.count).toBe(5);
    });

    it("returns 0 count when key does not exist", async () => {
      const mockRedis = createMockRedis();
      mockRedis.get.mockResolvedValue(null);
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const usage = await limiter.getUsage("test-id", 60000);

      expect(usage).not.toBeNull();
      expect(usage!.count).toBe(0);
    });

    it("returns null on Redis error", async () => {
      const mockRedis = createMockRedis();
      mockRedis.get.mockRejectedValue(new Error("Redis error"));
      limiter = new RedisRateLimiter({ redis: mockRedis as any });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const usage = await limiter.getUsage("test-id", 60000);
      consoleSpy.mockRestore();

      expect(usage).toBeNull();
    });
  });
});

describe("createRateLimiter", () => {
  it("returns RedisRateLimiter when Redis is provided", () => {
    const mockRedis = { pipeline: vi.fn() } as any;
    const limiter = createRateLimiter(mockRedis);
    expect(limiter).toBeInstanceOf(RedisRateLimiter);
  });

  it("returns InMemoryRateLimiter when no Redis is provided", () => {
    const limiter = createRateLimiter();
    expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    (limiter as InMemoryRateLimiter).destroy();
  });

  it("returns InMemoryRateLimiter when Redis is undefined", () => {
    const limiter = createRateLimiter(undefined);
    expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    (limiter as InMemoryRateLimiter).destroy();
  });

  it("passes options to RedisRateLimiter", () => {
    const mockRedis = { pipeline: vi.fn() } as any;
    const limiter = createRateLimiter(mockRedis, { prefix: "custom" });
    expect(limiter).toBeInstanceOf(RedisRateLimiter);
  });
});
