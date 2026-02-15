/**
 * Auth API client for authentication operations
 */

import { getAuthApiUrl } from "../api-url";
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  DomainInfo,
  SSOInitiateResponse,
  SSOCallbackRequest,
  UserEmail,
  AddEmailRequest,
  VerifyEmailRequest,
  UserSession,
  MFASetupResponse,
  MFAVerifyRequest,
  PasswordChangeRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AuthUser,
} from "./types";

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

/** Resolve auth API URL dynamically based on current domain */
function getAuthUrl(): string {
  return getAuthApiUrl();
}

class AuthApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    // Go auth service returns { error: "code", message: "msg" } at root level
    const rawError = data["error"];
    const rawMessage = data["message"];
    const errorCode =
      typeof rawError === "string"
        ? rawError
        : ((rawError as { code?: string } | undefined)?.code ?? "UNKNOWN_ERROR");
    const errorMessage =
      typeof rawMessage === "string"
        ? rawMessage
        : ((rawError as { message?: string } | undefined)?.message ?? "An error occurred");
    throw new AuthApiError(errorCode, errorMessage, response.status);
  }

  // Go auth service returns data at root level (no .data wrapper)
  return data as T;
}

/**
 * Map Go auth service login response to frontend LoginResponse type.
 * Go returns: { User: {...}, TokenPair: { AccessToken, RefreshToken, ... }, MFARequired, ... }
 * Frontend expects: { user: {...}, tokens: { accessToken, refreshToken, ... } }
 */
interface GoLoginResponse {
  User: Record<string, unknown>;
  TokenPair: {
    AccessToken: string;
    RefreshToken: string;
    ExpiresIn: number;
    SessionID: string;
  };
  Organization?: Record<string, unknown>;
  MFARequired?: boolean;
  MFAPendingToken?: string;
}

function mapLoginResponse(raw: GoLoginResponse): LoginResponse {
  return {
    user: mapUserResponse(raw.User),
    tokens: {
      accessToken: raw.TokenPair.AccessToken,
      refreshToken: raw.TokenPair.RefreshToken,
      expiresAt: new Date(Date.now() + raw.TokenPair.ExpiresIn * 1000).toISOString(),
    },
    requiresTwoFactor: raw.MFARequired ?? false,
  };
}

/**
 * Map Go auth service user response to frontend AuthUser type.
 * Go returns: { id, organization_id, display_name, role, status, email_addresses, domains, ... }
 * Frontend expects: { id, email, organizationId, role, profile: { displayName, ... }, ... }
 */
function mapUserResponse(raw: Record<string, unknown>): AuthUser {
  const emailAddresses = (raw["email_addresses"] ?? []) as { email: string; is_primary: boolean }[];
  const primaryEmail =
    emailAddresses.find((e) => e.is_primary)?.email ?? (raw["email"] as string) ?? "";
  const domains = (raw["domains"] ?? []) as { name: string }[];
  const primaryDomain = domains[0]?.name ?? primaryEmail.split("@")[1] ?? "";

  return {
    id: raw["id"] as string,
    email: primaryEmail,
    domain: primaryDomain,
    organizationId: (raw["organization_id"] as string) ?? "",
    role: mapRole(raw["role"] as string),
    status: (raw["status"] as AuthUser["status"]) ?? "active",
    profile: {
      displayName: (raw["display_name"] as string) ?? "",
      avatarUrl: (raw["avatar_url"] as { String?: string })?.String ?? undefined,
      timezone: (raw["timezone"] as string) ?? "UTC",
    },
    permissions: [],
  };
}

function mapRole(role: string): AuthUser["role"] {
  const roleMap: Record<string, AuthUser["role"]> = {
    super_admin: "super_admin",
    admin: "org_admin",
    org_admin: "org_admin",
    domain_admin: "domain_admin",
    member: "user",
    user: "user",
    guest: "guest",
  };
  return roleMap[role] ?? "user";
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const accessToken = localStorage.getItem("accessToken");
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Auth API client
 */
export const authApi = {
  /**
   * Detect domain info from email
   */
  async detectDomain(email: string): Promise<DomainInfo | null> {
    const domain = email.split("@")[1];
    if (!domain) return null;

    try {
      const response = await fetch(`${getAuthUrl()}/api/auth/domain/${domain}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.status === 404) {
        return null;
      }

      return await handleResponse<DomainInfo>(response);
    } catch {
      return null;
    }
  },

  /**
   * Login with email and password
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${getAuthUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const raw = await handleResponse<GoLoginResponse>(response);
    return mapLoginResponse(raw);
  },

  /**
   * Register a new user
   */
  async register(request: RegisterRequest): Promise<RegisterResponse> {
    const response = await fetch(`${getAuthUrl()}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: request.email,
        password: request.password,
        name: request.firstName
          ? `${request.firstName} ${request.lastName ?? ""}`.trim()
          : request.email.split("@")[0],
      }),
    });

    const raw = await handleResponse<GoLoginResponse>(response);
    const mapped = mapLoginResponse(raw);
    return {
      user: mapped.user,
      tokens: mapped.tokens,
      emailVerificationRequired: false,
    };
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await fetch(`${getAuthUrl()}/api/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  },

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<{ accessToken: string; expiresAt: string }> {
    const refreshToken = localStorage.getItem("refreshToken");

    const response = await fetch(`${getAuthUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    return handleResponse(response);
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<AuthUser> {
    const response = await fetch(`${getAuthUrl()}/api/auth/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const raw = await handleResponse<Record<string, unknown>>(response);
    return mapUserResponse(raw);
  },

  // SSO Operations

  /**
   * Initiate SSO login
   */
  async initiateSSOLogin(domain: string): Promise<SSOInitiateResponse> {
    const response = await fetch(`${getAuthUrl()}/api/sso/${domain}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    return handleResponse<SSOInitiateResponse>(response);
  },

  /**
   * Complete SSO callback
   */
  async completeSSOCallback(domain: string, request: SSOCallbackRequest): Promise<LoginResponse> {
    const response = await fetch(`${getAuthUrl()}/api/sso/${domain}/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    return handleResponse<LoginResponse>(response);
  },

  // Email Management

  /**
   * Get user's email addresses
   */
  async getEmails(): Promise<UserEmail[]> {
    const response = await fetch(`${getAuthUrl()}/api/auth/emails`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return handleResponse<UserEmail[]>(response);
  },

  /**
   * Add a new email address
   */
  async addEmail(request: AddEmailRequest): Promise<UserEmail> {
    const response = await fetch(`${getAuthUrl()}/api/auth/emails`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    return handleResponse<UserEmail>(response);
  },

  /**
   * Remove an email address
   */
  async removeEmail(emailId: string): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/emails/${emailId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to remove email",
        response.status
      );
    }
  },

  /**
   * Set an email as primary
   */
  async setPrimaryEmail(emailId: string): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/emails/${emailId}/primary`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to set primary email",
        response.status
      );
    }
  },

  /**
   * Resend verification email
   */
  async resendVerificationEmail(emailId: string): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/emails/${emailId}/resend-verification`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to resend verification",
        response.status
      );
    }
  },

  /**
   * Verify email with token
   */
  async verifyEmail(request: VerifyEmailRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to verify email",
        response.status
      );
    }
  },

  // Session Management

  /**
   * Get active sessions
   */
  async getSessions(): Promise<UserSession[]> {
    const response = await fetch(`${getAuthUrl()}/api/auth/sessions`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return handleResponse<UserSession[]>(response);
  },

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/sessions/${sessionId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to revoke session",
        response.status
      );
    }
  },

  /**
   * Revoke all other sessions
   */
  async revokeAllOtherSessions(): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/sessions/revoke-all`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to revoke sessions",
        response.status
      );
    }
  },

  // MFA Operations

  /**
   * Setup MFA
   */
  async setupMFA(): Promise<MFASetupResponse> {
    const response = await fetch(`${getAuthUrl()}/api/auth/mfa/setup`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    return handleResponse<MFASetupResponse>(response);
  },

  /**
   * Verify and enable MFA
   */
  async verifyMFA(request: MFAVerifyRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/mfa/verify`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Invalid MFA code",
        response.status
      );
    }
  },

  /**
   * Disable MFA
   */
  async disableMFA(request: MFAVerifyRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/mfa/disable`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to disable MFA",
        response.status
      );
    }
  },

  // Password Operations

  /**
   * Change password
   */
  async changePassword(request: PasswordChangeRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/password/change`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to change password",
        response.status
      );
    }
  },

  /**
   * Request password reset
   */
  async forgotPassword(request: ForgotPasswordRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to send reset email",
        response.status
      );
    }
  },

  /**
   * Reset password with token
   */
  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    const response = await fetch(`${getAuthUrl()}/api/auth/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new AuthApiError(
        data.error?.code ?? "UNKNOWN_ERROR",
        data.error?.message ?? "Failed to reset password",
        response.status
      );
    }
  },
};

export { AuthApiError };
