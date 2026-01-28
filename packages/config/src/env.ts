import { z } from "zod";

/**
 * Domain validation regex
 * Matches valid domain names like example.com, sub.example.org
 */
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Custom Zod validator for domain names
 */
const domainSchema = z.string().regex(DOMAIN_REGEX, "Invalid domain format");

/**
 * Custom Zod validator for comma-separated domain list
 */
const domainListSchema = z
  .string()
  .transform((val) => val.split(",").map((d) => d.trim()))
  .pipe(z.array(domainSchema).min(1, "At least one domain is required"));

/**
 * Base environment schema shared across all environments
 */
const baseEnvSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  APP_NAME: z.string().default("Enterprise Email"),
  APP_VERSION: z.string().default("1.0.0"),

  // Multi-Domain Configuration
  PRIMARY_DOMAIN: domainSchema,
  ALLOWED_DOMAINS: domainListSchema,
  DEFAULT_DOMAIN: domainSchema,
  DOMAIN_VERIFICATION_PREFIX: z.string().default("_enterprise-email-verify"),
  DOMAIN_VERIFICATION_TTL: z.coerce.number().int().positive().default(3600),
  MAX_DOMAINS_PER_ORG: z.coerce.number().int().nonnegative().default(10),

  // DKIM Configuration
  DKIM_SELECTOR: z.string().default("mail"),
  DKIM_KEYS_PATH: z.string().default("/etc/dkim/keys"),
  DKIM_KEY_SIZE: z.coerce.number().int().min(1024).default(2048),
  DKIM_ALGORITHM: z.enum(["rsa-sha256", "rsa-sha1"]).default("rsa-sha256"),
  DKIM_CANONICALIZATION: z
    .enum(["relaxed/relaxed", "relaxed/simple", "simple/relaxed", "simple/simple"])
    .default("relaxed/relaxed"),

  // Database
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(8),
  POSTGRES_DB: z.string().min(1),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_TIMEOUT: z.coerce.number().int().positive().default(30000),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().min(8),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_URL: z.string().url().optional(),
  REDIS_KEY_PREFIX: z.string().default("email:"),
  SESSION_TTL: z.coerce.number().int().positive().default(86400),
  CACHE_TTL: z.coerce.number().int().positive().default(3600),

  // MinIO / S3
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  MINIO_ROOT_USER: z.string().min(3),
  MINIO_ROOT_PASSWORD: z.string().min(8),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  S3_BUCKET_ATTACHMENTS: z.string().default("attachments"),
  S3_BUCKET_TEMPLATES: z.string().default("templates"),
  S3_BUCKET_EXPORTS: z.string().default("exports"),
  S3_BUCKET_BACKUPS: z.string().default("backups"),
  MAX_ATTACHMENT_SIZE: z.coerce.number().int().positive().default(26214400),
  ALLOWED_ATTACHMENT_TYPES: z
    .string()
    .transform((val) => val.split(",").map((t) => t.trim()))
    .default("pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,jpg,jpeg,png,gif,zip"),

  // OpenSearch
  OPENSEARCH_HOST: z.string().default("localhost"),
  OPENSEARCH_PORT: z.coerce.number().int().positive().default(9200),
  OPENSEARCH_PROTOCOL: z.enum(["http", "https"]).default("http"),
  OPENSEARCH_PASSWORD: z.string().min(8).optional(),
  OPENSEARCH_URL: z.string().url().optional(),
  OPENSEARCH_INDEX_PREFIX: z.string().default("email_"),
  OPENSEARCH_INDEX_EMAILS: z.string().default("emails"),
  OPENSEARCH_INDEX_CONTACTS: z.string().default("contacts"),
  OPENSEARCH_INDEX_AUDIT: z.string().default("audit"),
  SEARCH_MAX_RESULTS: z.coerce.number().int().positive().default(1000),
  SEARCH_HIGHLIGHT_FRAGMENT_SIZE: z.coerce.number().int().positive().default(150),

  // SMTP
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("Enterprise Email"),
  SMTP_FROM_ADDRESS: z.string().email().optional(),
  SMTP_POOL_SIZE: z.coerce.number().int().positive().default(5),
  SMTP_POOL_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  SMTP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(100),
  SMTP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(2000),
  SMTP_RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().default(10000),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("enterprise-email"),
  JWT_AUDIENCE: z.string().default("enterprise-email-clients"),
  JWT_ACCESS_TOKEN_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_TOKEN_EXPIRES: z.string().default("7d"),
  SESSION_SECRET: z.string().min(32),
  SESSION_NAME: z.string().default("email_session"),
  SESSION_SECURE: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  SESSION_HTTP_ONLY: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  SESSION_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),

  // Password Policy
  PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(12),
  PASSWORD_REQUIRE_UPPERCASE: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  PASSWORD_REQUIRE_LOWERCASE: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  PASSWORD_REQUIRE_NUMBERS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  PASSWORD_REQUIRE_SYMBOLS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  PASSWORD_MAX_AGE_DAYS: z.coerce.number().int().positive().default(90),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // CORS
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(",").map((o) => o.trim()))
    .default("http://localhost:3000,http://localhost:3001"),
  CORS_CREDENTIALS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),

  // API
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default("/api/v1"),

  // URLs
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_APP_URL: z.string().url().default("http://localhost:3001"),
  API_URL: z.string().url().default("http://localhost:4000"),

  // Feature Flags
  FEATURE_MULTI_DOMAIN: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_CUSTOM_DOMAINS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_EMAIL_TEMPLATES: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_EMAIL_SCHEDULING: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_EMAIL_TRACKING: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_SPAM_FILTERING: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_VIRUS_SCANNING: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  FEATURE_2FA: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_SSO: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  FEATURE_API_ACCESS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FEATURE_WEBHOOKS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),

  // Queue
  QUEUE_PREFIX: z.string().default("email:queue:"),
  QUEUE_EMAIL_SEND: z.string().default("email-send"),
  QUEUE_EMAIL_RECEIVE: z.string().default("email-receive"),
  QUEUE_EMAIL_PROCESS: z.string().default("email-process"),
  QUEUE_DOMAIN_VERIFY: z.string().default("domain-verify"),
  QUEUE_CLEANUP: z.string().default("cleanup"),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  QUEUE_JOB_BACKOFF_TYPE: z.enum(["fixed", "exponential"]).default("exponential"),
  QUEUE_JOB_BACKOFF_DELAY: z.coerce.number().int().positive().default(1000),
});

/**
 * Refinements for cross-field validation
 */
const envSchemaWithRefinements = baseEnvSchema
  .refine(
    (data) => data.ALLOWED_DOMAINS.includes(data.PRIMARY_DOMAIN),
    {
      message: "PRIMARY_DOMAIN must be included in ALLOWED_DOMAINS",
      path: ["PRIMARY_DOMAIN"],
    }
  )
  .refine(
    (data) => data.ALLOWED_DOMAINS.includes(data.DEFAULT_DOMAIN),
    {
      message: "DEFAULT_DOMAIN must be included in ALLOWED_DOMAINS",
      path: ["DEFAULT_DOMAIN"],
    }
  )
  .refine(
    (data) => data.DATABASE_POOL_MAX >= data.DATABASE_POOL_MIN,
    {
      message: "DATABASE_POOL_MAX must be >= DATABASE_POOL_MIN",
      path: ["DATABASE_POOL_MAX"],
    }
  );

/**
 * Environment configuration type
 */
export type EnvConfig = z.infer<typeof envSchemaWithRefinements>;

/**
 * Raw environment schema for initial parsing
 */
export const envSchema = envSchemaWithRefinements;

/**
 * Validate and parse environment variables
 * @throws {ZodError} if validation fails
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.format();
    const errorMessages = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const errors = (value as { _errors?: string[] })._errors ?? [];
        return `  ${key}: ${errors.join(", ")}`;
      })
      .join("\n");

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return result.data;
}

/**
 * Create a validated environment configuration with computed URLs
 */
export function createEnvConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  // Build computed URLs if not provided
  const enrichedEnv: Record<string, string | undefined> = { ...env };

  if (!enrichedEnv["DATABASE_URL"]) {
    const user = enrichedEnv["POSTGRES_USER"] ?? "email_admin";
    const pass = enrichedEnv["POSTGRES_PASSWORD"] ?? "";
    const host = enrichedEnv["POSTGRES_HOST"] ?? "localhost";
    const port = enrichedEnv["POSTGRES_PORT"] ?? "5432";
    const db = enrichedEnv["POSTGRES_DB"] ?? "enterprise_email";
    enrichedEnv["DATABASE_URL"] = `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=public`;
  }

  if (!enrichedEnv["REDIS_URL"]) {
    const pass = enrichedEnv["REDIS_PASSWORD"] ?? "";
    const host = enrichedEnv["REDIS_HOST"] ?? "localhost";
    const port = enrichedEnv["REDIS_PORT"] ?? "6379";
    const db = enrichedEnv["REDIS_DB"] ?? "0";
    enrichedEnv["REDIS_URL"] = `redis://:${pass}@${host}:${port}/${db}`;
  }

  if (!enrichedEnv["OPENSEARCH_URL"]) {
    const protocol = enrichedEnv["OPENSEARCH_PROTOCOL"] ?? "http";
    const host = enrichedEnv["OPENSEARCH_HOST"] ?? "localhost";
    const port = enrichedEnv["OPENSEARCH_PORT"] ?? "9200";
    enrichedEnv["OPENSEARCH_URL"] = `${protocol}://${host}:${port}`;
  }

  if (!enrichedEnv["S3_ENDPOINT"]) {
    const host = enrichedEnv["MINIO_ENDPOINT"] ?? "localhost";
    const port = enrichedEnv["MINIO_PORT"] ?? "9000";
    const ssl = enrichedEnv["MINIO_USE_SSL"] === "true";
    enrichedEnv["S3_ENDPOINT"] = `${ssl ? "https" : "http"}://${host}:${port}`;
  }

  if (!enrichedEnv["S3_ACCESS_KEY"]) {
    enrichedEnv["S3_ACCESS_KEY"] = enrichedEnv["MINIO_ROOT_USER"];
  }

  if (!enrichedEnv["S3_SECRET_KEY"]) {
    enrichedEnv["S3_SECRET_KEY"] = enrichedEnv["MINIO_ROOT_PASSWORD"];
  }

  if (!enrichedEnv["SMTP_FROM_ADDRESS"]) {
    const domain = enrichedEnv["PRIMARY_DOMAIN"] ?? "example.com";
    enrichedEnv["SMTP_FROM_ADDRESS"] = `noreply@${domain}`;
  }

  return validateEnv(enrichedEnv);
}

// Singleton instance
let _env: EnvConfig | null = null;

/**
 * Get the validated environment configuration (singleton)
 */
export function getEnv(): EnvConfig {
  if (!_env) {
    _env = createEnvConfig();
  }
  return _env;
}

/**
 * Reset the environment singleton (useful for testing)
 */
export function resetEnv(): void {
  _env = null;
}
