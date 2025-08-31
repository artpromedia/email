import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";

// Types
export interface AdminUser {
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
}

export interface UsersListParams {
  query?: string;
  role?: "admin" | "user" | "support" | "all" | "";
  status?: "active" | "suspended" | "pending" | "all" | "";
  enabled?: boolean | "";
  mfa?: boolean | "";
  page?: number;
  limit?: number;
}

export interface UsersListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  hasNextPage: boolean;
}

// Mock data
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
];

// Simple API simulation
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const simpleAPI = {
  async getUsers(params: UsersListParams): Promise<UsersListResponse> {
    await delay(300);

    let filteredUsers = [...mockUsers];

    if (params.query) {
      const query = params.query.toLowerCase();
      filteredUsers = filteredUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      );
    }

    if (params.role && params.role !== "all") {
      filteredUsers = filteredUsers.filter((user) => user.role === params.role);
    }

    if (params.status && params.status !== "all") {
      filteredUsers = filteredUsers.filter(
        (user) => user.status === params.status,
      );
    }

    return {
      users: filteredUsers,
      total: filteredUsers.length,
      page: params.page || 1,
      hasNextPage: false,
    };
  },
};

// Query Keys
export const userKeys = {
  all: ["simple", "users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: UsersListParams) => [...userKeys.lists(), params] as const,
};

// Simple hook for URL params
export function useUsersParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: UsersListParams = {
    query: searchParams.get("query") || "",
    role: (searchParams.get("role") as any) || "",
    status: (searchParams.get("status") as any) || "",
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "20"),
  };

  const updateParams = useCallback(
    (newParams: Partial<UsersListParams>) => {
      const updatedParams = new URLSearchParams(searchParams);

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === "" || value === undefined || value === null) {
          updatedParams.delete(key);
        } else {
          updatedParams.set(key, String(value));
        }
      });

      setSearchParams(updatedParams);
    },
    [searchParams, setSearchParams],
  );

  return { params, updateParams };
}

// Simple React Query hook
export function useUsers() {
  const { params } = useUsersParams();

  return useQuery<UsersListResponse>({
    queryKey: userKeys.list(params),
    queryFn: () => simpleAPI.getUsers(params),
    staleTime: 30 * 1000,
  });
}
