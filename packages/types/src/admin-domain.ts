/**
 * Admin Domain Management Types
 * Types for domain administration, DNS configuration, and DKIM management
 */

import { z } from "zod";

// ============================================================
// DOMAIN STATUS
// ============================================================

export const DomainStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

// ============================================================
// DNS RECORD TYPES
// ============================================================

export const DnsRecordType = {
  MX: "MX",
  TXT: "TXT",
  CNAME: "CNAME",
  SPF: "SPF",
  DKIM: "DKIM",
  DMARC: "DMARC",
} as const;

export type DnsRecordType = (typeof DnsRecordType)[keyof typeof DnsRecordType];

export const DnsRecordStatus = {
  VERIFIED: "verified",
  PENDING: "pending",
  FAILED: "failed",
  NOT_FOUND: "not_found",
} as const;

export type DnsRecordStatus = (typeof DnsRecordStatus)[keyof typeof DnsRecordStatus];

// ============================================================
// VERIFICATION TYPES
// ============================================================

export const VerificationMethod = {
  TXT_RECORD: "txt_record",
  CNAME_RECORD: "cname_record",
  META_TAG: "meta_tag",
} as const;

export type VerificationMethod = (typeof VerificationMethod)[keyof typeof VerificationMethod];

// ============================================================
// DOMAIN INTERFACES
// ============================================================

/**
 * DNS Record
 */
export interface DnsRecord {
  id: string;
  domainId: string;
  type: DnsRecordType;
  name: string;
  value: string;
  priority?: number;
  status: DnsRecordStatus;
  expected: string;
  found?: string;
  lastChecked?: Date;
  error?: string;
}

/**
 * Domain verification
 */
export interface DomainVerification {
  id: string;
  domainId: string;
  method: VerificationMethod;
  token: string;
  recordName: string;
  recordValue: string;
  status: "pending" | "verified" | "failed";
  verifiedAt?: Date;
  lastChecked?: Date;
  error?: string;
}

/**
 * DKIM Key
 */
export interface DkimKey {
  id: string;
  domainId: string;
  selector: string;
  algorithm: "rsa-2048" | "rsa-4096" | "ed25519";
  publicKey: string;
  privateKey?: string; // Only returned on creation
  status: "active" | "pending" | "inactive" | "expired";
  createdAt: Date;
  activatedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * Domain branding
 */
export interface DomainBranding {
  domainId: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  loginBackgroundUrl?: string;
  emailHeaderHtml?: string;
  emailFooterHtml?: string;
}

/**
 * Domain settings
 */
export interface DomainSettings {
  domainId: string;

  // Catch-all settings
  catchAllEnabled: boolean;
  catchAllAction: "deliver" | "forward" | "reject";
  catchAllDestination?: string;

  // Sending limits
  maxMessagesPerUserPerDay: number;
  maxRecipientsPerMessage: number;
  maxMessageSizeBytes: number;

  // Security
  requireTlsOutbound: boolean;
  blockList: string[];
  allowList: string[];
}

/**
 * Domain statistics
 */
export interface DomainStats {
  domainId: string;
  usersCount: number;
  emailAddressesCount: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  messagesSentToday: number;
  messagesReceivedToday: number;
  messagesSentThisMonth: number;
  messagesReceivedThisMonth: number;
}

/**
 * Complete domain entity
 */
export interface AdminDomain {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  status: DomainStatus;
  isPrimary: boolean;
  isVerified: boolean;

  // DNS status
  mxStatus: DnsRecordStatus;
  spfStatus: DnsRecordStatus;
  dkimStatus: DnsRecordStatus;
  dmarcStatus: DnsRecordStatus;

  // Statistics
  stats: DomainStats;

  // Timestamps
  createdAt: Date;
  verifiedAt?: Date;
  suspendedAt?: Date;
  updatedAt: Date;
}

/**
 * Domain with full details
 */
export interface AdminDomainDetail extends AdminDomain {
  verification?: DomainVerification;
  dnsRecords: DnsRecord[];
  dkimKeys: DkimKey[];
  settings: DomainSettings;
  branding: DomainBranding;
}

/**
 * Domain user (user with email on this domain)
 */
export interface DomainUser {
  userId: string;
  userName: string;
  emailAddresses: string[];
  role: string;
  status: string;
  storageUsedBytes: number;
  createdAt: Date;
}

// ============================================================
// REQUEST/RESPONSE TYPES
// ============================================================

/**
 * Create domain request
 */
export interface CreateDomainRequest {
  name: string;
  displayName: string;
  verificationMethod: VerificationMethod;
}

/**
 * Create domain response
 */
export interface CreateDomainResponse {
  domain: AdminDomain;
  verification: DomainVerification;
}

/**
 * Verify domain ownership request
 */
export interface VerifyDomainOwnershipRequest {
  domainId: string;
  verificationId: string;
}

/**
 * Configure DNS request
 */
export interface ConfigureDnsRequest {
  domainId: string;
  generateDkim: boolean;
  dkimSelector?: string;
}

/**
 * Configure DNS response
 */
export interface ConfigureDnsResponse {
  dnsRecords: DnsRecord[];
  dkimKey?: DkimKey;
}

/**
 * Update domain settings request
 */
export interface UpdateDomainSettingsRequest {
  domainId: string;
  displayName?: string;
  isPrimary?: boolean;
  settings?: Partial<DomainSettings>;
  branding?: Partial<DomainBranding>;
}

/**
 * Generate DKIM key request
 */
export interface GenerateDkimKeyRequest {
  domainId: string;
  selector: string;
  algorithm: "rsa-2048" | "rsa-4096" | "ed25519";
}

/**
 * Check DNS records request
 */
export interface CheckDnsRecordsRequest {
  domainId: string;
  recordTypes?: DnsRecordType[];
}

/**
 * Check DNS records response
 */
export interface CheckDnsRecordsResponse {
  records: DnsRecord[];
  allVerified: boolean;
  lastChecked: Date;
}

/**
 * Domain list query params
 */
export interface DomainListQuery {
  status?: DomainStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "createdAt" | "usersCount" | "storageUsed";
  sortOrder?: "asc" | "desc";
}

/**
 * Domain list response
 */
export interface DomainListResponse {
  domains: AdminDomain[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// WIZARD STATE TYPES
// ============================================================

/**
 * Add domain wizard step
 */
export type DomainWizardStep =
  | "enter-domain"
  | "verify-ownership"
  | "configure-dns"
  | "configure-settings";

/**
 * Add domain wizard state
 */
export interface DomainWizardState {
  currentStep: DomainWizardStep;
  domain?: AdminDomain;
  verification?: DomainVerification;
  dnsRecords?: DnsRecord[];
  dkimKey?: DkimKey;
  settings?: Partial<DomainSettings>;
  branding?: Partial<DomainBranding>;
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

export const createDomainSchema = z.object({
  name: z
    .string()
    .min(3, "Domain must be at least 3 characters")
    .max(253, "Domain must be at most 253 characters")
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/, "Invalid domain format (e.g., example.com)"),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
  verificationMethod: z.enum(["txt_record", "cname_record", "meta_tag"]),
});

export const updateDomainSettingsSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  isPrimary: z.boolean().optional(),
  settings: z
    .object({
      catchAllEnabled: z.boolean().optional(),
      catchAllAction: z.enum(["deliver", "forward", "reject"]).optional(),
      catchAllDestination: z.string().email().optional(),
      maxMessagesPerUserPerDay: z.number().min(1).max(100000).optional(),
      maxRecipientsPerMessage: z.number().min(1).max(1000).optional(),
      maxMessageSizeBytes: z.number().min(1024).max(104857600).optional(),
      requireTlsOutbound: z.boolean().optional(),
      blockList: z.array(z.string()).optional(),
      allowList: z.array(z.string()).optional(),
    })
    .optional(),
  branding: z
    .object({
      logoUrl: z.string().url().optional(),
      faviconUrl: z.string().url().optional(),
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      secondaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      loginBackgroundUrl: z.string().url().optional(),
      emailHeaderHtml: z.string().optional(),
      emailFooterHtml: z.string().optional(),
    })
    .optional(),
});

export const generateDkimKeySchema = z.object({
  selector: z
    .string()
    .min(1, "Selector is required")
    .max(63, "Selector must be at most 63 characters")
    .regex(/^[a-z0-9-]+$/, "Selector must contain only lowercase letters, numbers, and hyphens"),
  algorithm: z.enum(["rsa-2048", "rsa-4096", "ed25519"]),
});
