import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export interface UpdateUserRequest {
  role?: "admin" | "user" | "support";
  enabled?: boolean;
  quotaLimit?: number;
}

export interface UsersListParams {
  query?: string;
  page?: number;
  limit?: number;
}

export interface ResetPasswordResponse {
  tempToken: string;
  tempLink: string;
  expiresAt: Date;
}

// User Management Functions
export async function getUsers(
  params?: UsersListParams,
): Promise<{ users: AdminUser[]; total: number }> {
  try {
    // TODO: Replace with actual SDK call
    // const response = await sdk.admin.users.list(params);

    // Mock data for now
    const mockUsers: AdminUser[] = [
      {
        id: "1",
        email: "john.doe@company.com",
        firstName: "John",
        lastName: "Doe",
        name: "John Doe",
        status: "active",
        role: "user",
        enabled: true,
        lastLogin: new Date(Date.now() - 3600000),
        createdAt: new Date(Date.now() - 86400000 * 30),
        quotaUsed: 2.5,
        quotaLimit: 10,
        deviceInfo: {
          primary: "Chrome on Windows 11",
          secondary: "iPhone 15 Pro • Last sync: 2h ago",
        },
      },
      {
        id: "2",
        email: "admin@company.com",
        firstName: "Admin",
        lastName: "User",
        name: "Admin User",
        status: "active",
        role: "admin",
        enabled: true,
        lastLogin: new Date(Date.now() - 1800000),
        createdAt: new Date(Date.now() - 86400000 * 90),
        quotaUsed: 0.8,
        quotaLimit: 50,
        deviceInfo: {
          primary: "Safari on MacBook Pro",
          secondary: "iPad Pro • Last sync: 15m ago",
        },
      },
      {
        id: "3",
        email: "jane.smith@company.com",
        firstName: "Jane",
        lastName: "Smith",
        name: "Jane Smith",
        status: "suspended",
        role: "user",
        enabled: false,
        lastLogin: new Date(Date.now() - 86400000 * 7),
        createdAt: new Date(Date.now() - 86400000 * 60),
        quotaUsed: 15.2,
        quotaLimit: 20,
        deviceInfo: {
          primary: "Firefox on Ubuntu",
          secondary: "Android • Last sync: 7d ago",
        },
      },
      {
        id: "4",
        email: "support@company.com",
        firstName: "Support",
        lastName: "Team",
        name: "Support Team",
        status: "active",
        role: "support",
        enabled: true,
        lastLogin: new Date(Date.now() - 300000),
        createdAt: new Date(Date.now() - 86400000 * 120),
        quotaUsed: 5.7,
        quotaLimit: 100,
        deviceInfo: {
          primary: "Edge on Windows 11",
          secondary: "Teams Mobile • Last sync: 5m ago",
        },
      },
    ];

    // Apply search filter
    let filteredUsers = mockUsers;
    if (params?.query) {
      const query = params.query.toLowerCase();
      filteredUsers = mockUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query),
      );
    }

    // Apply pagination
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const start = (page - 1) * limit;
    const paginatedUsers = filteredUsers.slice(start, start + limit);

    return {
      users: paginatedUsers,
      total: filteredUsers.length,
    };
  } catch (error) {
    console.error("Failed to fetch users:", error);
    throw new Error("Failed to fetch users");
  }
}

export async function createUser(
  userData: CreateUserRequest,
): Promise<AdminUser> {
  try {
    // TODO: Replace with actual SDK call
    // const response = await sdk.admin.users.create(userData);

    // Mock implementation
    const newUser: AdminUser = {
      id: Math.random().toString(36).substring(7),
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      name: `${userData.firstName} ${userData.lastName}`,
      status: "pending",
      role: userData.role,
      enabled: true,
      createdAt: new Date(),
      quotaUsed: 0,
      quotaLimit: userData.quotaLimit,
      deviceInfo: {
        primary: "Not yet logged in",
        secondary: "Account pending activation",
      },
    };

    return newUser;
  } catch (error) {
    console.error("Failed to create user:", error);
    throw new Error("Failed to create user");
  }
}

export async function resetUserPassword(
  userId: string,
): Promise<ResetPasswordResponse> {
  try {
    // TODO: Replace with actual SDK call
    // const response = await sdk.admin.users.resetPassword(userId);

    // Mock implementation
    const tempToken = `${userId}_${Math.random().toString(36).substring(2, 15)}`;
    const tempLink = `https://mail.company.com/reset?token=${tempToken}`;

    return {
      tempToken,
      tempLink,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  } catch (error) {
    console.error("Failed to reset password:", error);
    throw new Error("Failed to reset password");
  }
}

export async function updateUser(
  userId: string,
  updates: UpdateUserRequest,
): Promise<AdminUser> {
  try {
    // TODO: Replace with actual SDK call
    // const response = await sdk.admin.users.update(userId, updates);

    // Mock implementation - in real app, this would return the updated user
    const { users } = await getUsers();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      throw new Error("User not found");
    }

    const updatedUser: AdminUser = {
      ...user,
      ...updates,
      status: updates.enabled === false ? "suspended" : user.status,
    };

    return updatedUser;
  } catch (error) {
    console.error("Failed to update user:", error);
    throw new Error("Failed to update user");
  }
}

export async function deleteUser(userId: string): Promise<void> {
  try {
    // TODO: Replace with actual SDK call
    // await sdk.admin.users.delete(userId);

    // Mock implementation
    console.log(`User ${userId} deleted`);
  } catch (error) {
    console.error("Failed to delete user:", error);
    throw new Error("Failed to delete user");
  }
}
