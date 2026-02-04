/**
 * Auth Hooks Integration Tests
 * Tests that actually import and exercise the auth hooks module
 */

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { authApi } from "./api";
import {
  authKeys,
  useCurrentUser,
  useDomainDetection,
  useLogin,
  useRegister,
  useLogout,
  useInitiateSSOLogin,
  useCompleteSSOCallback,
  useEmails,
  useAddEmail,
  useRemoveEmail,
  useSetPrimaryEmail,
  useResendVerificationEmail,
  useVerifyEmail,
  useSessions,
  useRevokeSession,
  useRevokeAllOtherSessions,
  useSetupMFA,
  useVerifyMFA,
  useDisableMFA,
  useChangePassword,
  useForgotPassword,
  useResetPassword,
  AuthApiError,
} from "./hooks";

// Mock the authApi
jest.mock("./api", () => ({
  authApi: {
    getCurrentUser: jest.fn(),
    detectDomain: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    initiateSSOLogin: jest.fn(),
    completeSSOCallback: jest.fn(),
    getEmails: jest.fn(),
    addEmail: jest.fn(),
    removeEmail: jest.fn(),
    setPrimaryEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    verifyEmail: jest.fn(),
    getSessions: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllOtherSessions: jest.fn(),
    setupMFA: jest.fn(),
    verifyMFA: jest.fn(),
    disableMFA: jest.fn(),
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  },
  AuthApiError: class AuthApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Auth Hooks Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("authKeys", () => {
    it("exports all key functions", () => {
      expect(authKeys.all).toEqual(["auth"]);
      expect(authKeys.user()).toEqual(["auth", "user"]);
      expect(authKeys.emails()).toEqual(["auth", "emails"]);
      expect(authKeys.sessions()).toEqual(["auth", "sessions"]);
      expect(authKeys.domain("test.com")).toEqual(["auth", "domain", "test.com"]);
    });
  });

  describe("AuthApiError", () => {
    it("is exported from hooks", () => {
      expect(AuthApiError).toBeDefined();
    });
  });

  describe("useCurrentUser", () => {
    it("fetches current user", async () => {
      const mockUser = { id: "1", email: "user@example.com", name: "Test User" };
      mockedAuthApi.getCurrentUser.mockResolvedValueOnce(mockUser);

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUser);
      expect(mockedAuthApi.getCurrentUser).toHaveBeenCalled();
    });

    it("handles error without retrying", async () => {
      mockedAuthApi.getCurrentUser.mockRejectedValueOnce(new Error("Unauthorized"));

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Should only be called once (no retries)
      expect(mockedAuthApi.getCurrentUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("useDomainDetection", () => {
    it("detects domain from email", async () => {
      const mockDomainInfo = { domain: "example.com", ssoEnabled: true };
      mockedAuthApi.detectDomain.mockResolvedValueOnce(mockDomainInfo);

      const { result } = renderHook(() => useDomainDetection("user@example.com"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockDomainInfo);
      expect(mockedAuthApi.detectDomain).toHaveBeenCalledWith("user@example.com");
    });

    it("is disabled for invalid email", () => {
      const { result } = renderHook(() => useDomainDetection("invalid"), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(mockedAuthApi.detectDomain).not.toHaveBeenCalled();
    });

    it("is disabled when explicitly disabled", () => {
      const { result } = renderHook(() => useDomainDetection("user@example.com", false), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(mockedAuthApi.detectDomain).not.toHaveBeenCalled();
    });
  });

  describe("useLogin", () => {
    it("logs in and stores tokens", async () => {
      const mockResponse = {
        user: { id: "1", email: "user@example.com" },
        tokens: { accessToken: "access-123", refreshToken: "refresh-456" },
      };
      mockedAuthApi.login.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ email: "user@example.com", password: "password" });
      });

      expect(localStorage.getItem("accessToken")).toBe("access-123");
      expect(localStorage.getItem("refreshToken")).toBe("refresh-456");
    });
  });

  describe("useRegister", () => {
    it("registers and stores tokens", async () => {
      const mockResponse = {
        user: { id: "2", email: "new@example.com" },
        tokens: { accessToken: "new-access", refreshToken: "new-refresh" },
      };
      mockedAuthApi.register.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          email: "new@example.com",
          password: "password",
          name: "New User",
        });
      });

      expect(localStorage.getItem("accessToken")).toBe("new-access");
      expect(localStorage.getItem("refreshToken")).toBe("new-refresh");
    });
  });

  describe("useLogout", () => {
    it("calls logout API", async () => {
      mockedAuthApi.logout.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockedAuthApi.logout).toHaveBeenCalled();
    });
  });

  describe("useInitiateSSOLogin", () => {
    it("stores SSO state and would redirect", async () => {
      const mockResponse = { redirectUrl: "https://sso.example.com/auth", state: "state-123" };
      mockedAuthApi.initiateSSOLogin.mockResolvedValueOnce(mockResponse);

      // Mock window.location
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: "" } as Location;

      const { result } = renderHook(() => useInitiateSSOLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("example.com");
      });

      expect(sessionStorage.getItem("sso_state")).toBe("state-123");
      expect(window.location.href).toBe("https://sso.example.com/auth");

      // Restore
      window.location = originalLocation;
    });
  });

  describe("useCompleteSSOCallback", () => {
    it("completes SSO and clears state", async () => {
      sessionStorage.setItem("sso_state", "test-state");
      const mockResponse = {
        user: { id: "3", email: "sso@example.com" },
        tokens: { accessToken: "sso-access", refreshToken: "sso-refresh" },
      };
      mockedAuthApi.completeSSOCallback.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCompleteSSOCallback(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          domain: "example.com",
          request: { code: "auth-code", state: "test-state" },
        });
      });

      expect(localStorage.getItem("accessToken")).toBe("sso-access");
      expect(sessionStorage.getItem("sso_state")).toBeNull();
    });
  });

  describe("useEmails", () => {
    it("fetches user emails", async () => {
      const mockEmails = [
        { id: "1", email: "user@example.com", isPrimary: true, isVerified: true },
      ];
      mockedAuthApi.getEmails.mockResolvedValueOnce(mockEmails);

      const { result } = renderHook(() => useEmails(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockEmails);
    });
  });

  describe("useAddEmail", () => {
    it("adds email", async () => {
      mockedAuthApi.addEmail.mockResolvedValueOnce({ id: "2", email: "new@example.com" });

      const { result } = renderHook(() => useAddEmail(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ email: "new@example.com" });
      });

      expect(mockedAuthApi.addEmail).toHaveBeenCalledWith({ email: "new@example.com" });
    });
  });

  describe("useRemoveEmail", () => {
    it("removes email", async () => {
      mockedAuthApi.removeEmail.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useRemoveEmail(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("email-123");
      });

      expect(mockedAuthApi.removeEmail).toHaveBeenCalledWith("email-123");
    });
  });

  describe("useSetPrimaryEmail", () => {
    it("sets primary email", async () => {
      mockedAuthApi.setPrimaryEmail.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useSetPrimaryEmail(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("email-456");
      });

      expect(mockedAuthApi.setPrimaryEmail).toHaveBeenCalledWith("email-456");
    });
  });

  describe("useResendVerificationEmail", () => {
    it("resends verification", async () => {
      mockedAuthApi.resendVerificationEmail.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useResendVerificationEmail(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("email-789");
      });

      expect(mockedAuthApi.resendVerificationEmail).toHaveBeenCalledWith("email-789");
    });
  });

  describe("useVerifyEmail", () => {
    it("verifies email", async () => {
      mockedAuthApi.verifyEmail.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useVerifyEmail(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ emailId: "e1", token: "token-123" });
      });

      expect(mockedAuthApi.verifyEmail).toHaveBeenCalledWith({ emailId: "e1", token: "token-123" });
    });
  });

  describe("useSessions", () => {
    it("fetches sessions", async () => {
      const mockSessions = [{ id: "s1", device: "Chrome", lastActive: "2024-01-01" }];
      mockedAuthApi.getSessions.mockResolvedValueOnce(mockSessions);

      const { result } = renderHook(() => useSessions(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockSessions);
    });
  });

  describe("useRevokeSession", () => {
    it("revokes session", async () => {
      mockedAuthApi.revokeSession.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useRevokeSession(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("session-123");
      });

      expect(mockedAuthApi.revokeSession).toHaveBeenCalledWith("session-123");
    });
  });

  describe("useRevokeAllOtherSessions", () => {
    it("revokes all other sessions", async () => {
      mockedAuthApi.revokeAllOtherSessions.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useRevokeAllOtherSessions(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockedAuthApi.revokeAllOtherSessions).toHaveBeenCalled();
    });
  });

  describe("useSetupMFA", () => {
    it("sets up MFA", async () => {
      const mockSetup = { secret: "ABCD1234", qrCode: "data:image/png;base64,..." };
      mockedAuthApi.setupMFA.mockResolvedValueOnce(mockSetup);

      const { result } = renderHook(() => useSetupMFA(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const data = await result.current.mutateAsync();
        expect(data).toEqual(mockSetup);
      });
    });
  });

  describe("useVerifyMFA", () => {
    it("verifies MFA code", async () => {
      mockedAuthApi.verifyMFA.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useVerifyMFA(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ code: "123456" });
      });

      expect(mockedAuthApi.verifyMFA).toHaveBeenCalledWith({ code: "123456" });
    });
  });

  describe("useDisableMFA", () => {
    it("disables MFA", async () => {
      mockedAuthApi.disableMFA.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDisableMFA(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ code: "654321" });
      });

      expect(mockedAuthApi.disableMFA).toHaveBeenCalledWith({ code: "654321" });
    });
  });

  describe("useChangePassword", () => {
    it("changes password", async () => {
      mockedAuthApi.changePassword.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useChangePassword(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          currentPassword: "old123",
          newPassword: "new456",
        });
      });

      expect(mockedAuthApi.changePassword).toHaveBeenCalledWith({
        currentPassword: "old123",
        newPassword: "new456",
      });
    });
  });

  describe("useForgotPassword", () => {
    it("requests password reset", async () => {
      mockedAuthApi.forgotPassword.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useForgotPassword(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ email: "forgot@example.com" });
      });

      expect(mockedAuthApi.forgotPassword).toHaveBeenCalledWith({ email: "forgot@example.com" });
    });
  });

  describe("useResetPassword", () => {
    it("resets password", async () => {
      mockedAuthApi.resetPassword.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useResetPassword(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ token: "reset-token", password: "newpass123" });
      });

      expect(mockedAuthApi.resetPassword).toHaveBeenCalledWith({
        token: "reset-token",
        password: "newpass123",
      });
    });
  });
});
