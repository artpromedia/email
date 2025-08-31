import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAdminToast } from "../hooks/useAdminToast";
// import { sdk } from '@ceerion/sdk';

// Types
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string; // Combined display name
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
  deviceInfo?: {
    primary: string;
    secondary: string;
  };
}

export interface UsersListParams {
  query?: string;
  role?: "admin" | "user" | "support" | "";
  status?: "active" | "suspended" | "pending" | "";
  enabled?: boolean | "";
  mfa?: boolean | "";
  page?: number;
  cursor?: string;
  limit?: number;
}

export interface UsersListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  hasNextPage: boolean;
  nextCursor?: string;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "user" | "support";
  quotaLimit: number;
}

export interface UpdateUserRequest {
  id: string;
  firstName?: string;
  lastName?: string;
  role?: "admin" | "user" | "support";
  enabled?: boolean;
  quotaLimit?: number;
}

export interface BulkUpdateRequest {
  userIds: string[];
  action: "enable" | "disable" | "delete";
}

export interface ResetPasswordRequest {
  userId: string;
}

// Query Keys
export const userKeys = {
  all: ["admin", "users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: UsersListParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// Mock SDK functions with realistic enterprise data
const mockUsers: AdminUser[] = [
  {
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
    quotaUsed: 4500,
    quotaLimit: 10000,
  },
  {
    id: "2",
    email: "sarah.wilson@ceerion.com",
    firstName: "Sarah",
    lastName: "Wilson",
    name: "Sarah Wilson",
    status: "active",
    role: "user",
    enabled: true,
    mfaEnabled: false,
    lastLogin: "2025-08-28T14:20:00Z",
    lastActive: "2025-08-28T16:30:00Z",
    createdAt: "2025-02-10T10:15:00Z",
    updatedAt: "2025-08-28T16:30:00Z",
    quotaUsed: 7200,
    quotaLimit: 5000,
  },
  {
    id: "3",
    email: "mike.johnson@ceerion.com",
    firstName: "Mike",
    lastName: "Johnson",
    name: "Mike Johnson",
    status: "suspended",
    role: "support",
    enabled: false,
    mfaEnabled: true,
    lastLogin: "2025-08-25T11:00:00Z",
    lastActive: "2025-08-25T12:15:00Z",
    createdAt: "2025-03-05T08:30:00Z",
    updatedAt: "2025-08-26T09:00:00Z",
    quotaUsed: 2100,
    quotaLimit: 8000,
  },
  {
    id: "4",
    email: "emma.brown@ceerion.com",
    firstName: "Emma",
    lastName: "Brown",
    name: "Emma Brown",
    status: "pending",
    role: "user",
    enabled: true,
    mfaEnabled: false,
    lastLogin: undefined,
    lastActive: undefined,
    createdAt: "2025-08-28T16:45:00Z",
    updatedAt: "2025-08-28T16:45:00Z",
    quotaUsed: 0,
    quotaLimit: 5000,
  },
  {
    id: "5",
    email: "david.lee@ceerion.com",
    firstName: "David",
    lastName: "Lee",
    name: "David Lee",
    status: "active",
    role: "admin",
    enabled: true,
    mfaEnabled: true,
    lastLogin: "2025-08-29T08:15:00Z",
    lastActive: "2025-08-29T14:20:00Z",
    createdAt: "2025-01-20T14:00:00Z",
    updatedAt: "2025-08-29T14:20:00Z",
    quotaUsed: 3300,
    quotaLimit: 15000,
  },
  {
    id: "6",
    email: "anna.garcia@ceerion.com",
    firstName: "Anna",
    lastName: "Garcia",
    name: "Anna Garcia",
    status: "active",
    role: "user",
    enabled: true,
    mfaEnabled: false,
    lastLogin: "2025-08-27T13:30:00Z",
    lastActive: "2025-08-27T17:45:00Z",
    createdAt: "2025-04-12T11:20:00Z",
    updatedAt: "2025-08-27T17:45:00Z",
    quotaUsed: 1850,
    quotaLimit: 5000,
  },
  // Add more test users
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `user-${i + 7}`,
    email: `user${i + 7}@ceerion.com`,
    firstName: `User${i + 7}`,
    lastName: `Test${i + 7}`,
    name: `User${i + 7} Test${i + 7}`,
    status: ["active", "suspended", "pending"][(i + 7) % 3] as any,
    role: ["user", "admin", "support"][(i + 7) % 3] as any,
    enabled: (i + 7) % 4 !== 0,
    mfaEnabled: (i + 7) % 3 === 0,
    lastLogin:
      (i + 7) % 5 === 0
        ? undefined
        : new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
    lastActive:
      (i + 7) % 5 === 0
        ? undefined
        : new Date(
            Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
    createdAt: new Date(
      Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    updatedAt: new Date(
      Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    quotaUsed: Math.floor(Math.random() * 8000),
    quotaLimit: [5000, 10000, 15000][(i + 7) % 3],
  })),
];

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock SDK API functions
export const sdk = {
  async getUsers(params: UsersListParams): Promise<UsersListResponse> {
    await delay(200 + Math.random() * 300); // 200-500ms delay

    let filteredUsers = [...mockUsers];

    // Apply filters
    if (params.query) {
      const query = params.query.toLowerCase();
      filteredUsers = filteredUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      );
    }

    if (params.role && params.role !== "") {
      filteredUsers = filteredUsers.filter((user) => user.role === params.role);
    }

    if (params.status && params.status !== "") {
      filteredUsers = filteredUsers.filter(
        (user) => user.status === params.status,
      );
    }

    if (typeof params.enabled === "boolean") {
      filteredUsers = filteredUsers.filter(
        (user) => user.enabled === params.enabled,
      );
    }

    if (typeof params.mfa === "boolean") {
      filteredUsers = filteredUsers.filter(
        (user) => user.mfaEnabled === params.mfa,
      );
    }

    // Simulate pagination
    const limit = params.limit || 20;
    const page = params.page || 1;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    return {
      users: paginatedUsers,
      total: filteredUsers.length,
      page,
      hasNextPage: endIndex < filteredUsers.length,
      nextCursor:
        endIndex < filteredUsers.length ? `cursor_${endIndex}` : undefined,
    };
  },

  async updateUser(request: UpdateUserRequest): Promise<AdminUser> {
    await delay(300 + Math.random() * 200); // 300-500ms delay

    // Simulate occasional failure (5% chance)
    if (Math.random() < 0.05) {
      throw new Error("Failed to update user. Please try again.");
    }

    const userIndex = mockUsers.findIndex((u) => u.id === request.id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    const updatedUser = {
      ...mockUsers[userIndex],
      ...request,
      name:
        request.firstName && request.lastName
          ? `${request.firstName} ${request.lastName}`
          : mockUsers[userIndex].name,
      updatedAt: new Date().toISOString(),
    };

    mockUsers[userIndex] = updatedUser;
    return updatedUser;
  },

  async deleteUser(userId: string): Promise<void> {
    await delay(400 + Math.random() * 200); // 400-600ms delay

    // Simulate occasional failure (3% chance)
    if (Math.random() < 0.03) {
      throw new Error("Failed to delete user. Please try again.");
    }

    const userIndex = mockUsers.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    mockUsers.splice(userIndex, 1);
  },

  async resetPassword(
    request: ResetPasswordRequest,
  ): Promise<{ temporaryPassword: string }> {
    await delay(250 + Math.random() * 150); // 250-400ms delay

    // Simulate occasional failure (2% chance)
    if (Math.random() < 0.02) {
      throw new Error("Failed to reset password. Please try again.");
    }

    return {
      temporaryPassword: "temp_" + Math.random().toString(36).substring(2, 15),
    };
  },

  async setEnabled(userId: string, enabled: boolean): Promise<AdminUser> {
    await delay(200 + Math.random() * 100); // 200-300ms delay

    // Simulate occasional failure (3% chance)
    if (Math.random() < 0.03) {
      throw new Error(
        `Failed to ${enabled ? "enable" : "disable"} user. Please try again.`,
      );
    }

    const userIndex = mockUsers.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    const updatedUser = {
      ...mockUsers[userIndex],
      enabled,
      updatedAt: new Date().toISOString(),
    };

    mockUsers[userIndex] = updatedUser;
    return updatedUser;
  },

  async setRole(
    userId: string,
    role: "admin" | "user" | "support",
  ): Promise<AdminUser> {
    await delay(300 + Math.random() * 150); // 300-450ms delay

    // Simulate occasional failure (4% chance)
    if (Math.random() < 0.04) {
      throw new Error("Failed to update user role. Please try again.");
    }

    const userIndex = mockUsers.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    const updatedUser = {
      ...mockUsers[userIndex],
      role,
      updatedAt: new Date().toISOString(),
    };

    mockUsers[userIndex] = updatedUser;
    return updatedUser;
  },

  async bulkUpdate(
    request: BulkUpdateRequest,
  ): Promise<{ updated: number; failed: string[] }> {
    await delay(500 + Math.random() * 300); // 500-800ms delay

    // Simulate some failures
    const failed: string[] = [];
    let updated = 0;

    for (const userId of request.userIds) {
      // 10% chance of failure per user
      if (Math.random() < 0.1) {
        failed.push(userId);
        continue;
      }

      const userIndex = mockUsers.findIndex((u) => u.id === userId);
      if (userIndex !== -1) {
        if (request.action === "enable") {
          mockUsers[userIndex].enabled = true;
        } else if (request.action === "disable") {
          mockUsers[userIndex].enabled = false;
        } else if (request.action === "delete") {
          mockUsers.splice(userIndex, 1);
        }
        mockUsers[userIndex].updatedAt = new Date().toISOString();
        updated++;
      }
    }

    return { updated, failed };
  },
};

// Custom hook for URL state management
export function useUsersParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: UsersListParams = {
    query: searchParams.get("query") || "",
    role: (searchParams.get("role") as any) || "",
    status: (searchParams.get("status") as any) || "",
    enabled:
      searchParams.get("enabled") === "true"
        ? true
        : searchParams.get("enabled") === "false"
          ? false
          : "",
    mfa:
      searchParams.get("mfa") === "true"
        ? true
        : searchParams.get("mfa") === "false"
          ? false
          : "",
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "20"),
  };

  const updateParams = (newParams: Partial<UsersListParams>) => {
    const updatedParams = new URLSearchParams(searchParams);

    Object.entries(newParams).forEach(([key, value]) => {
      if (value === "" || value === undefined || value === null) {
        updatedParams.delete(key);
      } else {
        updatedParams.set(key, String(value));
      }
    });

    // Reset to page 1 when filters change
    if (
      "query" in newParams ||
      "role" in newParams ||
      "status" in newParams ||
      "enabled" in newParams ||
      "mfa" in newParams
    ) {
      updatedParams.set("page", "1");
    }

    setSearchParams(updatedParams);
  };

  return { params, updateParams };
}

// React Query Hooks with optimistic updates
export function useUsers() {
  const { params } = useUsersParams();

  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => sdk.getUsers(params),
    staleTime: 30 * 1000, // 30 seconds
    keepPreviousData: true,
    suspense: true,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: sdk.updateUser,
    onMutate: async (request) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: userKeys.lists() });

      // Snapshot previous value
      const previousData = queryClient.getQueriesData({
        queryKey: userKeys.lists(),
      });

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: userKeys.lists() },
        (old: UsersListResponse | undefined) => {
          if (!old) return old;

          return {
            ...old,
            users: old.users.map((user) =>
              user.id === request.id
                ? {
                    ...user,
                    ...request,
                    name:
                      request.firstName && request.lastName
                        ? `${request.firstName} ${request.lastName}`
                        : user.name,
                  }
                : user,
            ),
          };
        },
      );

      return { previousData };
    },
    onError: (err, request, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      toast.error("Failed to update user: " + err.message);
    },
    onSuccess: (updatedUser) => {
      toast.success("User updated successfully", {
        action: {
          label: "View Audit",
          onClick: () => window.open(`/audit/user/${updatedUser.id}`, "_blank"),
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useToggleUserEnabled() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      sdk.setEnabled(userId, enabled),
    onMutate: async ({ userId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: userKeys.lists() });

      const previousData = queryClient.getQueriesData({
        queryKey: userKeys.lists(),
      });

      // Optimistic update
      queryClient.setQueriesData(
        { queryKey: userKeys.lists() },
        (old: UsersListResponse | undefined) => {
          if (!old) return old;

          return {
            ...old,
            users: old.users.map((user) =>
              user.id === userId ? { ...user, enabled } : user,
            ),
          };
        },
      );

      return { previousData };
    },
    onError: (err, { enabled }, context) => {
      // Rollback
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      toast.error(
        `Failed to ${enabled ? "enable" : "disable"} user: ` + err.message,
      );
    },
    onSuccess: (updatedUser) => {
      toast.success(
        `User ${updatedUser.enabled ? "enabled" : "disabled"} successfully`,
        {
          action: {
            label: "View Audit",
            onClick: () =>
              window.open(`/audit/user/${updatedUser.id}`, "_blank"),
          },
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useToggleUserRole() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: "admin" | "user" | "support";
    }) => sdk.setRole(userId, role),
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: userKeys.lists() });

      const previousData = queryClient.getQueriesData({
        queryKey: userKeys.lists(),
      });

      // Optimistic update
      queryClient.setQueriesData(
        { queryKey: userKeys.lists() },
        (old: UsersListResponse | undefined) => {
          if (!old) return old;

          return {
            ...old,
            users: old.users.map((user) =>
              user.id === userId ? { ...user, role } : user,
            ),
          };
        },
      );

      return { previousData };
    },
    onError: (err, { role }, context) => {
      // Rollback
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      toast.error(`Failed to set role to ${role}: ` + err.message);
    },
    onSuccess: (updatedUser) => {
      toast.success(`User role updated to ${updatedUser.role}`, {
        action: {
          label: "View Audit",
          onClick: () => window.open(`/audit/user/${updatedUser.id}`, "_blank"),
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useResetPassword() {
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (userId: string) => sdk.resetPassword({ userId }),
    onSuccess: (result, userId) => {
      toast.success("Password reset successfully", {
        description: `Temporary password: ${result.temporaryPassword}`,
        action: {
          label: "View Audit",
          onClick: () => window.open(`/audit/user/${userId}`, "_blank"),
        },
      });
    },
    onError: (err) => {
      toast.error("Failed to reset password: " + err.message);
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: sdk.deleteUser,
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: userKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });

      toast.success("User deleted successfully", {
        action: {
          label: "View Audit",
          onClick: () => window.open(`/audit/user/${deletedId}`, "_blank"),
        },
      });
    },
    onError: (err) => {
      toast.error("Failed to delete user: " + err.message);
    },
  });
}

export function useBulkUpdate() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: sdk.bulkUpdate,
    onSuccess: (result, request) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });

      const action =
        request.action === "enable"
          ? "enabled"
          : request.action === "disable"
            ? "disabled"
            : "deleted";

      if (result.failed.length === 0) {
        toast.success(`${result.updated} users ${action} successfully`);
      } else {
        toast.warning(
          `${result.updated} users ${action}, ${result.failed.length} failed`,
          {
            description: `Failed: ${result.failed.slice(0, 3).join(", ")}${result.failed.length > 3 ? "..." : ""}`,
          },
        );
      }
    },
    onError: (err) => {
      toast.error("Bulk operation failed: " + err.message);
    },
  });
}
