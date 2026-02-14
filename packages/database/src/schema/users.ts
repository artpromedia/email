/**
 * OonruMail Database - Users Schema
 * Multi-domain user accounts with email addresses and aliases
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { userStatusEnum, userRoleEnum } from "./enums";
import { organizations } from "./organizations";

// ============================================================
// USERS TABLE
// ============================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Primary email address for login */
    primaryEmail: varchar("primary_email", { length: 255 }).notNull().unique(),

    /** Domain of primary email (derived, for indexing) */
    primaryDomainId: uuid("primary_domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "restrict" }),

    /** Argon2id password hash */
    passwordHash: text("password_hash").notNull(),

    /** Display name */
    displayName: varchar("display_name", { length: 255 }).notNull(),

    /** First name */
    firstName: varchar("first_name", { length: 100 }),

    /** Last name */
    lastName: varchar("last_name", { length: 100 }),

    /** Avatar image URL */
    avatarUrl: text("avatar_url"),

    /** User's timezone (IANA format) */
    timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),

    /** Preferred language (BCP 47 format) */
    language: varchar("language", { length: 10 }).notNull().default("en"),

    /** Account status */
    status: userStatusEnum("status").notNull().default("pending_verification"),

    /** Role within organization */
    role: userRoleEnum("role").notNull().default("member"),

    /** Two-factor authentication enabled */
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),

    /** TOTP secret (encrypted) */
    twoFactorSecret: text("two_factor_secret"),

    /** Recovery codes (encrypted JSON array) */
    recoveryCodes: text("recovery_codes"),

    /** Email verification token */
    emailVerificationToken: varchar("email_verification_token", { length: 64 }),

    /** Email verification expiry */
    emailVerificationExpiresAt: timestamp("email_verification_expires_at", {
      withTimezone: true,
    }),

    /** Password reset token */
    passwordResetToken: varchar("password_reset_token", { length: 64 }),

    /** Password reset expiry */
    passwordResetExpiresAt: timestamp("password_reset_expires_at", {
      withTimezone: true,
    }),

    /** Last password change */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),

    /** Last login timestamp */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    /** Last login IP address */
    lastLoginIp: varchar("last_login_ip", { length: 45 }), // IPv6 max length

    /** Failed login attempts (reset on success) */
    failedLoginAttempts: text("failed_login_attempts").notNull().default("0"),

    /** Account locked until */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_primary_email_idx").on(table.primaryEmail),
    index("users_organization_id_idx").on(table.organizationId),
    index("users_organization_status_idx").on(table.organizationId, table.status),
    index("users_primary_domain_id_idx").on(table.primaryDomainId),
    index("users_status_idx").on(table.status),
    index("users_role_idx").on(table.organizationId, table.role),
  ]
);

// ============================================================
// USER EMAIL ADDRESSES TABLE
// ============================================================

export const userEmailAddresses = pgTable(
  "user_email_addresses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Owner user */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Domain this address belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Full email address */
    emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),

    /** Local part (before @) */
    localPart: varchar("local_part", { length: 64 }).notNull(),

    /** Is this the user's primary email */
    isPrimary: boolean("is_primary").notNull().default(false),

    /** Has this address been verified */
    isVerified: boolean("is_verified").notNull().default(false),

    /** Can send emails from this address */
    canSend: boolean("can_send").notNull().default(true),

    /** Can receive emails to this address */
    canReceive: boolean("can_receive").notNull().default(true),

    /** Verification token */
    verificationToken: varchar("verification_token", { length: 64 }),

    /** Verification token expiry */
    verificationExpiresAt: timestamp("verification_expires_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_email_addresses_email_idx").on(table.emailAddress),
    uniqueIndex("user_email_addresses_domain_local_idx").on(table.domainId, table.localPart),
    index("user_email_addresses_user_id_idx").on(table.userId),
    index("user_email_addresses_domain_id_idx").on(table.domainId),
    index("user_email_addresses_user_primary_idx").on(table.userId, table.isPrimary),
  ]
);

// ============================================================
// EMAIL ALIASES TABLE
// ============================================================

export const emailAliases = pgTable(
  "email_aliases",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Owner user */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Domain this alias belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Full alias address */
    aliasAddress: varchar("alias_address", { length: 255 }).notNull().unique(),

    /** Local part (before @) */
    localPart: varchar("local_part", { length: 64 }).notNull(),

    /** Is this alias active */
    isActive: boolean("is_active").notNull().default(true),

    /** Description/purpose of alias */
    description: varchar("description", { length: 255 }),

    /** Auto-generated alias (e.g., for tracking) */
    isAutoGenerated: boolean("is_auto_generated").notNull().default(false),

    /** Expiration date (for temporary aliases) */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_aliases_address_idx").on(table.aliasAddress),
    uniqueIndex("email_aliases_domain_local_idx").on(table.domainId, table.localPart),
    index("email_aliases_user_id_idx").on(table.userId),
    index("email_aliases_domain_id_idx").on(table.domainId),
    index("email_aliases_active_idx").on(table.userId, table.isActive),
  ]
);

// ============================================================
// USER DOMAIN PERMISSIONS TABLE
// ============================================================

export const userDomainPermissions = pgTable(
  "user_domain_permissions",
  {
    /** User ID */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Domain ID */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Can use this domain in From address */
    canSendAs: boolean("can_send_as").notNull().default(false),

    /** Can manage domain settings */
    canManage: boolean("can_manage").notNull().default(false),

    /** Can view domain analytics */
    canViewAnalytics: boolean("can_view_analytics").notNull().default(false),

    /** Can manage domain users */
    canManageUsers: boolean("can_manage_users").notNull().default(false),

    /** Granted by user ID */
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** When permission was granted */
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.domainId] }),
    index("user_domain_permissions_domain_idx").on(table.domainId),
    index("user_domain_permissions_user_idx").on(table.userId),
  ]
);

// ============================================================
// USER SESSIONS TABLE
// ============================================================

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Session owner */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Session token (hashed) */
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),

    /** User agent string */
    userAgent: text("user_agent"),

    /** IP address */
    ipAddress: varchar("ip_address", { length: 45 }),

    /** Device identifier */
    deviceId: varchar("device_id", { length: 64 }),

    /** Session expiry */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /** Last activity */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_idx").on(table.tokenHash),
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_expires_idx").on(table.expiresAt),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserEmailAddress = typeof userEmailAddresses.$inferSelect;
export type NewUserEmailAddress = typeof userEmailAddresses.$inferInsert;

export type EmailAlias = typeof emailAliases.$inferSelect;
export type NewEmailAlias = typeof emailAliases.$inferInsert;

export type UserDomainPermission = typeof userDomainPermissions.$inferSelect;
export type NewUserDomainPermission = typeof userDomainPermissions.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
