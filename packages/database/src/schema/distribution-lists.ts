/**
 * Enterprise Email Database - Distribution Lists Schema
 * Mailing lists with cross-domain membership support
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
  jsonb,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { distributionListMemberTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// ============================================================
// SETTINGS TYPES
// ============================================================

export interface DistributionListSettings {
  /** Allow posts from non-members */
  allowExternalPosts: boolean;
  /** Require moderation for all posts */
  moderationRequired: boolean;
  /** Moderator user IDs */
  moderatorIds: string[];
  /** Auto-add reply-to header pointing to list */
  replyToList: boolean;
  /** Custom reply-to address if not list address */
  customReplyTo?: string;
  /** Subject line prefix */
  subjectPrefix?: string;
  /** Welcome message for new members */
  welcomeMessage?: string;
  /** Maximum message size in bytes */
  maxMessageSize: number;
  /** Allowed sender domains (empty = all) */
  allowedSenderDomains: string[];
  /** Blocked sender addresses */
  blockedSenders: string[];
  /** Archive all messages */
  archiveEnabled: boolean;
  /** Digest frequency: 'none' | 'daily' | 'weekly' */
  digestFrequency: "none" | "daily" | "weekly";
  /** Footer text appended to all messages */
  footerText?: string;
  /** Include footer HTML */
  footerHtml?: string;
}

// ============================================================
// DISTRIBUTION LISTS TABLE
// ============================================================

export const distributionLists = pgTable(
  "distribution_lists",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Domain this list belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Full email address of the list */
    emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),

    /** Local part (before @) */
    localPart: varchar("local_part", { length: 64 }).notNull(),

    /** Display name */
    displayName: varchar("display_name", { length: 255 }).notNull(),

    /** Description of list purpose */
    description: text("description"),

    /** Is list hidden from global address list */
    isHidden: boolean("is_hidden").notNull().default(false),

    /** Is list open for anyone to join */
    isPublic: boolean("is_public").notNull().default(false),

    /** Require approval to join */
    requireApproval: boolean("require_approval").notNull().default(false),

    /** Owner user ID */
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /** List settings */
    settings: jsonb("settings")
      .notNull()
      .$type<DistributionListSettings>()
      .default({
        allowExternalPosts: false,
        moderationRequired: false,
        moderatorIds: [],
        replyToList: true,
        maxMessageSize: 25 * 1024 * 1024, // 25 MB
        allowedSenderDomains: [],
        blockedSenders: [],
        archiveEnabled: true,
        digestFrequency: "none",
      }),

    /** Member count (denormalized for performance) */
    memberCount: varchar("member_count", { length: 20 }).notNull().default("0"),

    /** Is list active */
    isActive: boolean("is_active").notNull().default(true),

    /** Created by user */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("distribution_lists_email_idx").on(table.emailAddress),
    uniqueIndex("distribution_lists_domain_local_idx").on(table.domainId, table.localPart),
    index("distribution_lists_organization_id_idx").on(table.organizationId),
    index("distribution_lists_domain_id_idx").on(table.domainId),
    index("distribution_lists_owner_id_idx").on(table.ownerId),
    index("distribution_lists_active_idx").on(table.organizationId, table.isActive),
    index("distribution_lists_public_idx").on(table.organizationId, table.isPublic),
  ]
);

// ============================================================
// DISTRIBUTION LIST MEMBERS TABLE
// ============================================================

export const distributionListMembers = pgTable(
  "distribution_list_members",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent distribution list */
    listId: uuid("list_id")
      .notNull()
      .references(() => distributionLists.id, { onDelete: "cascade" }),

    /** Member type: user, external email, or nested list */
    memberType: distributionListMemberTypeEnum("member_type").notNull().default("user"),

    /** User ID (if member is a user) */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),

    /** External email address (if member is external) */
    externalEmail: varchar("external_email", { length: 255 }),

    /** Nested list ID (if member is another list) */
    nestedListId: uuid("nested_list_id"),

    /** Display name override */
    displayNameOverride: varchar("display_name_override", { length: 255 }),

    /** Can post to list */
    canPost: boolean("can_post").notNull().default(true),

    /** Receive messages */
    receiveMessages: boolean("receive_messages").notNull().default(true),

    /** Receive digest instead of individual messages */
    digestOnly: boolean("digest_only").notNull().default(false),

    /** Is member a moderator */
    isModerator: boolean("is_moderator").notNull().default(false),

    /** Is member an admin (can manage members) */
    isAdmin: boolean("is_admin").notNull().default(false),

    /** Added by user */
    addedBy: uuid("added_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Approval status: pending, approved, rejected */
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("approved"),

    /** Notes about member */
    notes: text("notes"),

    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("distribution_list_members_list_id_idx").on(table.listId),
    index("distribution_list_members_user_id_idx").on(table.userId),
    index("distribution_list_members_external_idx").on(table.externalEmail),
    index("distribution_list_members_nested_list_idx").on(table.nestedListId),
    index("distribution_list_members_type_idx").on(table.listId, table.memberType),
    uniqueIndex("distribution_list_members_user_unique_idx")
      .on(table.listId, table.userId)
      .where(sql`user_id IS NOT NULL`),
    uniqueIndex("distribution_list_members_external_unique_idx")
      .on(table.listId, table.externalEmail)
      .where(sql`external_email IS NOT NULL`),
  ]
);

// ============================================================
// DISTRIBUTION LIST MESSAGE ARCHIVE TABLE
// ============================================================

export const distributionListArchive = pgTable(
  "distribution_list_archive",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent distribution list */
    listId: uuid("list_id")
      .notNull()
      .references(() => distributionLists.id, { onDelete: "cascade" }),

    /** Original email message ID */
    messageId: varchar("message_id", { length: 255 }).notNull(),

    /** Sender email address */
    senderEmail: varchar("sender_email", { length: 255 }).notNull(),

    /** Sender display name */
    senderName: varchar("sender_name", { length: 255 }),

    /** Email subject */
    subject: varchar("subject", { length: 1000 }).notNull(),

    /** Plain text body */
    bodyText: text("body_text"),

    /** HTML body */
    bodyHtml: text("body_html"),

    /** Number of recipients */
    recipientCount: varchar("recipient_count", { length: 20 }).notNull().default("0"),

    /** Was message moderated */
    wasModerated: boolean("was_moderated").notNull().default(false),

    /** Moderator user ID if moderated */
    moderatedBy: uuid("moderated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Message headers (JSON) */
    headers: jsonb("headers").$type<Record<string, string>>(),

    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("distribution_list_archive_list_id_idx").on(table.listId),
    index("distribution_list_archive_sent_at_idx").on(table.listId, table.sentAt),
    index("distribution_list_archive_sender_idx").on(table.listId, table.senderEmail),
    index("distribution_list_archive_message_id_idx").on(table.messageId),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type DistributionList = typeof distributionLists.$inferSelect;
export type NewDistributionList = typeof distributionLists.$inferInsert;

export type DistributionListMember = typeof distributionListMembers.$inferSelect;
export type NewDistributionListMember = typeof distributionListMembers.$inferInsert;

export type DistributionListArchiveEntry = typeof distributionListArchive.$inferSelect;
export type NewDistributionListArchiveEntry = typeof distributionListArchive.$inferInsert;
