/**
 * Enterprise Email Database - Organizations Schema
 * Core multi-tenant organization table
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { subscriptionTierEnum } from "./enums";

// ============================================================
// ORGANIZATION SETTINGS TYPE
// ============================================================

export interface OrganizationSettings {
  /** Default storage quota per user in bytes */
  defaultUserQuotaBytes: number;
  /** Maximum attachment size in bytes */
  maxAttachmentSizeBytes: number;
  /** Enable two-factor authentication requirement */
  requireTwoFactor: boolean;
  /** Session timeout in minutes */
  sessionTimeoutMinutes: number;
  /** Password policy */
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    expirationDays: number;
  };
  /** Default email retention days (-1 for unlimited) */
  emailRetentionDays: number;
  /** Allowed IP ranges for access (CIDR notation) */
  allowedIpRanges: string[];
  /** Custom branding settings */
  branding: {
    primaryColor: string;
    logoUrl: string | null;
    faviconUrl: string | null;
  };
}

// ============================================================
// ORGANIZATIONS TABLE
// ============================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Organization display name */
    name: varchar("name", { length: 255 }).notNull(),

    /** URL-safe unique identifier */
    slug: varchar("slug", { length: 100 }).notNull().unique(),

    /** Organization logo URL */
    logoUrl: text("logo_url"),

    /** Organization-wide settings and policies */
    settings: jsonb("settings")
      .$type<OrganizationSettings>()
      .default({
        defaultUserQuotaBytes: 15 * 1024 * 1024 * 1024, // 15 GB
        maxAttachmentSizeBytes: 25 * 1024 * 1024, // 25 MB
        requireTwoFactor: false,
        sessionTimeoutMinutes: 480, // 8 hours
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          expirationDays: 90,
        },
        emailRetentionDays: -1, // unlimited
        allowedIpRanges: [],
        branding: {
          primaryColor: "#1a73e8",
          logoUrl: null,
          faviconUrl: null,
        },
      }),

    /** Subscription tier */
    subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("free"),

    /** Maximum domains allowed (-1 for unlimited) */
    maxDomains: integer("max_domains").notNull().default(1),

    /** Maximum users allowed (-1 for unlimited) */
    maxUsers: integer("max_users").notNull().default(5),

    /** Total storage quota in bytes (-1 for unlimited) */
    storageQuotaBytes: text("storage_quota_bytes").notNull().default("5368709120"), // 5 GB as string for bigint

    /** Used storage in bytes */
    storageUsedBytes: text("storage_used_bytes").notNull().default("0"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    index("organizations_subscription_tier_idx").on(table.subscriptionTier),
    index("organizations_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
