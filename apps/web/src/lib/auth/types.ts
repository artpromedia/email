/**
 * Auth types for the web application
 */

export interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  acceptTerms: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  domain: string;
  organizationId: string;
  role: "super_admin" | "org_admin" | "domain_admin" | "user" | "guest";
  status: "pending" | "active" | "suspended" | "deleted";
  profile: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
  requiresTwoFactor?: boolean;
  requiresPasswordChange?: boolean;
}

export interface RegisterResponse {
  user: AuthUser;
  tokens: AuthTokens;
  emailVerificationRequired: boolean;
}

export interface DomainInfo {
  domain: string;
  organizationId: string;
  organizationName: string;
  logoUrl?: string;
  primaryColor?: string;
  ssoEnabled: boolean;
  ssoProvider?: "saml" | "oidc" | "google" | "microsoft" | "okta";
  passwordLoginEnabled: boolean;
  registrationEnabled: boolean;
}

export interface SSOInitiateResponse {
  redirectUrl: string;
  state: string;
}

export interface SSOCallbackRequest {
  code?: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export interface UserEmail {
  id: string;
  email: string;
  domain: string;
  isPrimary: boolean;
  isVerified: boolean;
  createdAt: string;
  verifiedAt?: string;
}

export interface AddEmailRequest {
  email: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface UserSession {
  id: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
  createdAt: string;
  lastActivityAt: string;
  isCurrentSession: boolean;
}

export interface MFASetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerifyRequest {
  code: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}
