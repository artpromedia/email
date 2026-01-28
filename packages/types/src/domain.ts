import { z } from "zod";

/**
 * Re-export domain types from config
 */
export {
  DomainStatus,
  VerificationType,
  type DomainConfig,
  type DkimConfig,
  type DnsRecord,
  type SpfConfig,
  type DmarcConfig,
} from "@email/config";

/**
 * Organization status enumeration
 */
export const OrganizationStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

/**
 * Organization plan enumeration
 */
export const OrganizationPlan = {
  FREE: "free",
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
} as const;

export type OrganizationPlan = (typeof OrganizationPlan)[keyof typeof OrganizationPlan];

/**
 * Organization billing settings
 */
export interface OrganizationBilling {
  plan: OrganizationPlan;
  status: "active" | "past_due" | "cancelled" | "trialing";
  customerId?: string;
  subscriptionId?: string;
  trialEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Organization quotas
 */
export interface OrganizationQuotas {
  maxUsers: number;
  maxDomains: number;
  maxStorageBytes: number;
  maxEmailsPerDay: number;
  maxEmailsPerMonth: number;
  maxAttachmentSize: number;
  maxRecipientsPerEmail: number;
  usedUsers: number;
  usedDomains: number;
  usedStorageBytes: number;
  usedEmailsToday: number;
  usedEmailsThisMonth: number;
}

/**
 * Organization settings
 */
export interface OrganizationSettings {
  defaultDomain?: string;
  allowCustomDomains: boolean;
  requireTwoFactor: boolean;
  allowPasswordLogin: boolean;
  allowSsoLogin: boolean;
  ssoProvider?: "google" | "microsoft" | "okta" | "custom";
  ssoConfig?: Record<string, unknown>;
  ipAllowlist?: string[];
  auditLogRetentionDays: number;
  emailRetentionDays: number;
  allowApiAccess: boolean;
  webhookEndpoint?: string;
  webhookSecret?: string;
}

/**
 * Complete organization entity
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  status: OrganizationStatus;
  billing: OrganizationBilling;
  quotas: OrganizationQuotas;
  settings: OrganizationSettings;
  primaryDomain?: string;
  domains: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Organization creation request
 */
export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  description?: string;
  primaryDomain: string;
  plan?: OrganizationPlan;
  adminEmail: string;
  adminPassword: string;
  settings?: Partial<OrganizationSettings>;
}

/**
 * Organization update request
 */
export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  settings?: Partial<OrganizationSettings>;
}

/**
 * Domain creation request
 */
export interface CreateDomainRequest {
  domain: string;
  isPrimary?: boolean;
  isDefault?: boolean;
}

/**
 * Domain verification status response
 */
export interface DomainVerificationStatus {
  domain: string;
  verified: boolean;
  dnsRecordsFound: {
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
    mx: boolean;
    verification: boolean;
  };
  errors: string[];
  checkedAt: Date;
}

/**
 * Zod schemas for validation
 */
export const createOrganizationRequestSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional(),
  primaryDomain: z
    .string()
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/),
  plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
  adminEmail: z.string().email(),
  adminPassword: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[^A-Za-z0-9]/),
  settings: z
    .object({
      allowCustomDomains: z.boolean().optional(),
      requireTwoFactor: z.boolean().optional(),
      allowPasswordLogin: z.boolean().optional(),
      allowSsoLogin: z.boolean().optional(),
      allowApiAccess: z.boolean().optional(),
    })
    .optional(),
});

export const createDomainRequestSchema = z.object({
  domain: z
    .string()
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/),
  isPrimary: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Organization list query parameters
 */
export interface OrganizationListParams {
  status?: OrganizationStatus;
  plan?: OrganizationPlan;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "createdAt" | "usedStorageBytes";
  sortOrder?: "asc" | "desc";
}

/**
 * Domain list query parameters
 */
export interface DomainListParams {
  organizationId?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "domain" | "createdAt" | "status";
  sortOrder?: "asc" | "desc";
}
