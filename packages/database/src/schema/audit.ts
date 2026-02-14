/**
 * OonruMail Database - Audit Logs Schema
 * Comprehensive audit logging with partitioning support
 */

import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, index, jsonb, inet } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { organizations } from "./organizations";
import { users } from "./users";

// ============================================================
// AUDIT LOG ENTRY TYPES
// ============================================================

export interface AuditLogDetails {
  /** Previous state/value */
  previousValue?: unknown;
  /** New state/value */
  newValue?: unknown;
  /** Fields that changed */
  changedFields?: string[];
  /** Resource identifier */
  resourceId?: string;
  /** Resource type */
  resourceType?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Request ID for correlation */
  requestId?: string;
  /** User agent string */
  userAgent?: string;
  /** Session ID */
  sessionId?: string;
  /** Additional notes */
  notes?: string;
}

// ============================================================
// AUDIT LOG CATEGORIES
// ============================================================

export const AUDIT_CATEGORIES = {
  // Authentication
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_PASSWORD_CHANGE: "auth.password_change",
  AUTH_PASSWORD_RESET: "auth.password_reset",
  AUTH_2FA_ENABLED: "auth.2fa_enabled",
  AUTH_2FA_DISABLED: "auth.2fa_disabled",
  AUTH_SESSION_REVOKED: "auth.session_revoked",

  // User Management
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_SUSPENDED: "user.suspended",
  USER_REACTIVATED: "user.reactivated",
  USER_ROLE_CHANGED: "user.role_changed",
  USER_PERMISSIONS_CHANGED: "user.permissions_changed",

  // Domain Management
  DOMAIN_CREATED: "domain.created",
  DOMAIN_UPDATED: "domain.updated",
  DOMAIN_DELETED: "domain.deleted",
  DOMAIN_VERIFIED: "domain.verified",
  DOMAIN_VERIFICATION_FAILED: "domain.verification_failed",
  DOMAIN_DNS_UPDATED: "domain.dns_updated",
  DOMAIN_DKIM_ROTATED: "domain.dkim_rotated",

  // Email Operations
  EMAIL_SENT: "email.sent",
  EMAIL_RECEIVED: "email.received",
  EMAIL_DELETED: "email.deleted",
  EMAIL_MOVED: "email.moved",
  EMAIL_FORWARDED: "email.forwarded",
  EMAIL_EXPORTED: "email.exported",

  // Mailbox Operations
  MAILBOX_CREATED: "mailbox.created",
  MAILBOX_UPDATED: "mailbox.updated",
  MAILBOX_DELETED: "mailbox.deleted",
  MAILBOX_QUOTA_CHANGED: "mailbox.quota_changed",
  MAILBOX_FORWARDING_CHANGED: "mailbox.forwarding_changed",

  // Shared Mailbox Operations
  SHARED_MAILBOX_CREATED: "shared_mailbox.created",
  SHARED_MAILBOX_UPDATED: "shared_mailbox.updated",
  SHARED_MAILBOX_DELETED: "shared_mailbox.deleted",
  SHARED_MAILBOX_MEMBER_ADDED: "shared_mailbox.member_added",
  SHARED_MAILBOX_MEMBER_REMOVED: "shared_mailbox.member_removed",
  SHARED_MAILBOX_PERMISSION_CHANGED: "shared_mailbox.permission_changed",

  // Distribution List Operations
  DIST_LIST_CREATED: "distribution_list.created",
  DIST_LIST_UPDATED: "distribution_list.updated",
  DIST_LIST_DELETED: "distribution_list.deleted",
  DIST_LIST_MEMBER_ADDED: "distribution_list.member_added",
  DIST_LIST_MEMBER_REMOVED: "distribution_list.member_removed",
  DIST_LIST_MESSAGE_SENT: "distribution_list.message_sent",
  DIST_LIST_MESSAGE_MODERATED: "distribution_list.message_moderated",

  // Routing Rules
  ROUTING_RULE_CREATED: "routing_rule.created",
  ROUTING_RULE_UPDATED: "routing_rule.updated",
  ROUTING_RULE_DELETED: "routing_rule.deleted",
  ROUTING_RULE_TRIGGERED: "routing_rule.triggered",

  // Organization Settings
  ORG_SETTINGS_UPDATED: "organization.settings_updated",
  ORG_BRANDING_UPDATED: "organization.branding_updated",
  ORG_SUBSCRIPTION_CHANGED: "organization.subscription_changed",

  // Security Events
  SECURITY_SUSPICIOUS_LOGIN: "security.suspicious_login",
  SECURITY_BRUTE_FORCE_DETECTED: "security.brute_force_detected",
  SECURITY_API_KEY_CREATED: "security.api_key_created",
  SECURITY_API_KEY_REVOKED: "security.api_key_revoked",
  SECURITY_PERMISSION_DENIED: "security.permission_denied",

  // Data Export/Import
  DATA_EXPORT_REQUESTED: "data.export_requested",
  DATA_EXPORT_COMPLETED: "data.export_completed",
  DATA_IMPORT_STARTED: "data.import_started",
  DATA_IMPORT_COMPLETED: "data.import_completed",

  // Admin Actions
  ADMIN_IMPERSONATION_START: "admin.impersonation_start",
  ADMIN_IMPERSONATION_END: "admin.impersonation_end",
  ADMIN_BULK_OPERATION: "admin.bulk_operation",
} as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[keyof typeof AUDIT_CATEGORIES];

// ============================================================
// AUDIT LOGS TABLE
// Main audit log table - in production, should be partitioned by created_at
// ============================================================

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Organization context */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Domain context (if applicable) */
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),

    /** User who performed the action */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** User email at time of action (preserved even if user deleted) */
    userEmail: varchar("user_email", { length: 255 }),

    /** User display name at time of action */
    userDisplayName: varchar("user_display_name", { length: 255 }),

    /** Audit event category */
    category: varchar("category", { length: 100 }).notNull(),

    /** Specific action within category */
    action: varchar("action", { length: 100 }).notNull(),

    /** Human-readable description */
    description: text("description").notNull(),

    /** Severity: info, warning, error, critical */
    severity: varchar("severity", { length: 20 }).notNull().default("info"),

    /** Target resource type (user, domain, email, etc.) */
    targetType: varchar("target_type", { length: 50 }),

    /** Target resource ID */
    targetId: varchar("target_id", { length: 255 }),

    /** Target resource name/identifier for display */
    targetName: varchar("target_name", { length: 255 }),

    /** Detailed audit data */
    details: jsonb("details").$type<AuditLogDetails>(),

    /** Client IP address */
    ipAddress: inet("ip_address"),

    /** Geographic location (if resolved) */
    geoLocation: varchar("geo_location", { length: 255 }),

    /** Country code */
    countryCode: varchar("country_code", { length: 2 }),

    /** Request correlation ID */
    correlationId: varchar("correlation_id", { length: 100 }),

    /** Source: web, api, system, sync */
    source: varchar("source", { length: 50 }).notNull().default("web"),

    /** API client ID if from API */
    apiClientId: varchar("api_client_id", { length: 100 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_organization_id_idx").on(table.organizationId),
    index("audit_logs_domain_id_idx").on(table.domainId),
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_category_idx").on(table.organizationId, table.category),
    index("audit_logs_action_idx").on(table.organizationId, table.category, table.action),
    index("audit_logs_target_idx").on(table.organizationId, table.targetType, table.targetId),
    index("audit_logs_severity_idx").on(table.organizationId, table.severity),
    index("audit_logs_created_at_idx").on(table.organizationId, table.createdAt),
    index("audit_logs_ip_address_idx").on(table.organizationId, table.ipAddress),
    index("audit_logs_correlation_idx").on(table.correlationId),
    // Composite index for common queries
    index("audit_logs_org_date_category_idx").on(
      table.organizationId,
      table.createdAt,
      table.category
    ),
  ]
);

// ============================================================
// LOGIN ATTEMPTS TABLE
// Tracking all authentication attempts for security analysis
// ============================================================

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email address used for login */
    email: varchar("email", { length: 255 }).notNull(),

    /** Was login successful */
    successful: varchar("successful", { length: 5 }).notNull(),

    /** Failure reason if unsuccessful */
    failureReason: varchar("failure_reason", { length: 100 }),

    /** Client IP address */
    ipAddress: inet("ip_address").notNull(),

    /** User agent string */
    userAgent: text("user_agent"),

    /** Geographic location */
    geoLocation: varchar("geo_location", { length: 255 }),

    /** Country code */
    countryCode: varchar("country_code", { length: 2 }),

    /** Organization ID (if email matched an org) */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    /** User ID (if login succeeded) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** Login method: password, sso, 2fa */
    loginMethod: varchar("login_method", { length: 20 }).notNull().default("password"),

    /** 2FA method used if applicable */
    twoFactorMethod: varchar("two_factor_method", { length: 20 }),

    /** Risk score (0-100) */
    riskScore: varchar("risk_score", { length: 10 }),

    /** Risk factors identified */
    riskFactors: varchar("risk_factors", { length: 255 })
      .array()
      .notNull()
      .default(sql`ARRAY[]::varchar[]`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_attempts_email_idx").on(table.email),
    index("login_attempts_ip_address_idx").on(table.ipAddress),
    index("login_attempts_organization_idx").on(table.organizationId),
    index("login_attempts_user_id_idx").on(table.userId),
    index("login_attempts_successful_idx").on(table.email, table.successful),
    index("login_attempts_created_at_idx").on(table.createdAt),
    // For detecting brute force attempts
    index("login_attempts_ip_time_idx").on(table.ipAddress, table.createdAt),
    index("login_attempts_email_time_idx").on(table.email, table.createdAt),
  ]
);

// ============================================================
// SECURITY EVENTS TABLE
// High-priority security events requiring attention
// ============================================================

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** User involved (if applicable) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** Event type */
    eventType: varchar("event_type", { length: 100 }).notNull(),

    /** Severity: low, medium, high, critical */
    severity: varchar("severity", { length: 20 }).notNull(),

    /** Event title */
    title: varchar("title", { length: 255 }).notNull(),

    /** Event description */
    description: text("description").notNull(),

    /** IP address involved */
    ipAddress: inet("ip_address"),

    /** Geographic location */
    geoLocation: varchar("geo_location", { length: 255 }),

    /** Event details */
    details: jsonb("details").$type<Record<string, unknown>>(),

    /** Is event acknowledged */
    acknowledged: varchar("acknowledged", { length: 5 }).notNull().default("false"),

    /** Acknowledged by user */
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** When acknowledged */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),

    /** Resolution notes */
    resolutionNotes: text("resolution_notes"),

    /** Is event resolved */
    resolved: varchar("resolved", { length: 5 }).notNull().default("false"),

    /** Resolved by user */
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** When resolved */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    /** Related audit log IDs */
    relatedAuditLogIds: uuid("related_audit_log_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("security_events_organization_idx").on(table.organizationId),
    index("security_events_user_idx").on(table.userId),
    index("security_events_type_idx").on(table.organizationId, table.eventType),
    index("security_events_severity_idx").on(table.organizationId, table.severity),
    index("security_events_unresolved_idx").on(table.organizationId, table.resolved),
    index("security_events_created_at_idx").on(table.organizationId, table.createdAt),
  ]
);

// ============================================================
// API ACCESS LOGS TABLE
// ============================================================

export const apiAccessLogs = pgTable(
  "api_access_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** API client/key ID */
    apiClientId: varchar("api_client_id", { length: 100 }).notNull(),

    /** API client name */
    apiClientName: varchar("api_client_name", { length: 255 }),

    /** User ID associated with API key */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** HTTP method */
    method: varchar("method", { length: 10 }).notNull(),

    /** Request path */
    path: varchar("path", { length: 500 }).notNull(),

    /** Query parameters (sanitized) */
    queryParams: jsonb("query_params").$type<Record<string, string>>(),

    /** Response status code */
    statusCode: varchar("status_code", { length: 10 }).notNull(),

    /** Response time in milliseconds */
    responseTimeMs: varchar("response_time_ms", { length: 20 }),

    /** Request body size in bytes */
    requestSize: varchar("request_size", { length: 20 }),

    /** Response body size in bytes */
    responseSize: varchar("response_size", { length: 20 }),

    /** Client IP address */
    ipAddress: inet("ip_address").notNull(),

    /** User agent */
    userAgent: text("user_agent"),

    /** Error message if request failed */
    errorMessage: text("error_message"),

    /** Request correlation ID */
    correlationId: varchar("correlation_id", { length: 100 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_access_logs_organization_idx").on(table.organizationId),
    index("api_access_logs_client_idx").on(table.organizationId, table.apiClientId),
    index("api_access_logs_user_idx").on(table.userId),
    index("api_access_logs_path_idx").on(table.organizationId, table.path),
    index("api_access_logs_status_idx").on(table.organizationId, table.statusCode),
    index("api_access_logs_created_at_idx").on(table.organizationId, table.createdAt),
    index("api_access_logs_ip_idx").on(table.organizationId, table.ipAddress),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;

export type ApiAccessLog = typeof apiAccessLogs.$inferSelect;
export type NewApiAccessLog = typeof apiAccessLogs.$inferInsert;
