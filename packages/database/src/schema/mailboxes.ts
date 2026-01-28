/**
 * Enterprise Email Database - Mailboxes & Folders Schema
 * Domain-scoped mailboxes with hierarchical folder support
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { folderTypeEnum, systemFolderTypeEnum } from "./enums";
import { users } from "./users";

// ============================================================
// MAILBOX SETTINGS TYPE
// ============================================================

export interface MailboxSettings {
  /** Signature HTML for this mailbox */
  signature: string | null;
  /** Vacation auto-reply enabled */
  vacationEnabled: boolean;
  /** Vacation start date */
  vacationStartDate: string | null;
  /** Vacation end date */
  vacationEndDate: string | null;
  /** Vacation message subject */
  vacationSubject: string | null;
  /** Vacation message body */
  vacationMessage: string | null;
  /** Only send vacation reply once per sender */
  vacationOncePerSender: boolean;
  /** Forwarding enabled */
  forwardingEnabled: boolean;
  /** Forwarding address */
  forwardingAddress: string | null;
  /** Keep copy when forwarding */
  forwardingKeepCopy: boolean;
  /** Read receipts setting */
  readReceipts: "always" | "ask" | "never";
  /** Default reply behavior */
  defaultReplyBehavior: "reply" | "reply_all";
  /** Conversation view enabled */
  conversationViewEnabled: boolean;
  /** Preview pane position */
  previewPanePosition: "right" | "bottom" | "off";
  /** Messages per page */
  messagesPerPage: number;
}

// ============================================================
// MAILBOXES TABLE
// ============================================================

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Owner user */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Domain this mailbox belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Full email address */
    emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),

    /** Display name for this mailbox */
    displayName: varchar("display_name", { length: 255 }).notNull(),

    /** Is this the user's primary mailbox */
    isPrimary: boolean("is_primary").notNull().default(false),

    /** Storage quota in bytes */
    quotaBytes: bigint("quota_bytes", { mode: "number" })
      .notNull()
      .default(15 * 1024 * 1024 * 1024), // 15 GB

    /** Storage used in bytes */
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),

    /** Total message count */
    messageCount: integer("message_count").notNull().default(0),

    /** Unread message count */
    unreadCount: integer("unread_count").notNull().default(0),

    /** Mailbox settings */
    settings: jsonb("settings").$type<MailboxSettings>().default({
      signature: null,
      vacationEnabled: false,
      vacationStartDate: null,
      vacationEndDate: null,
      vacationSubject: null,
      vacationMessage: null,
      vacationOncePerSender: true,
      forwardingEnabled: false,
      forwardingAddress: null,
      forwardingKeepCopy: true,
      readReceipts: "ask",
      defaultReplyBehavior: "reply",
      conversationViewEnabled: true,
      previewPanePosition: "right",
      messagesPerPage: 50,
    }),

    /** Is mailbox active */
    isActive: boolean("is_active").notNull().default(true),

    /** Last email received timestamp */
    lastReceivedAt: timestamp("last_received_at", { withTimezone: true }),

    /** Last email sent timestamp */
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("mailboxes_email_address_idx").on(table.emailAddress),
    index("mailboxes_user_id_idx").on(table.userId),
    index("mailboxes_domain_id_idx").on(table.domainId),
    index("mailboxes_user_domain_idx").on(table.userId, table.domainId),
    index("mailboxes_user_primary_idx").on(table.userId, table.isPrimary),
  ]
);

// ============================================================
// FOLDERS TABLE
// ============================================================

export const folders = pgTable(
  "folders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent mailbox */
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),

    /** Folder name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Full path for nested folders (e.g., "Work/Projects/Active") */
    path: varchar("path", { length: 1000 }).notNull(),

    /** Folder type */
    folderType: folderTypeEnum("folder_type").notNull().default("custom"),

    /** System folder type (null for custom folders) */
    systemType: systemFolderTypeEnum("system_type"),

    /** Parent folder for nesting */
    parentId: uuid("parent_id"),

    /** Sort order within parent */
    sortOrder: integer("sort_order").notNull().default(0),

    /** Folder color (hex) */
    color: varchar("color", { length: 7 }),

    /** Folder icon name */
    icon: varchar("icon", { length: 50 }),

    /** Total message count */
    messageCount: integer("message_count").notNull().default(0),

    /** Unread message count */
    unreadCount: integer("unread_count").notNull().default(0),

    /** Total size in bytes */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),

    /** Is system folder */
    isSystem: boolean("is_system").notNull().default(false),

    /** Is folder visible in sidebar */
    isVisible: boolean("is_visible").notNull().default(true),

    /** Is folder expanded in UI */
    isExpanded: boolean("is_expanded").notNull().default(true),

    /** Can folder be deleted */
    isDeletable: boolean("is_deletable").notNull().default(true),

    /** Can folder be renamed */
    isRenamable: boolean("is_renamable").notNull().default(true),

    /** Auto-purge messages after N days (0 = disabled) */
    autoPurgeDays: integer("auto_purge_days").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("folders_mailbox_id_idx").on(table.mailboxId),
    index("folders_parent_id_idx").on(table.parentId),
    index("folders_mailbox_type_idx").on(table.mailboxId, table.folderType),
    index("folders_mailbox_system_type_idx").on(table.mailboxId, table.systemType),
    index("folders_path_idx").on(table.mailboxId, table.path),
    uniqueIndex("folders_mailbox_path_idx").on(table.mailboxId, table.path),
  ]
);

// ============================================================
// FOLDER RULES TABLE (per-folder automation)
// ============================================================

export const folderRules = pgTable(
  "folder_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Folder this rule applies to */
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),

    /** Rule name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Rule priority (lower = higher priority) */
    priority: integer("priority").notNull().default(100),

    /** Is rule enabled */
    isEnabled: boolean("is_enabled").notNull().default(true),

    /** Stop processing other rules if this matches */
    stopProcessing: boolean("stop_processing").notNull().default(false),

    /** Match conditions */
    conditions: jsonb("conditions").$type<FolderRuleCondition[]>().notNull(),

    /** Actions to perform */
    actions: jsonb("actions").$type<FolderRuleAction[]>().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("folder_rules_folder_id_idx").on(table.folderId),
    index("folder_rules_folder_priority_idx").on(table.folderId, table.priority),
  ]
);

// ============================================================
// FOLDER RULE TYPES
// ============================================================

export interface FolderRuleCondition {
  field: "from" | "to" | "cc" | "subject" | "body" | "has_attachment" | "size" | "date" | "header";
  operator:
    | "contains"
    | "not_contains"
    | "equals"
    | "not_equals"
    | "starts_with"
    | "ends_with"
    | "regex"
    | "greater_than"
    | "less_than"
    | "exists"
    | "not_exists";
  value: string;
  headerName?: string; // For header field type
}

export interface FolderRuleAction {
  type:
    | "move_to_folder"
    | "copy_to_folder"
    | "mark_read"
    | "mark_starred"
    | "add_label"
    | "remove_label"
    | "forward"
    | "delete"
    | "archive";
  folderId?: string; // For move/copy actions
  labelId?: string; // For label actions
  forwardAddress?: string; // For forward action
}

// ============================================================
// TYPES
// ============================================================

export type Mailbox = typeof mailboxes.$inferSelect;
export type NewMailbox = typeof mailboxes.$inferInsert;

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;

export type FolderRule = typeof folderRules.$inferSelect;
export type NewFolderRule = typeof folderRules.$inferInsert;
