/**
 * Auth API client for authentication operations
 */

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

const AUTH_API_URL = process.env["NEXT_PUBLIC_AUTH_API_URL"] ?? "http://localhost:8081";

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
  const data = (await response.json()) as ApiErrorResponse & { data?: T };

  if (!response.ok) {
    throw new AuthApiError(
      data.error?.code ?? "UNKNOWN_ERROR",
      data.error?.message ?? "An error occurred",
      response.status,
      data.error?.details
    );
  }

  return data.data as T;
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
      const response = await fetch(`${AUTH_API_URL}/api/v1/auth/domain/${domain}`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    return handleResponse<LoginResponse>(response);
  },

  /**
   * Register a new user
   */
  async register(request: RegisterRequest): Promise<RegisterResponse> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    return handleResponse<RegisterResponse>(response);
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await fetch(`${AUTH_API_URL}/api/v1/auth/logout`, {
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

    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/refresh`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return handleResponse<AuthUser>(response);
  },

  // SSO Operations

  /**
   * Initiate SSO login
   */
  async initiateSSOLogin(domain: string): Promise<SSOInitiateResponse> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/sso/${domain}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    return handleResponse<SSOInitiateResponse>(response);
  },

  /**
   * Complete SSO callback
   */
  async completeSSOCallback(domain: string, request: SSOCallbackRequest): Promise<LoginResponse> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/sso/${domain}/callback`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/emails`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return handleResponse<UserEmail[]>(response);
  },

  /**
   * Add a new email address
   */
  async addEmail(request: AddEmailRequest): Promise<UserEmail> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/emails`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/emails/${emailId}`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/emails/${emailId}/primary`, {
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
    const response = await fetch(
      `${AUTH_API_URL}/api/v1/auth/emails/${emailId}/resend-verification`,
      {
        method: "POST",
        headers: getAuthHeaders(),
      }
    );

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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/verify-email`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/sessions`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return handleResponse<UserSession[]>(response);
  },

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/sessions/${sessionId}`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/sessions/revoke-all`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/mfa/setup`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    return handleResponse<MFASetupResponse>(response);
  },

  /**
   * Verify and enable MFA
   */
  async verifyMFA(request: MFAVerifyRequest): Promise<void> {
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/mfa/verify`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/mfa/disable`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/password/change`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/password/forgot`, {
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
    const response = await fetch(`${AUTH_API_URL}/api/v1/auth/password/reset`, {
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
