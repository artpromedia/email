/**
 * OonruMail Database - Shared Mailboxes Schema
 * Cross-domain shared mailbox support
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
  bigint,
  integer,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { sharedMailboxPermissionEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// ============================================================
// SHARED MAILBOXES TABLE
// ============================================================

export const sharedMailboxes = pgTable(
  "shared_mailboxes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Domain this mailbox belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Full email address */
    emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),

    /** Local part (before @) */
    localPart: varchar("local_part", { length: 64 }).notNull(),

    /** Display name */
    displayName: varchar("display_name", { length: 255 }).notNull(),

    /** Description of mailbox purpose */
    description: text("description"),

    /** Storage quota in bytes */
    quotaBytes: bigint("quota_bytes", { mode: "number" })
      .notNull()
      .default(10 * 1024 * 1024 * 1024), // 10 GB

    /** Storage used in bytes */
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),

    /** Total message count */
    messageCount: integer("message_count").notNull().default(0),

    /** Unread message count */
    unreadCount: integer("unread_count").notNull().default(0),

    /** Auto-reply enabled */
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),

    /** Auto-reply subject */
    autoReplySubject: varchar("auto_reply_subject", { length: 255 }),

    /** Auto-reply message body */
    autoReplyMessage: text("auto_reply_message"),

    /** Only send auto-reply during business hours */
    autoReplyBusinessHoursOnly: boolean("auto_reply_business_hours_only").notNull().default(false),

    /** Auto-reply start time (HH:MM) */
    businessHoursStart: varchar("business_hours_start", { length: 5 }).notNull().default("09:00"),

    /** Auto-reply end time (HH:MM) */
    businessHoursEnd: varchar("business_hours_end", { length: 5 }).notNull().default("17:00"),

    /** Business days (0 = Sunday, 6 = Saturday) */
    businessDays: integer("business_days")
      .array()
      .notNull()
      .default(sql`ARRAY[1,2,3,4,5]::integer[]`), // Mon-Fri

    /** Timezone for business hours */
    timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),

    /** Is mailbox active */
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
    uniqueIndex("shared_mailboxes_email_idx").on(table.emailAddress),
    uniqueIndex("shared_mailboxes_domain_local_idx").on(table.domainId, table.localPart),
    index("shared_mailboxes_organization_id_idx").on(table.organizationId),
    index("shared_mailboxes_domain_id_idx").on(table.domainId),
    index("shared_mailboxes_active_idx").on(table.organizationId, table.isActive),
  ]
);

// ============================================================
// SHARED MAILBOX MEMBERS TABLE
// ============================================================

export const sharedMailboxMembers = pgTable(
  "shared_mailbox_members",
  {
    /** Shared mailbox ID */
    sharedMailboxId: uuid("shared_mailbox_id")
      .notNull()
      .references(() => sharedMailboxes.id, { onDelete: "cascade" }),

    /** User ID */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Permission level */
    permission: sharedMailboxPermissionEnum("permission").notNull().default("read"),

    /** Can send emails as this address */
    canSendAs: boolean("can_send_as").notNull().default(false),

    /** Can delete messages */
    canDelete: boolean("can_delete").notNull().default(false),

    /** Receive notifications for new messages */
    notificationsEnabled: boolean("notifications_enabled").notNull().default(true),

    /** Added by user */
    addedBy: uuid("added_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** When member was added */
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sharedMailboxId, table.userId] }),
    index("shared_mailbox_members_user_id_idx").on(table.userId),
    index("shared_mailbox_members_mailbox_id_idx").on(table.sharedMailboxId),
  ]
);

// ============================================================
// SHARED MAILBOX FOLDERS TABLE
// ============================================================

export const sharedMailboxFolders = pgTable(
  "shared_mailbox_folders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent shared mailbox */
    sharedMailboxId: uuid("shared_mailbox_id")
      .notNull()
      .references(() => sharedMailboxes.id, { onDelete: "cascade" }),

    /** Folder name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Full path for nested folders */
    path: varchar("path", { length: 1000 }).notNull(),

    /** Parent folder for nesting */
    parentId: uuid("parent_id"),

    /** Sort order within parent */
    sortOrder: integer("sort_order").notNull().default(0),

    /** Is system folder (Inbox, Sent, etc.) */
    isSystem: boolean("is_system").notNull().default(false),

    /** System folder type */
    systemType: varchar("system_type", { length: 20 }),

    /** Total message count */
    messageCount: integer("message_count").notNull().default(0),

    /** Unread message count */
    unreadCount: integer("unread_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_mailbox_folders_mailbox_idx").on(table.sharedMailboxId),
    uniqueIndex("shared_mailbox_folders_path_idx").on(table.sharedMailboxId, table.path),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type SharedMailbox = typeof sharedMailboxes.$inferSelect;
export type NewSharedMailbox = typeof sharedMailboxes.$inferInsert;

export type SharedMailboxMember = typeof sharedMailboxMembers.$inferSelect;
export type NewSharedMailboxMember = typeof sharedMailboxMembers.$inferInsert;

export type SharedMailboxFolder = typeof sharedMailboxFolders.$inferSelect;
export type NewSharedMailboxFolder = typeof sharedMailboxFolders.$inferInsert;
