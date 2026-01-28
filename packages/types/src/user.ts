import { z } from "zod";

/**
 * User role enumeration
 */
export const UserRole = {
  SUPER_ADMIN: "super_admin",
  ORG_ADMIN: "org_admin",
  DOMAIN_ADMIN: "domain_admin",
  USER: "user",
  GUEST: "guest",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * User status enumeration
 */
export const UserStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Two-factor authentication method
 */
export const TwoFactorMethod = {
  TOTP: "totp",
  SMS: "sms",
  EMAIL: "email",
  BACKUP_CODES: "backup_codes",
} as const;

export type TwoFactorMethod = (typeof TwoFactorMethod)[keyof typeof TwoFactorMethod];

/**
 * User profile
 */
export interface UserProfile {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
  phoneNumber?: string;
  jobTitle?: string;
  department?: string;
}

/**
 * User preferences
 */
export interface UserPreferences {
  theme: "light" | "dark" | "system";
  emailsPerPage: number;
  defaultReplyBehavior: "reply" | "reply_all";
  signatureEnabled: boolean;
  signature?: string;
  vacationResponderEnabled: boolean;
  vacationResponderSubject?: string;
  vacationResponderBody?: string;
  vacationResponderStartDate?: Date;
  vacationResponderEndDate?: Date;
  notifyOnNewEmail: boolean;
  notifyOnMention: boolean;
  desktopNotifications: boolean;
  emailNotifications: boolean;
}

/**
 * Two-factor authentication settings
 */
export interface TwoFactorSettings {
  enabled: boolean;
  method?: TwoFactorMethod;
  verifiedAt?: Date;
  backupCodesRemaining?: number;
}

/**
 * User security settings
 */
export interface UserSecuritySettings {
  passwordChangedAt?: Date;
  passwordExpiresAt?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginUserAgent?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  twoFactor: TwoFactorSettings;
  activeSessions: number;
  allowedIpAddresses?: string[];
}

/**
 * Complete user entity
 */
export interface User {
  id: string;
  organizationId: string;
  email: string;
  domain: string;
  username: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  profile: UserProfile;
  preferences: UserPreferences;
  security: UserSecuritySettings;
  permissions: string[];
  quotaUsed: number;
  quotaLimit: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * User creation request
 */
export interface CreateUserRequest {
  email: string;
  username?: string;
  password: string;
  role?: UserRole;
  profile?: Partial<UserProfile>;
  permissions?: string[];
  quotaLimit?: number;
  sendWelcomeEmail?: boolean;
}

/**
 * User update request
 */
export interface UpdateUserRequest {
  email?: string;
  username?: string;
  role?: UserRole;
  status?: UserStatus;
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
  permissions?: string[];
  quotaLimit?: number;
}

/**
 * User authentication request
 */
export interface AuthenticateRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
}

/**
 * User authentication response
 */
export interface AuthenticateResponse {
  user: Omit<User, "passwordHash">;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  requiresTwoFactor?: boolean;
}

/**
 * Session information
 */
export interface UserSession {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isCurrentSession: boolean;
}

/**
 * Zod schemas for validation
 */
export const userProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(200).optional(),
  avatarUrl: z.string().url().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  phoneNumber: z.string().optional(),
  jobTitle: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
});

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50).optional(),
  password: z
    .string()
    .min(12)
    .regex(/[A-Z]/, "Password must contain uppercase letter")
    .regex(/[a-z]/, "Password must contain lowercase letter")
    .regex(/\d/, "Password must contain number")
    .regex(/[^A-Za-z0-9]/, "Password must contain special character"),
  role: z.enum(["super_admin", "org_admin", "domain_admin", "user", "guest"]).optional(),
  profile: userProfileSchema.partial().optional(),
  permissions: z.array(z.string()).optional(),
  quotaLimit: z.number().int().positive().optional(),
  sendWelcomeEmail: z.boolean().optional(),
});

export const authenticateRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  twoFactorCode: z.string().length(6).optional(),
  rememberMe: z.boolean().optional(),
});

/**
 * User list query parameters
 */
export interface UserListParams {
  organizationId?: string;
  domain?: string;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "email" | "createdAt" | "lastLoginAt" | "quotaUsed";
  sortOrder?: "asc" | "desc";
}
