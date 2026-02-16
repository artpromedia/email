/**
 * React Query hooks for authentication
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, AuthApiError } from "./api";
import type {
  LoginRequest,
  RegisterRequest,
  AddEmailRequest,
  VerifyEmailRequest,
  MFAVerifyRequest,
  PasswordChangeRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  SSOCallbackRequest,
} from "./types";

// Query keys
export const authKeys = {
  all: ["auth"] as const,
  user: () => [...authKeys.all, "user"] as const,
  emails: () => [...authKeys.all, "emails"] as const,
  sessions: () => [...authKeys.all, "sessions"] as const,
  domain: (domain: string) => [...authKeys.all, "domain", domain] as const,
};

/**
 * Hook to get current authenticated user
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.user(),
    queryFn: () => authApi.getCurrentUser(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to detect domain info from email
 */
export function useDomainDetection(email: string, enabled = true) {
  const domain = email.split("@")[1];

  return useQuery({
    queryKey: authKeys.domain(domain ?? ""),
    queryFn: () => authApi.detectDomain(email),
    enabled: enabled && !!domain && domain.includes("."),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  });
}

/**
 * Hook to login
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LoginRequest) => authApi.login(request),
    onSuccess: (data) => {
      // Store tokens
      localStorage.setItem("accessToken", data.tokens.accessToken);
      localStorage.setItem("refreshToken", data.tokens.refreshToken);

      // Update user cache
      queryClient.setQueryData(authKeys.user(), data.user);
    },
  });
}

/**
 * Hook to register
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: RegisterRequest) => authApi.register(request),
    onSuccess: (data) => {
      // Store tokens
      localStorage.setItem("accessToken", data.tokens.accessToken);
      localStorage.setItem("refreshToken", data.tokens.refreshToken);

      // Update user cache
      queryClient.setQueryData(authKeys.user(), data.user);
    },
  });
}

/**
 * Hook for self-service signup (org + domain + admin user)
 */
export function useSignup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: {
      email: string;
      password: string;
      displayName: string;
      organizationName: string;
      domainName: string;
    }) => authApi.signup(request),
    onSuccess: (data) => {
      localStorage.setItem("accessToken", data.tokens.accessToken);
      localStorage.setItem("refreshToken", data.tokens.refreshToken);
      queryClient.setQueryData(authKeys.user(), data.user);
    },
  });
}

/**
 * Hook to logout
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      // Clear all auth-related cache
      queryClient.removeQueries({ queryKey: authKeys.all });
      queryClient.clear();
    },
  });
}

/**
 * Hook to initiate SSO login
 */
export function useInitiateSSOLogin() {
  return useMutation({
    mutationFn: (domain: string) => authApi.initiateSSOLogin(domain),
    onSuccess: (data) => {
      // Store state for callback verification
      sessionStorage.setItem("sso_state", data.state);
      // Redirect to SSO provider
      window.location.href = data.redirectUrl;
    },
  });
}

/**
 * Hook to complete SSO callback
 */
export function useCompleteSSOCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domain, request }: { domain: string; request: SSOCallbackRequest }) =>
      authApi.completeSSOCallback(domain, request),
    onSuccess: (data) => {
      // Store tokens
      localStorage.setItem("accessToken", data.tokens.accessToken);
      localStorage.setItem("refreshToken", data.tokens.refreshToken);

      // Update user cache
      queryClient.setQueryData(authKeys.user(), data.user);

      // Clear SSO state
      sessionStorage.removeItem("sso_state");
    },
  });
}

/**
 * Hook to get user's email addresses
 */
export function useEmails() {
  return useQuery({
    queryKey: authKeys.emails(),
    queryFn: () => authApi.getEmails(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to add email address
 */
export function useAddEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AddEmailRequest) => authApi.addEmail(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.emails() });
    },
  });
}

/**
 * Hook to remove email address
 */
export function useRemoveEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailId: string) => authApi.removeEmail(emailId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.emails() });
    },
  });
}

/**
 * Hook to set primary email
 */
export function useSetPrimaryEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailId: string) => authApi.setPrimaryEmail(emailId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: authKeys.user() });
    },
  });
}

/**
 * Hook to resend verification email
 */
export function useResendVerificationEmail() {
  return useMutation({
    mutationFn: (emailId: string) => authApi.resendVerificationEmail(emailId),
  });
}

/**
 * Hook to verify email
 */
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: VerifyEmailRequest) => authApi.verifyEmail(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.emails() });
    },
  });
}

/**
 * Hook to get user sessions
 */
export function useSessions() {
  return useQuery({
    queryKey: authKeys.sessions(),
    queryFn: () => authApi.getSessions(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to revoke session
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

/**
 * Hook to revoke all other sessions
 */
export function useRevokeAllOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.revokeAllOtherSessions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

/**
 * Hook to setup MFA
 */
export function useSetupMFA() {
  return useMutation({
    mutationFn: () => authApi.setupMFA(),
  });
}

/**
 * Hook to verify and enable MFA
 */
export function useVerifyMFA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: MFAVerifyRequest) => authApi.verifyMFA(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.user() });
    },
  });
}

/**
 * Hook to disable MFA
 */
export function useDisableMFA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: MFAVerifyRequest) => authApi.disableMFA(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.user() });
    },
  });
}

/**
 * Hook to change password
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (request: PasswordChangeRequest) => authApi.changePassword(request),
  });
}

/**
 * Hook to request password reset
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (request: ForgotPasswordRequest) => authApi.forgotPassword(request),
  });
}

/**
 * Hook to reset password
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: (request: ResetPasswordRequest) => authApi.resetPassword(request),
  });
}

export { AuthApiError };
