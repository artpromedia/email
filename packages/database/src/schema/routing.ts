/**
 * Enterprise Email Database - Routing Rules Schema
 * Domain-level email routing and forwarding rules
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
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { routingActionEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// ============================================================
// ROUTING CONDITION AND ACTION TYPES
// ============================================================

export interface RoutingCondition {
  /** Field to match: from, to, cc, subject, header, body, attachment, size */
  field: string;
  /** Custom header name (if field is 'header') */
  headerName?: string;
  /** Operator: equals, contains, matches, startsWith, endsWith, greaterThan, lessThan */
  operator: string;
  /** Value to compare against */
  value: string;
  /** Is value a regex pattern */
  isRegex?: boolean;
  /** Case insensitive matching */
  caseInsensitive?: boolean;
}

export interface RoutingActionDetails {
  /** Forward to email addresses */
  forwardTo?: string[];
  /** BCC to email addresses */
  bccTo?: string[];
  /** Redirect (change envelope) to address */
  redirectTo?: string;
  /** Mailbox to deliver to (for deliver_to_mailbox action) */
  targetMailboxId?: string;
  /** Folder to deliver to (for deliver_to_folder action) */
  targetFolderId?: string;
  /** Custom reject message */
  rejectMessage?: string;
  /** Add headers */
  addHeaders?: Record<string, string>;
  /** Remove headers */
  removeHeaders?: string[];
  /** Modify subject */
  subjectPrefix?: string;
  subjectSuffix?: string;
  /** Add label */
  labelId?: string;
  /** Spam score threshold adjustment */
  spamScoreAdjustment?: number;
  /** Delay delivery by seconds */
  delaySeconds?: number;
  /** External webhook URL for notify action */
  webhookUrl?: string;
  /** Webhook payload template */
  webhookPayload?: string;
  /** Footer/disclaimer text (plain text) */
  footerText?: string;
  /** Footer/disclaimer HTML */
  footerHtml?: string;
}

// ============================================================
// DOMAIN ROUTING RULES TABLE
// ============================================================

export const domainRoutingRules = pgTable(
  "domain_routing_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Domain this rule applies to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Rule name for display */
    name: varchar("name", { length: 255 }).notNull(),

    /** Rule description */
    description: text("description"),

    /** Processing priority (lower = first) */
    priority: integer("priority").notNull().default(100),

    /** Is rule active */
    isActive: boolean("is_active").notNull().default(true),

    /** Apply to inbound emails */
    applyToInbound: boolean("apply_to_inbound").notNull().default(true),

    /** Apply to outbound emails */
    applyToOutbound: boolean("apply_to_outbound").notNull().default(false),

    /** Conditions that must ALL match (AND) */
    conditions: jsonb("conditions").notNull().$type<RoutingCondition[]>().default([]),

    /** Match mode: 'all' requires all conditions, 'any' requires at least one */
    matchMode: varchar("match_mode", { length: 10 }).notNull().default("all"),

    /** Action to take when conditions match */
    action: routingActionEnum("action").notNull().default("continue"),

    /** Action details/parameters */
    actionDetails: jsonb("action_details").notNull().$type<RoutingActionDetails>().default({}),

    /** Stop processing further rules after this one matches */
    stopProcessing: boolean("stop_processing").notNull().default(false),

    /** Log when rule matches */
    enableLogging: boolean("enable_logging").notNull().default(true),

    /** Count of times rule has matched */
    matchCount: integer("match_count").notNull().default(0),

    /** Last time rule matched */
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),

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
    index("domain_routing_rules_organization_idx").on(table.organizationId),
    index("domain_routing_rules_domain_idx").on(table.domainId),
    index("domain_routing_rules_priority_idx").on(table.domainId, table.isActive, table.priority),
    index("domain_routing_rules_active_idx").on(table.domainId, table.isActive),
    index("domain_routing_rules_inbound_idx").on(
      table.domainId,
      table.isActive,
      table.applyToInbound
    ),
    index("domain_routing_rules_outbound_idx").on(
      table.domainId,
      table.isActive,
      table.applyToOutbound
    ),
  ]
);

// ============================================================
// TRANSPORT RULES TABLE (Organization-wide)
// ============================================================

export const transportRules = pgTable(
  "transport_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Rule name for display */
    name: varchar("name", { length: 255 }).notNull(),

    /** Rule description */
    description: text("description"),

    /** Processing priority (lower = first) */
    priority: integer("priority").notNull().default(100),

    /** Is rule active */
    isActive: boolean("is_active").notNull().default(true),

    /** Apply to inbound emails */
    applyToInbound: boolean("apply_to_inbound").notNull().default(true),

    /** Apply to outbound emails */
    applyToOutbound: boolean("apply_to_outbound").notNull().default(false),

    /** Domains to apply to (empty = all) */
    applyToDomainIds: uuid("apply_to_domain_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),

    /** Conditions that must match */
    conditions: jsonb("conditions").notNull().$type<RoutingCondition[]>().default([]),

    /** Match mode */
    matchMode: varchar("match_mode", { length: 10 }).notNull().default("all"),

    /** Action to take */
    action: routingActionEnum("action").notNull().default("continue"),

    /** Action details */
    actionDetails: jsonb("action_details").notNull().$type<RoutingActionDetails>().default({}),

    /** Stop processing further rules */
    stopProcessing: boolean("stop_processing").notNull().default(false),

    /** Enable logging */
    enableLogging: boolean("enable_logging").notNull().default(true),

    /** Match count */
    matchCount: integer("match_count").notNull().default(0),

    /** Last matched */
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),

    /** Rule exceptions - email addresses that bypass this rule */
    exceptions: varchar("exceptions", { length: 255 })
      .array()
      .notNull()
      .default(sql`ARRAY[]::varchar[]`),

    /** Created by */
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
    index("transport_rules_organization_idx").on(table.organizationId),
    index("transport_rules_priority_idx").on(table.organizationId, table.isActive, table.priority),
    index("transport_rules_active_idx").on(table.organizationId, table.isActive),
  ]
);

// ============================================================
// ROUTING LOGS TABLE
// ============================================================

export const routingLogs = pgTable(
  "routing_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Domain */
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),

    /** Email message ID */
    messageId: varchar("message_id", { length: 255 }).notNull(),

    /** Rule that matched (domain rule) */
    domainRuleId: uuid("domain_rule_id").references(() => domainRoutingRules.id, {
      onDelete: "set null",
    }),

    /** Rule that matched (transport rule) */
    transportRuleId: uuid("transport_rule_id").references(() => transportRules.id, {
      onDelete: "set null",
    }),

    /** Rule name at time of match */
    ruleName: varchar("rule_name", { length: 255 }).notNull(),

    /** Action taken */
    action: routingActionEnum("action").notNull(),

    /** Direction: inbound/outbound */
    direction: varchar("direction", { length: 10 }).notNull(),

    /** Sender email */
    senderEmail: varchar("sender_email", { length: 255 }).notNull(),

    /** Recipient emails */
    recipientEmails: varchar("recipient_emails", { length: 255 })
      .array()
      .notNull()
      .default(sql`ARRAY[]::varchar[]`),

    /** Subject (truncated) */
    subject: varchar("subject", { length: 255 }),

    /** Conditions that matched */
    matchedConditions: jsonb("matched_conditions").$type<RoutingCondition[]>(),

    /** Action result details */
    actionResult: jsonb("action_result").$type<Record<string, unknown>>(),

    /** Processing time in milliseconds */
    processingTimeMs: integer("processing_time_ms"),

    /** Error message if action failed */
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("routing_logs_organization_idx").on(table.organizationId),
    index("routing_logs_domain_idx").on(table.domainId),
    index("routing_logs_message_id_idx").on(table.messageId),
    index("routing_logs_domain_rule_idx").on(table.domainRuleId),
    index("routing_logs_transport_rule_idx").on(table.transportRuleId),
    index("routing_logs_created_at_idx").on(table.organizationId, table.createdAt),
    index("routing_logs_sender_idx").on(table.organizationId, table.senderEmail),
  ]
);

// ============================================================
// TYPES
// ============================================================

export type DomainRoutingRule = typeof domainRoutingRules.$inferSelect;
export type NewDomainRoutingRule = typeof domainRoutingRules.$inferInsert;

export type TransportRule = typeof transportRules.$inferSelect;
export type NewTransportRule = typeof transportRules.$inferInsert;

export type RoutingLog = typeof routingLogs.$inferSelect;
export type NewRoutingLog = typeof routingLogs.$inferInsert;
