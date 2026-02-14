import { z } from "zod";

/**
 * Domain validation regex
 */
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Domain status enumeration
 */
export const DomainStatus = {
  PENDING: "pending",
  VERIFYING: "verifying",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

/**
 * Domain verification type enumeration
 */
export const VerificationType = {
  DNS_TXT: "dns_txt",
  DNS_CNAME: "dns_cname",
  EMAIL: "email",
  FILE: "file",
} as const;

export type VerificationType = (typeof VerificationType)[keyof typeof VerificationType];

/**
 * DKIM configuration for a domain
 */
export interface DkimConfig {
  selector: string;
  privateKeyPath: string;
  publicKey?: string;
  algorithm: "rsa-sha256" | "rsa-sha1";
  canonicalization: "relaxed/relaxed" | "relaxed/simple" | "simple/relaxed" | "simple/simple";
  keySize: number;
}

/**
 * DNS record configuration
 */
export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX" | "A" | "AAAA" | "SRV";
  name: string;
  value: string;
  ttl: number;
  priority?: number;
}

/**
 * SPF configuration
 */
export interface SpfConfig {
  mechanisms: string[];
  qualifier: "+" | "-" | "~" | "?";
  includes: string[];
}

/**
 * DMARC configuration
 */
export interface DmarcConfig {
  policy: "none" | "quarantine" | "reject";
  subdomainPolicy?: "none" | "quarantine" | "reject";
  percentage: number;
  reportEmail?: string;
  forensicEmail?: string;
  adkim: "r" | "s";
  aspf: "r" | "s";
}

/**
 * Complete domain configuration
 */
export interface DomainConfig {
  domain: string;
  status: DomainStatus;
  isPrimary: boolean;
  isDefault: boolean;
  organizationId: string;
  verification: {
    type: VerificationType;
    token: string;
    verifiedAt?: Date;
    expiresAt?: Date;
  };
  dkim: DkimConfig;
  spf: SpfConfig;
  dmarc: DmarcConfig;
  mxRecords: DnsRecord[];
  customRecords: DnsRecord[];
  settings: {
    maxEmailsPerDay: number;
    maxEmailsPerHour: number;
    maxRecipientsPerEmail: number;
    allowedSenderPatterns: string[];
    blockedRecipientPatterns: string[];
    requireTls: boolean;
    trackOpens: boolean;
    trackClicks: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for domain validation
 */
export const domainSchema = z.string().regex(DOMAIN_REGEX, "Invalid domain format").min(4).max(253);

/**
 * Zod schema for domain configuration
 */
export const domainConfigSchema = z.object({
  domain: domainSchema,
  status: z.enum(["pending", "verifying", "active", "suspended", "deleted"]),
  isPrimary: z.boolean(),
  isDefault: z.boolean(),
  organizationId: z.string().uuid(),
  verification: z.object({
    type: z.enum(["dns_txt", "dns_cname", "email", "file"]),
    token: z.string().min(32),
    verifiedAt: z.date().optional(),
    expiresAt: z.date().optional(),
  }),
  dkim: z.object({
    selector: z.string().min(1).max(63),
    privateKeyPath: z.string(),
    publicKey: z.string().optional(),
    algorithm: z.enum(["rsa-sha256", "rsa-sha1"]),
    canonicalization: z.enum([
      "relaxed/relaxed",
      "relaxed/simple",
      "simple/relaxed",
      "simple/simple",
    ]),
    keySize: z.number().int().min(1024).max(4096),
  }),
  spf: z.object({
    mechanisms: z.array(z.string()),
    qualifier: z.enum(["+", "-", "~", "?"]),
    includes: z.array(z.string()),
  }),
  dmarc: z.object({
    policy: z.enum(["none", "quarantine", "reject"]),
    subdomainPolicy: z.enum(["none", "quarantine", "reject"]).optional(),
    percentage: z.number().int().min(0).max(100),
    reportEmail: z.string().email().optional(),
    forensicEmail: z.string().email().optional(),
    adkim: z.enum(["r", "s"]),
    aspf: z.enum(["r", "s"]),
  }),
  mxRecords: z.array(
    z.object({
      type: z.literal("MX"),
      name: z.string(),
      value: z.string(),
      ttl: z.number().int().positive(),
      priority: z.number().int().nonnegative(),
    })
  ),
  customRecords: z.array(
    z.object({
      type: z.enum(["TXT", "CNAME", "MX", "A", "AAAA", "SRV"]),
      name: z.string(),
      value: z.string(),
      ttl: z.number().int().positive(),
      priority: z.number().int().nonnegative().optional(),
    })
  ),
  settings: z.object({
    maxEmailsPerDay: z.number().int().positive(),
    maxEmailsPerHour: z.number().int().positive(),
    maxRecipientsPerEmail: z.number().int().positive(),
    allowedSenderPatterns: z.array(z.string()),
    blockedRecipientPatterns: z.array(z.string()),
    requireTls: z.boolean(),
    trackOpens: z.boolean(),
    trackClicks: z.boolean(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Validate a domain name
 */
export function isValidDomain(domain: string): boolean {
  return domainSchema.safeParse(domain).success;
}

/**
 * Extract the domain from an email address
 */
export function extractDomain(email: string): string | null {
  const match = /@([^@]+)$/.exec(email);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Check if a domain is allowed based on configuration
 */
export function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  return allowedDomains.some((allowed) => allowed.toLowerCase() === normalizedDomain);
}

/**
 * Generate a domain verification token
 */
export function generateVerificationToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate DNS TXT record value for domain verification
 */
export function generateVerificationDnsRecord(prefix: string, token: string): DnsRecord {
  return {
    type: "TXT",
    name: prefix,
    value: `v=oonrumail;t=${token}`,
    ttl: 3600,
  };
}

/**
 * Generate SPF record value
 */
export function generateSpfRecord(config: SpfConfig, _domain: string): string {
  const parts = ["v=spf1"];

  for (const mechanism of config.mechanisms) {
    parts.push(mechanism);
  }

  for (const include of config.includes) {
    parts.push(`include:${include}`);
  }

  parts.push(`${config.qualifier}all`);

  return parts.join(" ");
}

/**
 * Generate DMARC record value
 */
export function generateDmarcRecord(config: DmarcConfig): string {
  const parts = [`v=DMARC1`, `p=${config.policy}`];

  if (config.subdomainPolicy) {
    parts.push(`sp=${config.subdomainPolicy}`);
  }

  parts.push(
    `pct=${config.percentage}`,
    ...(config.reportEmail ? [`rua=mailto:${config.reportEmail}`] : []),
    ...(config.forensicEmail ? [`ruf=mailto:${config.forensicEmail}`] : []),
    `adkim=${config.adkim}`,
    `aspf=${config.aspf}`
  );

  return parts.join("; ");
}

/**
 * Generate DKIM DNS record name
 */
export function generateDkimRecordName(selector: string): string {
  return `${selector}._domainkey`;
}

/**
 * Create default domain configuration
 */
export function createDefaultDomainConfig(
  domain: string,
  organizationId: string,
  options: {
    isPrimary?: boolean;
    isDefault?: boolean;
    dkimSelector?: string;
    dkimKeysPath?: string;
  } = {}
): Omit<DomainConfig, "createdAt" | "updatedAt" | "verification"> & {
  verification: Omit<DomainConfig["verification"], "verifiedAt" | "expiresAt">;
} {
  return {
    domain: domain.toLowerCase(),
    status: DomainStatus.PENDING,
    isPrimary: options.isPrimary ?? false,
    isDefault: options.isDefault ?? false,
    organizationId,
    verification: {
      type: VerificationType.DNS_TXT,
      token: generateVerificationToken(),
    },
    dkim: {
      selector: options.dkimSelector ?? "mail",
      privateKeyPath: `${options.dkimKeysPath ?? "/etc/dkim/keys"}/${domain}/private.key`,
      algorithm: "rsa-sha256",
      canonicalization: "relaxed/relaxed",
      keySize: 2048,
    },
    spf: {
      mechanisms: ["mx", "a"],
      qualifier: "-",
      includes: [],
    },
    dmarc: {
      policy: "quarantine",
      percentage: 100,
      adkim: "s",
      aspf: "s",
    },
    mxRecords: [
      {
        type: "MX",
        name: "@",
        value: `mail.${domain}`,
        ttl: 3600,
        priority: 10,
      },
    ],
    customRecords: [],
    settings: {
      maxEmailsPerDay: 10000,
      maxEmailsPerHour: 2000,
      maxRecipientsPerEmail: 500,
      allowedSenderPatterns: ["*"],
      blockedRecipientPatterns: [],
      requireTls: true,
      trackOpens: true,
      trackClicks: true,
    },
  };
}
