/**
 * OonruMail Database - AI Features Schema
 * Tables for AI-powered email analysis, smart replies, and automation
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  customType,
  pgEnum,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { emails } from "./emails";
import { users } from "./users";

// ============================================================
// AI ENUMS
// ============================================================

/** Auto-reply mode settings */
export const autoReplyModeEnum = pgEnum("auto_reply_mode", [
  "off",
  "suggest",
  "draft",
  "auto_send",
]);

/** Tone preference for AI responses */
export const tonePreferenceEnum = pgEnum("tone_preference", [
  "professional",
  "friendly",
  "casual",
  "formal",
  "concise",
]);

/** AI-detected email sentiment */
export const sentimentEnum = pgEnum("sentiment", ["positive", "neutral", "negative", "mixed"]);

/** AI-detected email intent */
export const emailIntentEnum = pgEnum("email_intent", [
  "inquiry",
  "request",
  "complaint",
  "feedback",
  "scheduling",
  "follow_up",
  "introduction",
  "notification",
  "promotion",
  "other",
]);

/** AI spam classification */
export const spamClassificationEnum = pgEnum("spam_classification", [
  "legitimate",
  "spam",
  "phishing",
  "scam",
  "promotional",
  "suspicious",
]);

/** User feedback type for spam training */
export const feedbackTypeEnum = pgEnum("feedback_type", [
  "false_positive",
  "false_negative",
  "correct",
]);

/** Auto-reply rule action */
export const autoReplyActionEnum = pgEnum("auto_reply_action", [
  "reply",
  "forward",
  "label",
  "archive",
  "delete",
  "notify",
]);

// ============================================================
// CUSTOM TYPES
// ============================================================

/** Custom vector type for pgvector extension */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
});

// ============================================================
// AI USER SETTINGS TABLE
// ============================================================

export interface AutoReplyRule {
  id: string;
  name: string;
  conditions: {
    from?: string[];
    subject?: string[];
    hasAttachment?: boolean;
    priority?: string;
    timeRange?: { start: string; end: string };
  };
  enabled: boolean;
}

export const aiUserSettings = pgTable(
  "ai_user_settings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** User this setting belongs to */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    /** Global AI features enabled */
    aiEnabled: boolean("ai_enabled").notNull().default(true),

    /** Auto-summarize incoming emails */
    autoSummarize: boolean("auto_summarize").notNull().default(false),

    /** Smart reply suggestions enabled */
    smartReplyEnabled: boolean("smart_reply_enabled").notNull().default(true),

    /** Auto-reply mode */
    autoReplyMode: autoReplyModeEnum("auto_reply_mode").notNull().default("off"),

    /** Auto-reply rules (JSON array) */
    autoReplyRules: jsonb("auto_reply_rules").$type<AutoReplyRule[]>().default([]),

    /** Preferred tone for AI-generated responses */
    tonePreference: tonePreferenceEnum("tone_preference").notNull().default("professional"),

    /** Custom instructions for AI (e.g., "Always sign with 'Best regards'") */
    customInstructions: text("custom_instructions"),

    /** Preferred language for AI responses (BCP 47 format) */
    languagePreference: varchar("language_preference", { length: 10 }).notNull().default("en"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_user_settings_user_id_idx").on(table.userId),
    index("ai_user_settings_ai_enabled_idx").on(table.aiEnabled),
  ]
);

// ============================================================
// AI DOMAIN SETTINGS TABLE
// ============================================================

export const aiDomainSettings = pgTable(
  "ai_domain_settings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Domain this setting belongs to */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" })
      .unique(),

    /** AI features enabled for this domain */
    aiEnabled: boolean("ai_enabled").notNull().default(true),

    /** Auto-reply allowed for domain users */
    autoReplyAllowed: boolean("auto_reply_allowed").notNull().default(true),

    /** Require human review before sending auto-replies */
    requireHumanReview: boolean("require_human_review").notNull().default(true),

    /** Custom AI model endpoint (for enterprise customers) */
    customModelEndpoint: text("custom_model_endpoint"),

    /** API key for custom model (encrypted) */
    customModelApiKey: text("custom_model_api_key"),

    /** Maximum auto-replies per user per day */
    maxAutoRepliesPerDay: integer("max_auto_replies_per_day").notNull().default(50),

    /** Allowed AI features (for granular control) */
    allowedFeatures: jsonb("allowed_features")
      .$type<{
        summarization: boolean;
        smartReply: boolean;
        autoReply: boolean;
        spamAnalysis: boolean;
        semanticSearch: boolean;
      }>()
      .default({
        summarization: true,
        smartReply: true,
        autoReply: true,
        spamAnalysis: true,
        semanticSearch: true,
      }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_domain_settings_domain_id_idx").on(table.domainId),
    index("ai_domain_settings_ai_enabled_idx").on(table.aiEnabled),
  ]
);

// ============================================================
// EMAIL AI ANALYSIS TABLE
// ============================================================

export interface ActionItem {
  id: string;
  description: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
}

export const emailAiAnalysis = pgTable(
  "email_ai_analysis",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email that was analyzed */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" })
      .unique(),

    /** AI-generated summary */
    summary: text("summary"),

    /** Detected sentiment */
    sentiment: sentimentEnum("sentiment"),

    /** Priority score (0.0 - 1.0) */
    priorityScore: real("priority_score"),

    /** Detected intent of the email */
    detectedIntent: emailIntentEnum("detected_intent"),

    /** AI-suggested category */
    category: varchar("category", { length: 100 }),

    /** Extracted action items */
    actionItems: jsonb("action_items").$type<ActionItem[]>().default([]),

    /** Questions asked in the email */
    questionsAsked: jsonb("questions_asked").$type<string[]>().default([]),

    /** Whether email requires a response */
    requiresResponse: boolean("requires_response").notNull().default(false),

    /** Suggested response deadline */
    suggestedDeadline: timestamp("suggested_deadline", { withTimezone: true }),

    /** Key topics/entities mentioned */
    topics: jsonb("topics").$type<string[]>().default([]),

    /** Model used for analysis */
    model: varchar("model", { length: 100 }).notNull(),

    /** Analysis confidence score (0.0 - 1.0) */
    confidence: real("confidence"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_ai_analysis_email_id_idx").on(table.emailId),
    index("email_ai_analysis_sentiment_idx").on(table.sentiment),
    index("email_ai_analysis_intent_idx").on(table.detectedIntent),
    index("email_ai_analysis_requires_response_idx").on(table.requiresResponse),
    index("email_ai_analysis_priority_score_idx").on(table.priorityScore),
  ]
);

// ============================================================
// EMAIL EMBEDDINGS TABLE
// ============================================================

export const emailEmbeddings = pgTable(
  "email_embeddings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email this embedding belongs to */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" })
      .unique(),

    /** Vector embedding (1536 dimensions for OpenAI ada-002) */
    embedding: vector("embedding").notNull(),

    /** Model used to generate embedding */
    model: varchar("model", { length: 100 }).notNull().default("text-embedding-ada-002"),

    /** Content hash to detect changes */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_embeddings_email_id_idx").on(table.emailId),
    index("email_embeddings_model_idx").on(table.model),
    // Note: Vector similarity index should be created via raw SQL migration:
    // CREATE INDEX email_embeddings_embedding_idx ON email_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ]
);

// ============================================================
// SMART REPLY SUGGESTIONS TABLE
// ============================================================

export const smartReplySuggestions = pgTable(
  "smart_reply_suggestions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email this suggestion is for */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),

    /** Suggested reply content */
    content: text("content").notNull(),

    /** Tone of the suggestion */
    tone: tonePreferenceEnum("tone").notNull(),

    /** Confidence score (0.0 - 1.0) */
    confidenceScore: real("confidence_score").notNull(),

    /** Order/rank of suggestion */
    displayOrder: integer("display_order").notNull().default(0),

    /** Was this suggestion used */
    wasUsed: boolean("was_used").notNull().default(false),

    /** User feedback on suggestion quality */
    userFeedback: varchar("user_feedback", { length: 50 }),

    /** Model used to generate suggestion */
    model: varchar("model", { length: 100 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("smart_reply_suggestions_email_id_idx").on(table.emailId),
    index("smart_reply_suggestions_was_used_idx").on(table.wasUsed),
    index("smart_reply_suggestions_confidence_idx").on(table.confidenceScore),
  ]
);

// ============================================================
// AUTO-REPLY RULES TABLE
// ============================================================

export interface AutoReplyConditions {
  fromAddresses?: string[];
  fromDomains?: string[];
  subjectContains?: string[];
  bodyContains?: string[];
  hasAttachment?: boolean;
  priority?: string;
  timeRange?: {
    start: string; // HH:mm format
    end: string;
    timezone: string;
    daysOfWeek: number[]; // 0-6, Sunday = 0
  };
  labels?: string[];
}

export interface AutoReplySafeguards {
  maxRepliesPerSender: number;
  maxRepliesPerDay: number;
  cooldownMinutes: number;
  excludeDomains: string[];
  excludeAddresses: string[];
  requireKeywords: string[];
}

export const autoReplyRules = pgTable(
  "auto_reply_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** User who created this rule */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Rule name */
    name: varchar("name", { length: 255 }).notNull(),

    /** Rule description */
    description: text("description"),

    /** Is rule active */
    isActive: boolean("is_active").notNull().default(true),

    /** Conditions that trigger this rule */
    conditions: jsonb("conditions").$type<AutoReplyConditions>().notNull(),

    /** Action to take */
    action: autoReplyActionEnum("action").notNull().default("reply"),

    /** Reply template (can include placeholders) */
    replyTemplate: text("reply_template"),

    /** AI instructions for generating reply */
    aiInstructions: text("ai_instructions"),

    /** Safety guardrails */
    safeguards: jsonb("safeguards").$type<AutoReplySafeguards>().default({
      maxRepliesPerSender: 3,
      maxRepliesPerDay: 50,
      cooldownMinutes: 60,
      excludeDomains: [],
      excludeAddresses: [],
      requireKeywords: [],
    }),

    /** Rule priority (higher = evaluated first) */
    priority: integer("priority").notNull().default(0),

    /** Number of times this rule has been triggered */
    triggerCount: integer("trigger_count").notNull().default(0),

    /** Last time this rule was triggered */
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("auto_reply_rules_user_id_idx").on(table.userId),
    index("auto_reply_rules_is_active_idx").on(table.isActive),
    index("auto_reply_rules_user_active_priority_idx").on(
      table.userId,
      table.isActive,
      table.priority
    ),
  ]
);

// ============================================================
// AUTO-REPLY LOG TABLE
// ============================================================

export const autoReplyLog = pgTable(
  "auto_reply_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Rule that triggered this action */
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => autoReplyRules.id, { onDelete: "cascade" }),

    /** Original email that triggered the reply */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),

    /** User who owns the rule */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Action that was taken */
    actionTaken: autoReplyActionEnum("action_taken").notNull(),

    /** Generated reply content (if applicable) */
    generatedReply: text("generated_reply"),

    /** ID of the sent reply email (if applicable) */
    sentEmailId: uuid("sent_email_id"),

    /** Was the reply sent or just drafted */
    wasSent: boolean("was_sent").notNull().default(false),

    /** Was human review required */
    requiredReview: boolean("required_review").notNull().default(false),

    /** Was the reply approved (if review required) */
    wasApproved: boolean("was_approved"),

    /** Error message if action failed */
    errorMessage: text("error_message"),

    /** Processing time in milliseconds */
    processingTimeMs: integer("processing_time_ms"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auto_reply_log_rule_id_idx").on(table.ruleId),
    index("auto_reply_log_email_id_idx").on(table.emailId),
    index("auto_reply_log_user_id_idx").on(table.userId),
    index("auto_reply_log_created_at_idx").on(table.createdAt),
    index("auto_reply_log_user_date_idx").on(table.userId, table.createdAt),
  ]
);

// ============================================================
// SPAM ANALYSIS TABLE
// ============================================================

export interface SpamIndicators {
  hasSpammySubject: boolean;
  hasSuspiciousLinks: boolean;
  hasMismatchedUrls: boolean;
  hasUrgentLanguage: boolean;
  hasFinancialRequest: boolean;
  hasCredentialRequest: boolean;
  hasSpoofedSender: boolean;
  hasUnsubscribeLink: boolean;
  bulkMailHeaders: boolean;
  lowSenderReputation: boolean;
}

export const spamAnalysis = pgTable(
  "spam_analysis",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email that was analyzed */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" })
      .unique(),

    /** Overall spam score (0.0 - 1.0) */
    spamScore: real("spam_score").notNull(),

    /** Phishing probability score (0.0 - 1.0) */
    phishingScore: real("phishing_score").notNull(),

    /** AI classification result */
    aiClassification: spamClassificationEnum("ai_classification").notNull(),

    /** Classification confidence (0.0 - 1.0) */
    confidence: real("confidence").notNull(),

    /** Detailed indicators */
    indicators: jsonb("indicators").$type<SpamIndicators>().notNull(),

    /** Reasons for classification */
    reasons: jsonb("reasons").$type<string[]>().default([]),

    /** Model used for analysis */
    model: varchar("model", { length: 100 }).notNull(),

    /** Was this overridden by user */
    userOverridden: boolean("user_overridden").notNull().default(false),

    /** User's override classification */
    userClassification: spamClassificationEnum("user_classification"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spam_analysis_email_id_idx").on(table.emailId),
    index("spam_analysis_spam_score_idx").on(table.spamScore),
    index("spam_analysis_classification_idx").on(table.aiClassification),
    index("spam_analysis_phishing_score_idx").on(table.phishingScore),
  ]
);

// ============================================================
// SPAM TRAINING FEEDBACK TABLE
// ============================================================

export const spamTrainingFeedback = pgTable(
  "spam_training_feedback",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Email that feedback is for */
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),

    /** User providing feedback */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** User's classification */
    userClassification: spamClassificationEnum("user_classification").notNull(),

    /** Type of feedback */
    feedbackType: feedbackTypeEnum("feedback_type").notNull(),

    /** Optional user comment */
    comment: text("comment"),

    /** Was this feedback used for training */
    usedForTraining: boolean("used_for_training").notNull().default(false),

    /** When feedback was used for training */
    trainedAt: timestamp("trained_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("spam_training_feedback_email_id_idx").on(table.emailId),
    index("spam_training_feedback_user_id_idx").on(table.userId),
    index("spam_training_feedback_type_idx").on(table.feedbackType),
    index("spam_training_feedback_training_idx").on(table.usedForTraining),
    uniqueIndex("spam_training_feedback_email_user_idx").on(table.emailId, table.userId),
  ]
);

// ============================================================
// SENDER REPUTATION TABLE
// ============================================================

export interface SenderStats {
  totalEmails: number;
  spamEmails: number;
  phishingEmails: number;
  legitimateEmails: number;
  userReportsSpam: number;
  userReportsNotSpam: number;
  bounceCount: number;
  complaintCount: number;
  lastSeen: string;
  firstSeen: string;
}

export const senderReputation = pgTable(
  "sender_reputation",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** SHA-256 hash of sender email (for privacy) */
    senderHash: varchar("sender_hash", { length: 64 }).notNull().unique(),

    /** Sender's domain (stored separately for domain-level analysis) */
    domain: varchar("domain", { length: 255 }).notNull(),

    /** Overall reputation score (0.0 - 1.0, higher is better) */
    reputationScore: real("reputation_score").notNull().default(0.5),

    /** Aggregated statistics */
    stats: jsonb("stats").$type<SenderStats>().notNull().default({
      totalEmails: 0,
      spamEmails: 0,
      phishingEmails: 0,
      legitimateEmails: 0,
      userReportsSpam: 0,
      userReportsNotSpam: 0,
      bounceCount: 0,
      complaintCount: 0,
      lastSeen: new Date().toISOString(),
      firstSeen: new Date().toISOString(),
    }),

    /** Is sender on global blocklist */
    isBlocked: boolean("is_blocked").notNull().default(false),

    /** Reason for blocking */
    blockReason: text("block_reason"),

    /** Is sender whitelisted */
    isWhitelisted: boolean("is_whitelisted").notNull().default(false),

    /** Authentication results (SPF, DKIM, DMARC pass rates) */
    authStats: jsonb("auth_stats")
      .$type<{
        spfPassRate: number;
        dkimPassRate: number;
        dmarcPassRate: number;
      }>()
      .default({
        spfPassRate: 0,
        dkimPassRate: 0,
        dmarcPassRate: 0,
      }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("sender_reputation_hash_idx").on(table.senderHash),
    index("sender_reputation_domain_idx").on(table.domain),
    index("sender_reputation_score_idx").on(table.reputationScore),
    index("sender_reputation_blocked_idx").on(table.isBlocked),
  ]
);

// ============================================================
// TYPE EXPORTS
// ============================================================

export type AiUserSettings = typeof aiUserSettings.$inferSelect;
export type NewAiUserSettings = typeof aiUserSettings.$inferInsert;

export type AiDomainSettings = typeof aiDomainSettings.$inferSelect;
export type NewAiDomainSettings = typeof aiDomainSettings.$inferInsert;

export type EmailAiAnalysis = typeof emailAiAnalysis.$inferSelect;
export type NewEmailAiAnalysis = typeof emailAiAnalysis.$inferInsert;

export type EmailEmbedding = typeof emailEmbeddings.$inferSelect;
export type NewEmailEmbedding = typeof emailEmbeddings.$inferInsert;

export type SmartReplySuggestion = typeof smartReplySuggestions.$inferSelect;
export type NewSmartReplySuggestion = typeof smartReplySuggestions.$inferInsert;

export type AutoReplyRuleRecord = typeof autoReplyRules.$inferSelect;
export type NewAutoReplyRule = typeof autoReplyRules.$inferInsert;

export type AutoReplyLogRecord = typeof autoReplyLog.$inferSelect;
export type NewAutoReplyLog = typeof autoReplyLog.$inferInsert;

export type SpamAnalysisRecord = typeof spamAnalysis.$inferSelect;
export type NewSpamAnalysis = typeof spamAnalysis.$inferInsert;

export type SpamTrainingFeedbackRecord = typeof spamTrainingFeedback.$inferSelect;
export type NewSpamTrainingFeedback = typeof spamTrainingFeedback.$inferInsert;

export type SenderReputationRecord = typeof senderReputation.$inferSelect;
export type NewSenderReputation = typeof senderReputation.$inferInsert;
