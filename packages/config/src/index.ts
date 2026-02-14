/**
 * @email/config
 * Shared configuration and environment validation for OonruMail
 */

// Environment configuration
export {
  envSchema,
  validateEnv,
  createEnvConfig,
  getEnv,
  resetEnv,
  type EnvConfig,
} from "./env.js";

// CSP (Content Security Policy) configuration
export {
  cspEnvSchema,
  parseCSPEnv,
  buildCSPConfig,
  generateCSPHeader,
  validateCSPConfig,
  type CSPDirective,
  type CSPConfig,
  type CSPEnvConfig,
  type CSPValidationResult,
} from "./csp.js";

// Domain configuration
export {
  DomainStatus,
  VerificationType,
  domainSchema,
  domainConfigSchema,
  isValidDomain,
  extractDomain,
  isDomainAllowed,
  generateVerificationToken,
  generateVerificationDnsRecord,
  generateSpfRecord,
  generateDmarcRecord,
  generateDkimRecordName,
  createDefaultDomainConfig,
  type DomainConfig,
  type DkimConfig,
  type DnsRecord,
  type SpfConfig,
  type DmarcConfig,
} from "./domains.js";

/**
 * Application constants
 */
export const APP_CONSTANTS = {
  // Email limits
  MAX_EMAIL_SIZE_BYTES: 26214400, // 25MB
  MAX_SUBJECT_LENGTH: 998,
  MAX_RECIPIENTS_PER_EMAIL: 500,

  // Domain limits
  MAX_DOMAINS_PER_ORG: 50,
  DOMAIN_VERIFICATION_EXPIRY_HOURS: 72,

  // Rate limiting defaults
  DEFAULT_RATE_LIMIT_PER_MINUTE: 100,
  DEFAULT_RATE_LIMIT_PER_HOUR: 2000,
  DEFAULT_RATE_LIMIT_PER_DAY: 10000,

  // Session defaults
  DEFAULT_SESSION_TTL_SECONDS: 86400,
  DEFAULT_CACHE_TTL_SECONDS: 3600,

  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,

  // Queue settings
  DEFAULT_JOB_ATTEMPTS: 3,
  DEFAULT_BACKOFF_DELAY_MS: 1000,

  // Search
  DEFAULT_SEARCH_MAX_RESULTS: 1000,
  DEFAULT_HIGHLIGHT_FRAGMENT_SIZE: 150,
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Error codes for the application
 */
export const ERROR_CODES = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS",
  AUTH_ACCOUNT_LOCKED: "AUTH_ACCOUNT_LOCKED",
  AUTH_2FA_REQUIRED: "AUTH_2FA_REQUIRED",

  // Domain
  DOMAIN_NOT_FOUND: "DOMAIN_NOT_FOUND",
  DOMAIN_ALREADY_EXISTS: "DOMAIN_ALREADY_EXISTS",
  DOMAIN_NOT_VERIFIED: "DOMAIN_NOT_VERIFIED",
  DOMAIN_VERIFICATION_FAILED: "DOMAIN_VERIFICATION_FAILED",
  DOMAIN_NOT_ALLOWED: "DOMAIN_NOT_ALLOWED",
  DOMAIN_LIMIT_EXCEEDED: "DOMAIN_LIMIT_EXCEEDED",

  // Email
  EMAIL_NOT_FOUND: "EMAIL_NOT_FOUND",
  EMAIL_SEND_FAILED: "EMAIL_SEND_FAILED",
  EMAIL_INVALID_RECIPIENT: "EMAIL_INVALID_RECIPIENT",
  EMAIL_RATE_LIMIT_EXCEEDED: "EMAIL_RATE_LIMIT_EXCEEDED",
  EMAIL_ATTACHMENT_TOO_LARGE: "EMAIL_ATTACHMENT_TOO_LARGE",
  EMAIL_ATTACHMENT_TYPE_NOT_ALLOWED: "EMAIL_ATTACHMENT_TYPE_NOT_ALLOWED",

  // User
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  USER_INVALID_PASSWORD: "USER_INVALID_PASSWORD",

  // Organization
  ORG_NOT_FOUND: "ORG_NOT_FOUND",
  ORG_LIMIT_EXCEEDED: "ORG_LIMIT_EXCEEDED",

  // General
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
