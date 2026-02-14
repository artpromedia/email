/**
 * OonruMail Database - Domains Schema
 * Multi-domain support with DNS verification and DKIM keys
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
  bigint,
} from "drizzle-orm/pg-core";
import {
  domainStatusEnum,
  verificationMethodEnum,
  catchAllActionEnum,
  dnsRecordTypeEnum,
  dkimAlgorithmEnum,
} from "./enums";
import { organizations } from "./organizations";

// ============================================================
// DOMAIN BRANDING TYPE
// ============================================================

export interface DomainBranding {
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary brand color (hex) */
  secondaryColor: string;
  /** Accent color (hex) */
  accentColor: string;
  /** Logo URL */
  logoUrl: string | null;
  /** Logo URL for dark mode */
  logoDarkUrl: string | null;
  /** Favicon URL */
  faviconUrl: string | null;
  /** Login page background image URL */
  loginBackgroundUrl: string | null;
  /** Custom CSS for domain-specific styling */
  customCss: string | null;
}

// ============================================================
// DOMAINS TABLE
// ============================================================

export const domains = pgTable(
  "domains",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent organization */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Fully qualified domain name */
    domainName: varchar("domain_name", { length: 255 }).notNull().unique(),

    /** Human-readable display name (e.g., "Example Corp" for example.com) */
    displayName: varchar("display_name", { length: 255 }).notNull(),

    /** Is this the primary domain for the organization */
    isPrimary: boolean("is_primary").notNull().default(false),

    /** Domain ownership verified */
    isVerified: boolean("is_verified").notNull().default(false),

    /** Unique token for domain verification */
    verificationToken: varchar("verification_token", { length: 64 })
      .notNull()
      .default(sql`encode(gen_random_bytes(32), 'hex')`),

    /** Method used for verification */
    verificationMethod: verificationMethodEnum("verification_method").notNull().default("dns_txt"),

    /** When the domain was verified */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    /** Current domain status */
    status: domainStatusEnum("status").notNull().default("pending"),

    /** MX records configured correctly */
    mxVerified: boolean("mx_verified").notNull().default(false),

    /** SPF record verified */
    spfVerified: boolean("spf_verified").notNull().default(false),

    /** DKIM signing verified */
    dkimVerified: boolean("dkim_verified").notNull().default(false),

    /** DMARC policy verified */
    dmarcVerified: boolean("dmarc_verified").notNull().default(false),

    /** BIMI record verified */
    bimiVerified: boolean("bimi_verified").notNull().default(false),

    /** MTA-STS policy verified */
    mtaStsVerified: boolean("mta_sts_verified").notNull().default(false),

    /** TLS-RPT record verified */
    tlsRptVerified: boolean("tls_rpt_verified").notNull().default(false),

    /** Catch-all email address (nullable) */
    catchAllAddress: varchar("catch_all_address", { length: 255 }),

    /** Action for catch-all emails */
    catchAllAction: catchAllActionEnum("catch_all_action").notNull().default("reject"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("domains_domain_name_idx").on(table.domainName),
    index("domains_organization_id_idx").on(table.organizationId),
    index("domains_status_idx").on(table.status),
    index("domains_organization_domain_idx").on(table.organizationId, table.domainName),
    index("domains_organization_primary_idx").on(table.organizationId, table.isPrimary),
  ]
);

// ============================================================
// DOMAIN DNS RECORDS TABLE
// ============================================================

export const domainDnsRecords = pgTable(
  "domain_dns_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent domain */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** Type of DNS record */
    recordType: dnsRecordTypeEnum("record_type").notNull(),

    /** Record name (e.g., "mail._domainkey", "@", "mail") */
    recordName: varchar("record_name", { length: 255 }).notNull(),

    /** Full record value */
    recordValue: text("record_value").notNull(),

    /** Is this record required for proper operation */
    isRequired: boolean("is_required").notNull().default(true),

    /** Has this record been verified */
    isVerified: boolean("is_verified").notNull().default(false),

    /** Last DNS check timestamp */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),

    /** Error message from last verification attempt */
    lastCheckError: text("last_check_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("domain_dns_records_domain_id_idx").on(table.domainId),
    index("domain_dns_records_type_idx").on(table.domainId, table.recordType),
    index("domain_dns_records_verified_idx").on(table.domainId, table.isVerified),
  ]
);

// ============================================================
// DOMAIN DKIM KEYS TABLE
// ============================================================

export const domainDkimKeys = pgTable(
  "domain_dkim_keys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Parent domain */
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),

    /** DKIM selector (e.g., "mail", "mail2024") */
    selector: varchar("selector", { length: 63 }).notNull(),

    /** Encrypted private key (encrypted at rest) */
    privateKeyEncrypted: text("private_key_encrypted").notNull(),

    /** Public key for DNS TXT record */
    publicKey: text("public_key").notNull(),

    /** Algorithm used for key generation */
    algorithm: dkimAlgorithmEnum("algorithm").notNull().default("rsa2048"),

    /** Is this the active signing key */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Key expiration date */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** When the key was rotated out */
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => [
    index("domain_dkim_keys_domain_id_idx").on(table.domainId),
    index("domain_dkim_keys_active_idx").on(table.domainId, table.selector, table.isActive),
    uniqueIndex("domain_dkim_keys_domain_selector_idx").on(table.domainId, table.selector),
  ]
);

// ============================================================
// DOMAIN SETTINGS TABLE
// ============================================================

export const domainSettings = pgTable("domain_settings", {
  /** Domain ID (primary key, 1:1 with domains) */
  domainId: uuid("domain_id")
    .primaryKey()
    .references(() => domains.id, { onDelete: "cascade" }),

  /** Custom branding configuration */
  branding: jsonb("branding").$type<DomainBranding>().default({
    primaryColor: "#1a73e8",
    secondaryColor: "#0078d4",
    accentColor: "#4285f4",
    logoUrl: null,
    logoDarkUrl: null,
    faviconUrl: null,
    loginBackgroundUrl: null,
    customCss: null,
  }),

  /** Default email signature HTML */
  defaultSignature: text("default_signature"),

  /** Footer text appended to all outgoing emails */
  footerText: text("footer_text"),

  /** Maximum attachment size in bytes */
  maxAttachmentSize: bigint("max_attachment_size", { mode: "number" }).notNull().default(26214400), // 25 MB

  /** Restrict sending to these domains only (empty = no restriction) */
  allowedRecipientDomains: text("allowed_recipient_domains")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),

  /** Require TLS for outbound connections */
  requireTlsOutbound: boolean("require_tls_outbound").notNull().default(false),

  /** Auto-BCC addresses for compliance */
  autoBcc: varchar("auto_bcc", { length: 255 })
    .array()
    .notNull()
    .default(sql`ARRAY[]::varchar[]`),

  /** Enable sending from this domain */
  sendingEnabled: boolean("sending_enabled").notNull().default(true),

  /** Enable receiving to this domain */
  receivingEnabled: boolean("receiving_enabled").notNull().default(true),

  /** Spam filter aggressiveness (0-100) */
  spamFilterLevel: bigint("spam_filter_level", { mode: "number" }).notNull().default(50),

  /** Virus scanning enabled */
  virusScanEnabled: boolean("virus_scan_enabled").notNull().default(true),

  /** Content filtering rules (JSONB) */
  contentFilterRules: jsonb("content_filter_rules").$type<ContentFilterRule[]>().default([]),

  /** BIMI configuration */
  bimiConfig: jsonb("bimi_config").$type<BIMIConfig>().default({
    enabled: false,
    selector: "default",
    logoUrl: null,
    vmcUrl: null,
    lastVerifiedAt: null,
    logoValid: false,
    vmcValid: false,
  }),

  /** MTA-STS configuration */
  mtaStsConfig: jsonb("mta_sts_config").$type<MTASTSConfig>().default({
    enabled: false,
    mode: "none",
    mxHosts: [],
    maxAge: 604800,
    policyId: "",
    tlsRptEmail: null,
    lastVerifiedAt: null,
  }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// BIMI CONFIGURATION TYPE
// ============================================================

export interface BIMIConfig {
  /** BIMI enabled */
  enabled: boolean;
  /** BIMI selector (default: "default") */
  selector: string;
  /** Logo URL (must be HTTPS, SVG Tiny PS format) */
  logoUrl: string | null;
  /** Verified Mark Certificate URL (optional but recommended for Gmail) */
  vmcUrl: string | null;
  /** Last verification timestamp */
  lastVerifiedAt: string | null;
  /** Whether logo has been validated */
  logoValid: boolean;
  /** Whether VMC has been validated */
  vmcValid: boolean;
}

// ============================================================
// MTA-STS CONFIGURATION TYPE
// ============================================================

export interface MTASTSConfig {
  /** MTA-STS enabled */
  enabled: boolean;
  /** Policy mode: none, testing, enforce */
  mode: "none" | "testing" | "enforce";
  /** MX host patterns */
  mxHosts: string[];
  /** Policy max age in seconds */
  maxAge: number;
  /** Policy ID (changes when policy changes) */
  policyId: string;
  /** TLS-RPT reporting email */
  tlsRptEmail: string | null;
  /** Last verification timestamp */
  lastVerifiedAt: string | null;
}

// ============================================================
// CONTENT FILTER RULE TYPE
// ============================================================

export interface ContentFilterRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Is rule enabled */
  enabled: boolean;
  /** Match criteria */
  criteria: {
    field: "subject" | "body" | "from" | "to" | "headers";
    operator: "contains" | "equals" | "regex" | "starts_with" | "ends_with";
    value: string;
    caseSensitive: boolean;
  }[];
  /** Action to take */
  action: "quarantine" | "reject" | "tag" | "redirect";
  /** Action parameters */
  actionParams: Record<string, string>;
}

// ============================================================
// TYPES
// ============================================================

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;

export type DomainDnsRecord = typeof domainDnsRecords.$inferSelect;
export type NewDomainDnsRecord = typeof domainDnsRecords.$inferInsert;

export type DomainDkimKey = typeof domainDkimKeys.$inferSelect;
export type NewDomainDkimKey = typeof domainDkimKeys.$inferInsert;

export type DomainSettings = typeof domainSettings.$inferSelect;
export type NewDomainSettings = typeof domainSettings.$inferInsert;
