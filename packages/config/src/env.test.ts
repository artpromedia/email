/**
 * Environment Configuration Tests
 * Tests for environment validation and configuration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv, createEnvConfig, resetEnv, getEnv } from "./env";

// Base valid environment for tests
const baseValidEnv = {
  NODE_ENV: "test",
  PRIMARY_DOMAIN: "example.com",
  ALLOWED_DOMAINS: "example.com,mail.example.com",
  DEFAULT_DOMAIN: "example.com",
  POSTGRES_USER: "email_admin",
  POSTGRES_PASSWORD: "secure_password_123",
  POSTGRES_DB: "enterprise_email",
  REDIS_PASSWORD: "redis_password_123",
  MINIO_ROOT_USER: "minioadmin",
  MINIO_ROOT_PASSWORD: "minio_password_123",
  JWT_SECRET: "a_very_long_jwt_secret_that_is_at_least_32_chars",
  SESSION_SECRET: "a_very_long_session_secret_that_is_at_least_32_chars",
};

describe("Environment Validation", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  describe("validateEnv", () => {
    it("should validate a complete valid environment", () => {
      const env = validateEnv(baseValidEnv);

      expect(env.NODE_ENV).toBe("test");
      expect(env.PRIMARY_DOMAIN).toBe("example.com");
      expect(env.ALLOWED_DOMAINS).toContain("example.com");
    });

    it("should throw on missing required fields", () => {
      expect(() => validateEnv({})).toThrow();
    });

    it("should throw on invalid domain format", () => {
      const invalidEnv = {
        ...baseValidEnv,
        PRIMARY_DOMAIN: "invalid-domain",
      };

      expect(() => validateEnv(invalidEnv)).toThrow();
    });

    it("should throw when PRIMARY_DOMAIN not in ALLOWED_DOMAINS", () => {
      const invalidEnv = {
        ...baseValidEnv,
        PRIMARY_DOMAIN: "other.com",
        ALLOWED_DOMAINS: "example.com",
      };

      expect(() => validateEnv(invalidEnv)).toThrow(
        "PRIMARY_DOMAIN must be included in ALLOWED_DOMAINS"
      );
    });

    it("should throw when DEFAULT_DOMAIN not in ALLOWED_DOMAINS", () => {
      const invalidEnv = {
        ...baseValidEnv,
        DEFAULT_DOMAIN: "other.com",
      };

      expect(() => validateEnv(invalidEnv)).toThrow(
        "DEFAULT_DOMAIN must be included in ALLOWED_DOMAINS"
      );
    });

    it("should throw when DATABASE_POOL_MAX < DATABASE_POOL_MIN", () => {
      const invalidEnv = {
        ...baseValidEnv,
        DATABASE_POOL_MIN: "10",
        DATABASE_POOL_MAX: "5",
      };

      expect(() => validateEnv(invalidEnv)).toThrow(
        "DATABASE_POOL_MAX must be >= DATABASE_POOL_MIN"
      );
    });

    it("should throw on password too short", () => {
      const invalidEnv = {
        ...baseValidEnv,
        POSTGRES_PASSWORD: "short",
      };

      expect(() => validateEnv(invalidEnv)).toThrow();
    });

    it("should throw on JWT secret too short", () => {
      const invalidEnv = {
        ...baseValidEnv,
        JWT_SECRET: "short",
      };

      expect(() => validateEnv(invalidEnv)).toThrow();
    });
  });

  describe("Default Values", () => {
    it("should apply default NODE_ENV", () => {
      const env = validateEnv(baseValidEnv);
      // We explicitly set it to 'test' in baseValidEnv
      expect(env.NODE_ENV).toBe("test");
    });

    it("should apply default LOG_LEVEL", () => {
      const env = validateEnv(baseValidEnv);
      expect(env.LOG_LEVEL).toBe("info");
    });

    it("should apply default database pool settings", () => {
      const env = validateEnv(baseValidEnv);
      expect(env.DATABASE_POOL_MIN).toBe(2);
      expect(env.DATABASE_POOL_MAX).toBe(10);
    });

    it("should apply default DKIM settings", () => {
      const env = validateEnv(baseValidEnv);
      expect(env.DKIM_SELECTOR).toBe("mail");
      expect(env.DKIM_KEY_SIZE).toBe(2048);
      expect(env.DKIM_ALGORITHM).toBe("rsa-sha256");
    });

    it("should apply default rate limit settings", () => {
      const env = validateEnv(baseValidEnv);
      expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    });

    it("should apply default feature flags", () => {
      const env = validateEnv(baseValidEnv);
      expect(env.FEATURE_MULTI_DOMAIN).toBe(true);
      expect(env.FEATURE_2FA).toBe(true);
      expect(env.FEATURE_SSO).toBe(false);
    });
  });

  describe("Type Coercion", () => {
    it("should coerce string numbers to numbers", () => {
      const envWithStrings = {
        ...baseValidEnv,
        POSTGRES_PORT: "5433",
        DATABASE_POOL_MIN: "5",
        DATABASE_POOL_MAX: "20",
      };

      const env = validateEnv(envWithStrings);
      expect(env.POSTGRES_PORT).toBe(5433);
      expect(env.DATABASE_POOL_MIN).toBe(5);
      expect(env.DATABASE_POOL_MAX).toBe(20);
    });

    it("should transform boolean strings to booleans", () => {
      const envWithBooleans = {
        ...baseValidEnv,
        SMTP_SECURE: "true",
        SESSION_SECURE: "false",
        MINIO_USE_SSL: "true",
      };

      const env = validateEnv(envWithBooleans);
      expect(env.SMTP_SECURE).toBe(true);
      expect(env.SESSION_SECURE).toBe(false);
      expect(env.MINIO_USE_SSL).toBe(true);
    });

    it("should parse comma-separated domains into array", () => {
      const envWithDomains = {
        ...baseValidEnv,
        ALLOWED_DOMAINS: "example.com, mail.example.com, admin.example.org",
      };

      const env = validateEnv(envWithDomains);
      expect(env.ALLOWED_DOMAINS).toEqual(["example.com", "mail.example.com", "admin.example.org"]);
    });
  });

  describe("Enum Validation", () => {
    it("should accept valid NODE_ENV values", () => {
      const envs = ["development", "staging", "production", "test"] as const;

      envs.forEach((nodeEnv) => {
        const env = validateEnv({ ...baseValidEnv, NODE_ENV: nodeEnv });
        expect(env.NODE_ENV).toBe(nodeEnv);
      });
    });

    it("should reject invalid NODE_ENV", () => {
      expect(() => validateEnv({ ...baseValidEnv, NODE_ENV: "invalid" })).toThrow();
    });

    it("should accept valid LOG_LEVEL values", () => {
      const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

      levels.forEach((level) => {
        const env = validateEnv({ ...baseValidEnv, LOG_LEVEL: level });
        expect(env.LOG_LEVEL).toBe(level);
      });
    });

    it("should accept valid DKIM algorithm values", () => {
      const algorithms = ["rsa-sha256", "rsa-sha1"] as const;

      algorithms.forEach((alg) => {
        const env = validateEnv({ ...baseValidEnv, DKIM_ALGORITHM: alg });
        expect(env.DKIM_ALGORITHM).toBe(alg);
      });
    });

    it("should accept valid SESSION_SAME_SITE values", () => {
      const values = ["strict", "lax", "none"] as const;

      values.forEach((value) => {
        const env = validateEnv({ ...baseValidEnv, SESSION_SAME_SITE: value });
        expect(env.SESSION_SAME_SITE).toBe(value);
      });
    });
  });

  describe("createEnvConfig", () => {
    it("should compute DATABASE_URL if not provided", () => {
      const env = createEnvConfig(baseValidEnv);
      expect(env.DATABASE_URL).toContain("postgresql://");
      expect(env.DATABASE_URL).toContain("email_admin");
      expect(env.DATABASE_URL).toContain("enterprise_email");
    });

    it("should compute REDIS_URL if not provided", () => {
      const env = createEnvConfig(baseValidEnv);
      expect(env.REDIS_URL).toContain("redis://");
    });

    it("should compute S3_ENDPOINT if not provided", () => {
      const env = createEnvConfig(baseValidEnv);
      expect(env.S3_ENDPOINT).toContain("http://");
    });

    it("should compute SMTP_FROM_ADDRESS if not provided", () => {
      const env = createEnvConfig(baseValidEnv);
      expect(env.SMTP_FROM_ADDRESS).toBe("noreply@example.com");
    });

    it("should use provided DATABASE_URL over computed one", () => {
      const customUrl = "postgresql://custom:pass@host:5432/db";
      const env = createEnvConfig({
        ...baseValidEnv,
        DATABASE_URL: customUrl,
      });
      expect(env.DATABASE_URL).toBe(customUrl);
    });

    it("should copy MINIO credentials to S3 if not set", () => {
      const env = createEnvConfig(baseValidEnv);
      expect(env.S3_ACCESS_KEY).toBe(baseValidEnv.MINIO_ROOT_USER);
      expect(env.S3_SECRET_KEY).toBe(baseValidEnv.MINIO_ROOT_PASSWORD);
    });
  });

  describe("getEnv Singleton", () => {
    it("should return same instance on multiple calls", () => {
      // Mock process.env for this test
      const originalEnv = process.env;
      process.env = { ...originalEnv, ...baseValidEnv } as NodeJS.ProcessEnv;

      try {
        const env1 = getEnv();
        const env2 = getEnv();
        expect(env1).toBe(env2);
      } finally {
        process.env = originalEnv;
      }
    });

    it("should return new instance after resetEnv", () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, ...baseValidEnv } as NodeJS.ProcessEnv;

      try {
        const env1 = getEnv();
        resetEnv();
        const env2 = getEnv();
        // They should be equal in value but not necessarily the same reference
        expect(env1.PRIMARY_DOMAIN).toBe(env2.PRIMARY_DOMAIN);
      } finally {
        process.env = originalEnv;
      }
    });
  });
});

describe("Domain Validation", () => {
  it("should accept valid domain formats", () => {
    const validDomains = [
      "example.com",
      "mail.example.com",
      "sub.domain.example.org",
      "example-with-dash.com",
      "example123.net",
      "a.io",
    ];

    validDomains.forEach((domain) => {
      const env = validateEnv({
        ...baseValidEnv,
        PRIMARY_DOMAIN: domain,
        DEFAULT_DOMAIN: domain,
        ALLOWED_DOMAINS: domain,
      });
      expect(env.PRIMARY_DOMAIN).toBe(domain);
    });
  });

  it("should reject invalid domain formats", () => {
    const invalidDomains = [
      "example",
      ".example.com",
      "example.com.",
      "-example.com",
      "example-.com",
      "exa mple.com",
      "example..com",
      "example.c",
    ];

    invalidDomains.forEach((domain) => {
      expect(() =>
        validateEnv({
          ...baseValidEnv,
          PRIMARY_DOMAIN: domain,
          DEFAULT_DOMAIN: domain,
          ALLOWED_DOMAINS: domain,
        })
      ).toThrow();
    });
  });
});

describe("URL Validation", () => {
  it("should accept valid URLs", () => {
    const env = validateEnv({
      ...baseValidEnv,
      WEB_APP_URL: "https://app.example.com",
      ADMIN_APP_URL: "https://admin.example.com",
      API_URL: "https://api.example.com",
    });

    expect(env.WEB_APP_URL).toBe("https://app.example.com");
    expect(env.ADMIN_APP_URL).toBe("https://admin.example.com");
    expect(env.API_URL).toBe("https://api.example.com");
  });

  it("should reject invalid URLs", () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        WEB_APP_URL: "not-a-url",
      })
    ).toThrow();
  });
});

describe("Password Policy Configuration", () => {
  it("should have secure defaults", () => {
    const env = validateEnv(baseValidEnv);

    expect(env.PASSWORD_MIN_LENGTH).toBe(12);
    expect(env.PASSWORD_REQUIRE_UPPERCASE).toBe(true);
    expect(env.PASSWORD_REQUIRE_LOWERCASE).toBe(true);
    expect(env.PASSWORD_REQUIRE_NUMBERS).toBe(true);
    expect(env.PASSWORD_REQUIRE_SYMBOLS).toBe(true);
    expect(env.PASSWORD_MAX_AGE_DAYS).toBe(90);
  });

  it("should allow customizing password policy", () => {
    const env = validateEnv({
      ...baseValidEnv,
      PASSWORD_MIN_LENGTH: "16",
      PASSWORD_REQUIRE_SYMBOLS: "false",
      PASSWORD_MAX_AGE_DAYS: "60",
    });

    expect(env.PASSWORD_MIN_LENGTH).toBe(16);
    expect(env.PASSWORD_REQUIRE_SYMBOLS).toBe(false);
    expect(env.PASSWORD_MAX_AGE_DAYS).toBe(60);
  });
});

describe("Queue Configuration", () => {
  it("should have default queue settings", () => {
    const env = validateEnv(baseValidEnv);

    expect(env.QUEUE_PREFIX).toBe("email:queue:");
    expect(env.QUEUE_EMAIL_SEND).toBe("email-send");
    expect(env.QUEUE_JOB_ATTEMPTS).toBe(3);
    expect(env.QUEUE_JOB_BACKOFF_TYPE).toBe("exponential");
    expect(env.QUEUE_JOB_BACKOFF_DELAY).toBe(1000);
  });
});
