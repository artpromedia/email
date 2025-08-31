import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "../../hooks/useAdminToast";

// Types for User Detail
export interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  status: "active" | "suspended" | "pending";
  role: "admin" | "user" | "support";
  enabled: boolean;
  mfaEnabled: boolean;
  lastLogin?: string;
  lastActive?: string;
  createdAt: string;
  updatedAt: string;
  quotaUsed: number;
  quotaLimit: number;
  timezone: string;
  locale: string;
  primaryAddress: string;
}

export interface UserAlias {
  id: string;
  address: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface UserPasskey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
  credentialId: string;
}

export interface UserOIDCIdentity {
  id: string;
  provider: string;
  providerId: string;
  email: string;
  createdAt: string;
  lastUsed?: string;
}

export interface UserMailbox {
  quotaLimit: number;
  quotaUsed: number;
  forwardingEnabled: boolean;
  forwardingTarget?: string;
  forwardingVerified: boolean;
  retentionDays: number;
  legalHoldEnabled: boolean;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  isPrimary: boolean;
  memberSince: string;
}

export interface UserSession {
  id: string;
  userAgent: string;
  ipAddress: string;
  location?: string;
  createdAt: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface UserActivity {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
}

// Mock data
const mockUser: UserDetail = {
  id: "1",
  email: "john.doe@ceerion.com",
  firstName: "John",
  lastName: "Doe",
  name: "John Doe",
  status: "active",
  role: "admin",
  enabled: true,
  mfaEnabled: true,
  lastLogin: "2025-08-29T10:30:00Z",
  lastActive: "2025-08-29T15:45:00Z",
  createdAt: "2025-01-15T09:00:00Z",
  updatedAt: "2025-08-29T15:45:00Z",
  quotaUsed: 4500000000, // 4.5GB in bytes
  quotaLimit: 10000000000, // 10GB in bytes
  timezone: "America/New_York",
  locale: "en-US",
  primaryAddress: "john.doe@ceerion.com",
};

const mockAliases: UserAlias[] = [
  {
    id: "1",
    address: "john.doe@ceerion.com",
    isPrimary: true,
    createdAt: "2025-01-15T09:00:00Z",
  },
  {
    id: "2",
    address: "j.doe@ceerion.com",
    isPrimary: false,
    createdAt: "2025-02-10T10:15:00Z",
  },
  {
    id: "3",
    address: "johndoe@ceerion.com",
    isPrimary: false,
    createdAt: "2025-03-05T08:30:00Z",
  },
];

const mockPasskeys: UserPasskey[] = [
  {
    id: "1",
    name: "MacBook Pro Touch ID",
    createdAt: "2025-06-15T09:00:00Z",
    lastUsed: "2025-08-29T10:30:00Z",
    credentialId: "credential_123",
  },
  {
    id: "2",
    name: "iPhone Face ID",
    createdAt: "2025-07-20T14:20:00Z",
    lastUsed: "2025-08-28T16:45:00Z",
    credentialId: "credential_456",
  },
];

const mockOIDCIdentities: UserOIDCIdentity[] = [
  {
    id: "1",
    provider: "google",
    providerId: "google_123456789",
    email: "john.doe@gmail.com",
    createdAt: "2025-01-15T09:00:00Z",
    lastUsed: "2025-08-25T12:30:00Z",
  },
];

const mockMailbox: UserMailbox = {
  quotaLimit: 10000000000, // 10GB
  quotaUsed: 4500000000, // 4.5GB
  forwardingEnabled: false,
  forwardingTarget: undefined,
  forwardingVerified: false,
  retentionDays: 365,
  legalHoldEnabled: false,
};

const mockGroups: UserGroup[] = [
  {
    id: "1",
    name: "Administrators",
    description: "System administrators",
    isPrimary: true,
    memberSince: "2025-01-15T09:00:00Z",
  },
  {
    id: "2",
    name: "IT Support",
    description: "IT support team",
    isPrimary: false,
    memberSince: "2025-02-10T10:15:00Z",
  },
];

const mockSessions: UserSession[] = [
  {
    id: "1",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    ipAddress: "192.168.1.100",
    location: "New York, NY",
    createdAt: "2025-08-29T09:00:00Z",
    lastActive: "2025-08-29T15:45:00Z",
    isCurrent: true,
  },
  {
    id: "2",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    ipAddress: "10.0.0.50",
    location: "New York, NY",
    createdAt: "2025-08-28T14:20:00Z",
    lastActive: "2025-08-28T18:30:00Z",
    isCurrent: false,
  },
];

const mockActivity: UserActivity[] = [
  {
    id: "1",
    action: "login",
    description: "User logged in successfully",
    timestamp: "2025-08-29T10:30:00Z",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  },
  {
    id: "2",
    action: "password_change",
    description: "User changed password",
    timestamp: "2025-08-25T16:20:00Z",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  },
];

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock API functions
export const userDetailAPI = {
  // User basic info
  async getUser(userId: string): Promise<UserDetail> {
    await delay(300);
    if (userId === "1") return mockUser;
    throw new Error("User not found");
  },

  async updateUser(
    userId: string,
    data: Partial<UserDetail>,
  ): Promise<UserDetail> {
    await delay(400);
    if (Math.random() < 0.05) throw new Error("Update failed");
    return { ...mockUser, ...data, updatedAt: new Date().toISOString() };
  },

  // Aliases
  async getAliases(userId: string): Promise<UserAlias[]> {
    await delay(200);
    return mockAliases;
  },

  async addAlias(userId: string, address: string): Promise<UserAlias> {
    await delay(300);
    if (Math.random() < 0.1) throw new Error("Failed to add alias");
    return {
      id: Date.now().toString(),
      address,
      isPrimary: false,
      createdAt: new Date().toISOString(),
    };
  },

  async removeAlias(userId: string, aliasId: string): Promise<void> {
    await delay(250);
    if (Math.random() < 0.05) throw new Error("Failed to remove alias");
  },

  // Passkeys
  async getPasskeys(userId: string): Promise<UserPasskey[]> {
    await delay(200);
    return mockPasskeys;
  },

  async removePasskey(userId: string, passkeyId: string): Promise<void> {
    await delay(300);
    if (Math.random() < 0.03) throw new Error("Failed to remove passkey");
  },

  // OIDC Identities
  async getOIDCIdentities(userId: string): Promise<UserOIDCIdentity[]> {
    await delay(200);
    return mockOIDCIdentities;
  },

  async unlinkOIDCIdentity(userId: string, identityId: string): Promise<void> {
    await delay(250);
    if (Math.random() < 0.05) throw new Error("Failed to unlink identity");
  },

  // Mailbox
  async getMailbox(userId: string): Promise<UserMailbox> {
    await delay(200);
    return mockMailbox;
  },

  async updateMailbox(
    userId: string,
    data: Partial<UserMailbox>,
  ): Promise<UserMailbox> {
    await delay(400);
    if (Math.random() < 0.05) throw new Error("Failed to update mailbox");
    return { ...mockMailbox, ...data };
  },

  // Groups
  async getGroups(userId: string): Promise<UserGroup[]> {
    await delay(200);
    return mockGroups;
  },

  async addToGroup(userId: string, groupId: string): Promise<UserGroup> {
    await delay(300);
    if (Math.random() < 0.1) throw new Error("Failed to add to group");
    return {
      id: groupId,
      name: "New Group",
      description: "New group description",
      isPrimary: false,
      memberSince: new Date().toISOString(),
    };
  },

  async removeFromGroup(userId: string, groupId: string): Promise<void> {
    await delay(250);
    if (Math.random() < 0.05) throw new Error("Failed to remove from group");
  },

  // Activity
  async getSessions(userId: string): Promise<UserSession[]> {
    await delay(200);
    return mockSessions;
  },

  async getActivity(userId: string): Promise<UserActivity[]> {
    await delay(250);
    return mockActivity;
  },

  async terminateSession(userId: string, sessionId: string): Promise<void> {
    await delay(200);
    if (Math.random() < 0.03) throw new Error("Failed to terminate session");
  },

  // Security actions
  async resetPassword(
    userId: string,
    data: { reason?: string; actorId: string },
  ): Promise<{
    resetToken: string;
    resetLink: string;
    expiresAt: string;
  }> {
    await delay(400);
    if (Math.random() < 0.05) throw new Error("Failed to reset password");

    const resetToken = "rst_" + Math.random().toString(36).substring(2, 20);
    const resetLink = `https://mail.ceerion.com/auth/reset?token=${resetToken}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Audit log entry would be created here
    console.log("AUDIT: Password reset", {
      userId,
      actorId: data.actorId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    return { resetToken, resetLink, expiresAt };
  },

  async revokeAllSessions(
    userId: string,
    data: { reason?: string; actorId: string },
  ): Promise<{
    revokedCount: number;
  }> {
    await delay(500);
    if (Math.random() < 0.03) throw new Error("Failed to revoke sessions");

    const revokedCount = mockSessions.length;

    // Audit log entry would be created here
    console.log("AUDIT: All sessions revoked", {
      userId,
      actorId: data.actorId,
      reason: data.reason,
      revokedCount,
      timestamp: new Date().toISOString(),
    });

    // Clear all sessions except the current one would happen here
    mockSessions.splice(0, mockSessions.length, {
      ...mockSessions[0],
      isCurrent: true,
    });

    return { revokedCount };
  },

  async disableUser(
    userId: string,
    data: { reason: string; actorId: string },
  ): Promise<UserDetail> {
    await delay(400);
    if (Math.random() < 0.03) throw new Error("Failed to disable user");

    // Audit log entry would be created here
    console.log("AUDIT: User disabled", {
      userId,
      actorId: data.actorId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    // This would also revoke all sessions
    mockSessions.splice(0, mockSessions.length);

    return {
      ...mockUser,
      enabled: false,
      status: "suspended" as const,
      updatedAt: new Date().toISOString(),
    };
  },

  async enableUser(
    userId: string,
    data: { reason?: string; actorId: string },
  ): Promise<UserDetail> {
    await delay(300);
    if (Math.random() < 0.03) throw new Error("Failed to enable user");

    // Audit log entry would be created here
    console.log("AUDIT: User enabled", {
      userId,
      actorId: data.actorId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    return {
      ...mockUser,
      enabled: true,
      status: "active" as const,
      updatedAt: new Date().toISOString(),
    };
  },

  async terminateSpecificSession(
    userId: string,
    sessionId: string,
    data: { actorId: string },
  ): Promise<void> {
    await delay(200);
    if (Math.random() < 0.03) throw new Error("Failed to terminate session");

    // Audit log entry would be created here
    console.log("AUDIT: Session terminated", {
      userId,
      sessionId,
      actorId: data.actorId,
      timestamp: new Date().toISOString(),
    });
  },

  async toggleEnabled(userId: string, enabled: boolean): Promise<UserDetail> {
    await delay(300);
    if (Math.random() < 0.05) throw new Error("Failed to toggle user status");
    return { ...mockUser, enabled, updatedAt: new Date().toISOString() };
  },

  async updateRole(
    userId: string,
    role: "admin" | "user" | "support",
  ): Promise<UserDetail> {
    await delay(350);
    if (Math.random() < 0.05) throw new Error("Failed to update role");
    return { ...mockUser, role, updatedAt: new Date().toISOString() };
  },
};

// Query Keys
export const userDetailKeys = {
  all: ["userDetail"] as const,
  detail: (userId: string) => [...userDetailKeys.all, userId] as const,
  aliases: (userId: string) =>
    [...userDetailKeys.detail(userId), "aliases"] as const,
  passkeys: (userId: string) =>
    [...userDetailKeys.detail(userId), "passkeys"] as const,
  oidc: (userId: string) => [...userDetailKeys.detail(userId), "oidc"] as const,
  mailbox: (userId: string) =>
    [...userDetailKeys.detail(userId), "mailbox"] as const,
  groups: (userId: string) =>
    [...userDetailKeys.detail(userId), "groups"] as const,
  sessions: (userId: string) =>
    [...userDetailKeys.detail(userId), "sessions"] as const,
  activity: (userId: string) =>
    [...userDetailKeys.detail(userId), "activity"] as const,
};

// React Query Hooks
export function useUser(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.detail(userId),
    queryFn: () => userDetailAPI.getUser(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserAliases(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.aliases(userId),
    queryFn: () => userDetailAPI.getAliases(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserPasskeys(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.passkeys(userId),
    queryFn: () => userDetailAPI.getPasskeys(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserOIDCIdentities(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.oidc(userId),
    queryFn: () => userDetailAPI.getOIDCIdentities(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserMailbox(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.mailbox(userId),
    queryFn: () => userDetailAPI.getMailbox(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserGroups(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.groups(userId),
    queryFn: () => userDetailAPI.getGroups(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserSessions(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.sessions(userId),
    queryFn: () => userDetailAPI.getSessions(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

export function useUserActivity(userId: string) {
  return useQuery({
    queryKey: userDetailKeys.activity(userId),
    queryFn: () => userDetailAPI.getActivity(userId),
    staleTime: 30 * 1000,
    enabled: !!userId,
  });
}

// Mutation hooks with optimistic updates
export function useUpdateUser() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: Partial<UserDetail>;
    }) => userDetailAPI.updateUser(userId, data),
    onSuccess: (updatedUser, { userId }) => {
      queryClient.setQueryData(userDetailKeys.detail(userId), updatedUser);
      toast.success("User updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update user: " + (error as Error).message);
    },
  });
}

export function useAddAlias() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({ userId, address }: { userId: string; address: string }) =>
      userDetailAPI.addAlias(userId, address),
    onSuccess: (newAlias, { userId }) => {
      queryClient.setQueryData(
        userDetailKeys.aliases(userId),
        (old: UserAlias[] | undefined) => [...(old || []), newAlias],
      );
      toast.success("Alias added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add alias: " + (error as Error).message);
    },
  });
}

export function useRemoveAlias() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({ userId, aliasId }: { userId: string; aliasId: string }) =>
      userDetailAPI.removeAlias(userId, aliasId),
    onMutate: async ({ userId, aliasId }) => {
      await queryClient.cancelQueries({
        queryKey: userDetailKeys.aliases(userId),
      });

      const previousAliases = queryClient.getQueryData(
        userDetailKeys.aliases(userId),
      );

      queryClient.setQueryData(
        userDetailKeys.aliases(userId),
        (old: UserAlias[] | undefined) =>
          old?.filter((alias) => alias.id !== aliasId) || [],
      );

      return { previousAliases };
    },
    onError: (error, { userId }, context) => {
      if (context?.previousAliases) {
        queryClient.setQueryData(
          userDetailKeys.aliases(userId),
          context.previousAliases,
        );
      }
      toast.error("Failed to remove alias: " + (error as Error).message);
    },
    onSuccess: () => {
      toast.success("Alias removed successfully");
    },
  });
}

export function useRemovePasskey() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      passkeyId,
    }: {
      userId: string;
      passkeyId: string;
    }) => userDetailAPI.removePasskey(userId, passkeyId),
    onMutate: async ({ userId, passkeyId }) => {
      await queryClient.cancelQueries({
        queryKey: userDetailKeys.passkeys(userId),
      });

      const previousPasskeys = queryClient.getQueryData(
        userDetailKeys.passkeys(userId),
      );

      queryClient.setQueryData(
        userDetailKeys.passkeys(userId),
        (old: UserPasskey[] | undefined) =>
          old?.filter((passkey) => passkey.id !== passkeyId) || [],
      );

      return { previousPasskeys };
    },
    onError: (error, { userId }, context) => {
      if (context?.previousPasskeys) {
        queryClient.setQueryData(
          userDetailKeys.passkeys(userId),
          context.previousPasskeys,
        );
      }
      toast.error("Failed to remove passkey: " + (error as Error).message);
    },
    onSuccess: () => {
      toast.success("Passkey removed successfully");
    },
  });
}

export function useUnlinkOIDCIdentity() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      identityId,
    }: {
      userId: string;
      identityId: string;
    }) => userDetailAPI.unlinkOIDCIdentity(userId, identityId),
    onMutate: async ({ userId, identityId }) => {
      await queryClient.cancelQueries({
        queryKey: userDetailKeys.oidc(userId),
      });

      const previousIdentities = queryClient.getQueryData(
        userDetailKeys.oidc(userId),
      );

      queryClient.setQueryData(
        userDetailKeys.oidc(userId),
        (old: UserOIDCIdentity[] | undefined) =>
          old?.filter((identity) => identity.id !== identityId) || [],
      );

      return { previousIdentities };
    },
    onError: (error, { userId }, context) => {
      if (context?.previousIdentities) {
        queryClient.setQueryData(
          userDetailKeys.oidc(userId),
          context.previousIdentities,
        );
      }
      toast.error("Failed to unlink identity: " + (error as Error).message);
    },
    onSuccess: () => {
      toast.success("Identity unlinked successfully");
    },
  });
}

// Enhanced Security Mutation Hooks
export function useResetPassword() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      reason,
      actorId,
    }: {
      userId: string;
      reason?: string;
      actorId: string;
    }) => userDetailAPI.resetPassword(userId, { reason, actorId }),
    onSuccess: () => {
      toast.success("Password reset link generated successfully");
    },
    onError: (error) => {
      toast.error("Failed to reset password: " + (error as Error).message);
    },
  });
}

export function useRevokeAllSessions() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      reason,
      actorId,
    }: {
      userId: string;
      reason?: string;
      actorId: string;
    }) => userDetailAPI.revokeAllSessions(userId, { reason, actorId }),
    onSuccess: (data, { userId }) => {
      // Invalidate sessions query to refresh the list
      queryClient.invalidateQueries({
        queryKey: userDetailKeys.sessions(userId),
      });
      toast.success(`Successfully revoked ${data.revokedCount} session(s)`);
    },
    onError: (error) => {
      toast.error("Failed to revoke sessions: " + (error as Error).message);
    },
  });
}

export function useDisableUser() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      reason,
      actorId,
    }: {
      userId: string;
      reason: string;
      actorId: string;
    }) => userDetailAPI.disableUser(userId, { reason, actorId }),
    onSuccess: (updatedUser, { userId }) => {
      // Update user data immediately
      queryClient.setQueryData(userDetailKeys.detail(userId), updatedUser);
      // Clear sessions since user was disabled
      queryClient.invalidateQueries({
        queryKey: userDetailKeys.sessions(userId),
      });
      toast.success("User has been disabled and all sessions revoked");
    },
    onError: (error) => {
      toast.error("Failed to disable user: " + (error as Error).message);
    },
  });
}

export function useEnableUser() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      reason,
      actorId,
    }: {
      userId: string;
      reason?: string;
      actorId: string;
    }) => userDetailAPI.enableUser(userId, { reason, actorId }),
    onSuccess: (updatedUser, { userId }) => {
      queryClient.setQueryData(userDetailKeys.detail(userId), updatedUser);
      toast.success("User has been enabled");
    },
    onError: (error) => {
      toast.error("Failed to enable user: " + (error as Error).message);
    },
  });
}

export function useTerminateSpecificSession() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      sessionId,
      actorId,
    }: {
      userId: string;
      sessionId: string;
      actorId: string;
    }) =>
      userDetailAPI.terminateSpecificSession(userId, sessionId, { actorId }),
    onMutate: async ({ userId, sessionId }) => {
      await queryClient.cancelQueries({
        queryKey: userDetailKeys.sessions(userId),
      });

      const previousSessions = queryClient.getQueryData(
        userDetailKeys.sessions(userId),
      );

      queryClient.setQueryData(
        userDetailKeys.sessions(userId),
        (old: UserSession[] | undefined) =>
          old?.filter((session) => session.id !== sessionId) || [],
      );

      return { previousSessions };
    },
    onError: (error, { userId }, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(
          userDetailKeys.sessions(userId),
          context.previousSessions,
        );
      }
      toast.error("Failed to terminate session: " + (error as Error).message);
    },
    onSuccess: () => {
      toast.success("Session terminated successfully");
    },
  });
}
