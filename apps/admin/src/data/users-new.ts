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

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: "admin" | "user" | "support";
  status?: "active" | "suspended" | "pending";
  enabled?: boolean;
  quotaLimit?: number;
}

// Query Keys
export const userKeys = {
  all: ["admin", "users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: UsersListParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// Mock data
const mockUsers: AdminUser[] = Array.from({ length: 50 }, (_, i) => ({
  id: `user-${i + 1}`,
  email: `user${i + 1}@example.com`,
  firstName: `First${i + 1}`,
  lastName: `Last${i + 1}`,
  name: `First${i + 1} Last${i + 1}`,
  status: ["active", "suspended", "pending"][i % 3] as any,
  role: ["user", "admin", "support"][i % 3] as any,
  enabled: i % 4 !== 0,
  mfaEnabled: i % 3 === 0,
  lastLogin:
    i % 5 === 0
      ? undefined
      : new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
  createdAt: new Date(
    Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
  ).toISOString(),
  updatedAt: new Date(
    Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
  ).toISOString(),
  quotaUsed: Math.floor(Math.random() * 8000),
  quotaLimit: 10000,
  deviceInfo:
    i % 7 === 0
      ? {
          primary: "Desktop Chrome",
          secondary: "Mobile Safari",
        }
      : undefined,
}));

// API Functions with ETag support
const apiCache = new Map<string, { data: any; etag: string }>();

async function fetchUsers(params: UsersListParams): Promise<UsersListResponse> {
  await new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.random() * 500),
  );

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

  if (typeof params.mfa === "boolean") {
    filteredUsers = filteredUsers.filter(
      (user) => user.mfaEnabled === params.mfa,
    );
  }

  // Pagination
  const limit = params.limit || 20;
  const page = params.page || 1;
  const start = (page - 1) * limit;
  const paginatedUsers = filteredUsers.slice(start, start + limit);

  return {
    users: paginatedUsers,
    total: filteredUsers.length,
    page,
    hasNextPage: start + limit < filteredUsers.length,
    nextCursor:
      start + limit < filteredUsers.length ? `cursor-${page + 1}` : undefined,
  };
}

async function fetchUser(id: string): Promise<AdminUser> {
  await new Promise((resolve) =>
    setTimeout(resolve, 200 + Math.random() * 300),
  );

  const user = mockUsers.find((u) => u.id === id);
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

async function createUser(data: CreateUserRequest): Promise<AdminUser> {
  await new Promise((resolve) =>
    setTimeout(resolve, 800 + Math.random() * 400),
  );

  const newUser: AdminUser = {
    id: `user-${Date.now()}`,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    name: `${data.firstName} ${data.lastName}`,
    status: "pending",
    role: data.role,
    enabled: true,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quotaUsed: 0,
    quotaLimit: data.quotaLimit,
  };

  mockUsers.unshift(newUser);
  return newUser;
}

async function updateUser(
  id: string,
  data: UpdateUserRequest,
): Promise<AdminUser> {
  await new Promise((resolve) =>
    setTimeout(resolve, 600 + Math.random() * 400),
  );

  const userIndex = mockUsers.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    throw new Error("User not found");
  }

  const updatedUser = {
    ...mockUsers[userIndex],
    ...data,
    name:
      data.firstName && data.lastName
        ? `${data.firstName} ${data.lastName}`
        : mockUsers[userIndex].name,
    updatedAt: new Date().toISOString(),
  };

  mockUsers[userIndex] = updatedUser;
  return updatedUser;
}

async function deleteUser(id: string): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, 400 + Math.random() * 300),
  );

  const userIndex = mockUsers.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    throw new Error("User not found");
  }

  mockUsers.splice(userIndex, 1);
}

// React Query Hooks
export function useUsers(params: UsersListParams = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => fetchUsers(params),
    staleTime: 30 * 1000, // 30 seconds
    keepPreviousData: true,
    suspense: true,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => fetchUser(id),
    staleTime: 30 * 1000,
    suspense: true,
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
      updateUser(id, data),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(userKeys.detail(updatedUser.id), updatedUser);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUser,
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: userKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
