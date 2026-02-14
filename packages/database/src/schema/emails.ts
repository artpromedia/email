/**
 * OonruMail Database - Emails & Threads Schema
 * Email storage with threading and domain tracking
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { emailPriorityEnum, emailDirectionEnum, emailDeliveryStatusEnum } from "./enums";
import { mailboxes, folders } from "./mailboxes";

// ============================================================
// EMAIL ADDRESS TYPE
// ============================================================

export interface EmailAddress {
  email: string;
  name: string | null;
}

// ============================================================
// THREADS TABLE
// ============================================================

export const threads = pgTable(
  "threads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent mailbox */
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),

    /** Thread subject (from first message) */
    subject: text("subject").notNull(),

    /** Preview snippet from latest message */
    snippet: varchar("snippet", { length: 500 }),

    /** All participant email addresses */
    participantAddresses: text("participant_addresses")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    /** All participant domains (for domain filtering) */
    participantDomains: text("participant_domains")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    /** Number of messages in thread */
    messageCount: integer("message_count").notNull().default(1),

    /** Number of attachments across all messages */
    attachmentCount: integer("attachment_count").notNull().default(0),

    /** Total size of all messages in bytes */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),

    /** Timestamp of most recent message */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),

    /** Are all messages in thread read */
    isRead: boolean("is_read").notNull().default(false),

    /** Is thread starred */
    isStarred: boolean("is_starred").notNull().default(false),

    /** Is thread archived */
    isArchived: boolean("is_archived").notNull().default(false),

    /** Is thread snoozed */
    isSnoozed: boolean("is_snoozed").notNull().default(false),

    /** Snooze until timestamp */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),

    /** Is thread muted (no notifications) */
    isMuted: boolean("is_muted").notNull().default(false),

    /** Is thread in trash */
    isTrashed: boolean("is_trashed").notNull().default(false),

    /** When thread was trashed (for auto-purge) */
    trashedAt: timestamp("trashed_at", { withTimezone: true }),

    /** Is thread spam */
    isSpam: boolean("is_spam").notNull().default(false),

    /** Is thread a draft thread */
    isDraft: boolean("is_draft").notNull().default(false),

    /** Applied label IDs */
    labelIds: uuid("label_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),

    /** Thread importance score (for smart inbox) */
    importanceScore: integer("importance_score").notNull().default(50),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("threads_mailbox_id_idx").on(table.mailboxId),
    index("threads_mailbox_last_message_idx").on(table.mailboxId, table.lastMessageAt),
    index("threads_mailbox_read_idx").on(table.mailboxId, table.isRead),
    index("threads_mailbox_starred_idx").on(table.mailboxId, table.isStarred),
    index("threads_mailbox_trashed_idx").on(table.mailboxId, table.isTrashed),
    index("threads_mailbox_spam_idx").on(table.mailboxId, table.isSpam),
    index("threads_mailbox_archived_idx").on(table.mailboxId, table.isArchived),
    index("threads_participant_domains_idx").using("gin", table.participantDomains),
    index("threads_label_ids_idx").using("gin", table.labelIds),
    index("threads_snoozed_idx").on(table.isSnoozed, table.snoozedUntil),
  ]
);

// ============================================================
// EMAILS TABLE
// ============================================================

export const emails = pgTable(
  "emails",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent thread */
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),

    /** Parent mailbox (denormalized for performance) */
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),

    /** Current folder */
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),

    /** RFC 5322 Message-ID header */
    messageId: varchar("message_id", { length: 255 }).notNull(),

    /** In-Reply-To header */
    inReplyTo: varchar("in_reply_to", { length: 255 }),

    /** References header (full) */
    referencesHeader: text("references_header"),

    /** From email address */
    fromAddress: varchar("from_address", { length: 255 }).notNull(),

    /** From display name */
    fromName: varchar("from_name", { length: 255 }),

    /** From domain (extracted for filtering) */
    fromDomain: varchar("from_domain", { length: 255 }).notNull(),

    /** To recipients */
    toAddresses: jsonb("to_addresses").$type<EmailAddress[]>().notNull(),

    /** CC recipients */
    ccAddresses: jsonb("cc_addresses").$type<EmailAddress[]>().default([]),

    /** BCC recipients (only visible to sender) */
    bccAddresses: jsonb("bcc_addresses").$type<EmailAddress[]>().default([]),

    /** Reply-To address */
    replyToAddress: varchar("reply_to_address", { length: 255 }),

    /** Email subject */
    subject: text("subject").notNull(),

    /** Preview snippet */
    snippet: varchar("snippet", { length: 500 }),

    /** Plain text body */
    bodyText: text("body_text"),

    /** HTML body */
    bodyHtml: text("body_html"),

    /** Has attachments */
    hasAttachments: boolean("has_attachments").notNull().default(false),

    /** Number of attachments */
    attachmentCount: integer("attachment_count").notNull().default(0),

    /** Email size in bytes */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),

    /** Email direction */
    direction: emailDirectionEnum("direction").notNull().default("inbound"),

    /** Is internal (all participants in same org) */
    isInternal: boolean("is_internal").notNull().default(false),

    /** Spans multiple org domains */
    isCrossDomain: boolean("is_cross_domain").notNull().default(false),

    /** Email priority */
    priority: emailPriorityEnum("priority").notNull().default("normal"),

    /** Is email read */
    isRead: boolean("is_read").notNull().default(false),

    /** Is email starred */
    isStarred: boolean("is_starred").notNull().default(false),

    /** Is email a draft */
    isDraft: boolean("is_draft").notNull().default(false),

    /** Delivery status */
    deliveryStatus: emailDeliveryStatusEnum("delivery_status").notNull().default("delivered"),

    /** Delivery status message */
    deliveryStatusMessage: text("delivery_status_message"),

    /** When email was sent (from headers) */
    sentAt: timestamp("sent_at", { withTimezone: true }),

    /** When email was received by server */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),

    /** Raw email headers (JSONB) */
    rawHeaders: jsonb("raw_headers").$type<Record<string, string>>(),

    /** Spam score (0-100) */
    spamScore: integer("spam_score").notNull().default(0),

    /** Phishing risk detected */
    isPhishing: boolean("is_phishing").notNull().default(false),

    /** DKIM verification result */
    dkimVerified: boolean("dkim_verified"),

    /** SPF verification result */
    spfVerified: boolean("spf_verified"),

    /** DMARC verification result */
    dmarcVerified: boolean("dmarc_verified"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("emails_thread_id_idx").on(table.threadId),
    index("emails_mailbox_id_idx").on(table.mailboxId),
    index("emails_folder_id_idx").on(table.folderId),
    uniqueIndex("emails_message_id_idx").on(table.messageId),
    index("emails_mailbox_received_idx").on(table.mailboxId, table.receivedAt),
    index("emails_from_domain_idx").on(table.fromDomain),
    index("emails_from_address_idx").on(table.fromAddress),
    index("emails_thread_received_idx").on(table.threadId, table.receivedAt),
    index("emails_is_read_idx").on(table.mailboxId, table.isRead),
    index("emails_is_starred_idx").on(table.mailboxId, table.isStarred),
    index("emails_direction_idx").on(table.mailboxId, table.direction),
    index("emails_delivery_status_idx").on(table.deliveryStatus),
  ]
);

// ============================================================
// EMAIL ATTACHMENTS TABLE
// ============================================================

export const emailAttachments = pgTable(
  "email_attachments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent email */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),

    /** Original filename */
    filename: varchar("filename", { length: 255 }).notNull(),

    /** MIME type */
    mimeType: varchar("mime_type", { length: 127 }).notNull(),

    /** File size in bytes */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

    /** Content-ID for inline attachments */
    contentId: varchar("content_id", { length: 255 }),

    /** Is inline attachment (embedded in body) */
    isInline: boolean("is_inline").notNull().default(false),

    /** Storage path/key (S3, MinIO, etc.) */
    storagePath: text("storage_path").notNull(),

    /** Storage bucket */
    storageBucket: varchar("storage_bucket", { length: 63 }).notNull(),

    /** Checksum (SHA-256) */
    checksum: varchar("checksum", { length: 64 }).notNull(),

    /** Virus scan status */
    virusScanStatus: varchar("virus_scan_status", { length: 20 }).notNull().default("pending"), // pending, clean, infected, error

    /** Virus scan result message */
    virusScanResult: text("virus_scan_result"),

    /** When virus scan was performed */
    virusScanAt: timestamp("virus_scan_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_attachments_email_id_idx").on(table.emailId),
    index("email_attachments_checksum_idx").on(table.checksum),
    index("email_attachments_mime_type_idx").on(table.mimeType),
  ]
);

// ============================================================
// LABELS TABLE (per-mailbox custom labels)
// ============================================================

export const labels = pgTable(
  "labels",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent mailbox */
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),

    /** Label name */
    name: varchar("name", { length: 100 }).notNull(),

    /** Label color (hex) */
    color: varchar("color", { length: 7 }).notNull().default("#4285f4"),

    /** Text color for contrast */
    textColor: varchar("text_color", { length: 7 }).notNull().default("#ffffff"),

    /** Is label visible in label list */
    isVisible: boolean("is_visible").notNull().default(true),

    /** Sort order */
    sortOrder: integer("sort_order").notNull().default(0),

    /** Number of threads with this label */
    threadCount: integer("thread_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("labels_mailbox_id_idx").on(table.mailboxId),
    uniqueIndex("labels_mailbox_name_idx").on(table.mailboxId, table.name),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;

export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type NewEmailAttachment = typeof emailAttachments.$inferInsert;

export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;
