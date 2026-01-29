/**
 * Admin Types
 * Types for domain management and admin console
 */

// ============================================================
// DOMAIN ADMIN TYPES
// ============================================================

/**
 * Domain status
 */
export type DomainStatus = "pending" | "active" | "suspended";

/**
 * DNS record types
 */
export type DnsRecordType = "MX" | "TXT" | "CNAME" | "A" | "AAAA";

/**
 * DNS record status
 */
export type DnsRecordStatus = "verified" | "missing" | "mismatch" | "pending";

/**
 * DKIM key status
 */
export type DkimKeyStatus = "active" | "pending" | "expired" | "disabled";

/**
 * DKIM algorithm
 */
export type DkimAlgorithm = "rsa-2048" | "rsa-4096" | "ed25519";

/**
 * Catch-all action
 */
export type CatchAllAction = "deliver" | "forward" | "reject";

// ============================================================
// DNS RECORD
// ============================================================

/**
 * DNS record for domain verification
 */
export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  expectedValue: string;
  foundValue?: string;
  status: DnsRecordStatus;
  priority?: number;
  ttl?: number;
  lastChecked?: Date;
  isRequired: boolean;
  description: string;
}

/**
 * DNS status summary
 */
export interface DnsStatus {
  mx: DnsRecordStatus;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
  lastChecked?: Date;
  isFullyVerified: boolean;
}

// ============================================================
// DKIM KEY
// ============================================================

/**
 * DKIM key for email signing
 */
export interface DkimKey {
  id: string;
  selector: string;
  algorithm: DkimAlgorithm;
  publicKey: string;
  privateKeyFingerprint?: string;
  status: DkimKeyStatus;
  createdAt: Date;
  expiresAt?: Date;
  lastUsed?: Date;
  dnsRecord: string;
}

/**
 * Generate DKIM key request
 */
export interface GenerateDkimKeyRequest {
  selector: string;
  algorithm: DkimAlgorithm;
}

// ============================================================
// DOMAIN SETTINGS
// ============================================================

/**
 * Catch-all configuration
 */
export interface CatchAllConfig {
  enabled: boolean;
  action: CatchAllAction;
  destinationAddress?: string;
}

/**
 * Sending limits
 */
export interface SendingLimits {
  maxMessagesPerUserPerDay: number;
  maxRecipientsPerMessage: number;
  maxMessageSizeMb: number;
}

/**
 * Security settings
 */
export interface SecuritySettings {
  requireTlsOutbound: boolean;
  blockList: string[];
  allowList: string[];
}

/**
 * Domain settings
 */
export interface DomainSettings {
  displayName: string;
  isPrimary: boolean;
  catchAll: CatchAllConfig;
  sendingLimits: SendingLimits;
  security: SecuritySettings;
  defaultUserQuotaMb: number;
}

// ============================================================
// DOMAIN BRANDING
// ============================================================

/**
 * Domain branding configuration
 */
export interface DomainBranding {
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  loginBackgroundUrl?: string;
  emailHeaderHtml?: string;
  emailFooterHtml?: string;
}

// ============================================================
// ADMIN DOMAIN (FULL)
// ============================================================

/**
 * Admin domain with all details
 */
export interface AdminDomain {
  id: string;
  domain: string;
  displayName: string;
  status: DomainStatus;
  isPrimary: boolean;
  usersCount: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  dnsStatus: DnsStatus;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  color: string;
}

/**
 * Admin domain with full details (for detail page)
 */
export interface AdminDomainDetail extends AdminDomain {
  dnsRecords: DnsRecord[];
  dkimKeys: DkimKey[];
  settings: DomainSettings;
  branding: DomainBranding;
}

// ============================================================
// DOMAIN USER
// ============================================================

/**
 * User within a domain
 */
export interface DomainUser {
  id: string;
  name: string;
  emailAddresses: string[];
  role: "admin" | "user" | "guest";
  status: "active" | "suspended" | "pending";
  storageUsedBytes: number;
  storageLimitBytes: number;
  lastActive?: Date;
  createdAt: Date;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

/**
 * List domains query
 */
export interface ListDomainsQuery {
  status?: DomainStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "domain" | "status" | "usersCount" | "storageUsed" | "createdAt";
  sortOrder?: "asc" | "desc";
}

/**
 * List domains response
 */
export interface ListDomainsResponse {
  domains: AdminDomain[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Create domain request (Step 1)
 */
export interface CreateDomainRequest {
  domain: string;
  displayName: string;
}

/**
 * Domain verification method
 */
export type VerificationMethod = "txt" | "cname" | "meta";

/**
 * Verification record to add
 */
export interface VerificationRecord {
  method: VerificationMethod;
  recordType: DnsRecordType;
  recordName: string;
  recordValue: string;
  instructions: string;
}

/**
 * Verify domain ownership request
 */
export interface VerifyDomainRequest {
  domainId: string;
  method: VerificationMethod;
}

/**
 * Verify domain ownership response
 */
export interface VerifyDomainResponse {
  verified: boolean;
  error?: string;
  record?: VerificationRecord;
}

/**
 * Configure domain DNS response
 */
export interface ConfigureDnsResponse {
  records: DnsRecord[];
  allVerified: boolean;
}

/**
 * Update domain settings request
 */
export interface UpdateDomainSettingsRequest {
  domainId: string;
  settings: Partial<DomainSettings>;
}

/**
 * Update domain branding request
 */
export interface UpdateDomainBrandingRequest {
  domainId: string;
  branding: Partial<DomainBranding>;
}

/**
 * List domain users query
 */
export interface ListDomainUsersQuery {
  domainId: string;
  search?: string;
  status?: "active" | "suspended" | "pending";
  role?: "admin" | "user" | "guest";
  page?: number;
  pageSize?: number;
}

/**
 * List domain users response
 */
export interface ListDomainUsersResponse {
  users: DomainUser[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Bulk user action
 */
export interface BulkUserAction {
  userIds: string[];
  action: "suspend" | "activate" | "delete" | "moveToDomain";
  targetDomainId?: string;
}

// ============================================================
// WIZARD STATE
// ============================================================

/**
 * Add domain wizard step
 */
export type AddDomainWizardStep = 1 | 2 | 3 | 4;

/**
 * Add domain wizard state
 */
export interface AddDomainWizardState {
  currentStep: AddDomainWizardStep;
  domainId?: string;
  domain: string;
  displayName: string;
  verificationMethod?: VerificationMethod;
  verificationRecord?: VerificationRecord;
  isVerified: boolean;
  dnsRecords: DnsRecord[];
  dnsVerified: boolean;
  settings: Partial<DomainSettings>;
  branding: Partial<DomainBranding>;
}

// ============================================================
// EXPORT TYPES
// ============================================================

export interface ExportDomainsRequest {
  format: "csv" | "json";
  domainIds?: string[];
}
