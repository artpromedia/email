import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "../hooks/useAdminToast";

// Types for Groups
export interface Group {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: "admin" | "user" | "support";
  joinedAt: string;
}

export interface CreateGroupData {
  name: string;
  description: string;
}

export interface UpdateGroupData {
  name?: string;
  description?: string;
}

// Mock data
const mockGroups: Group[] = [
  {
    id: "1",
    name: "Administrators",
    description: "System administrators with full access",
    memberCount: 3,
    createdAt: "2025-01-15T09:00:00Z",
    updatedAt: "2025-08-29T15:45:00Z",
  },
  {
    id: "2",
    name: "IT Support",
    description: "Technical support team",
    memberCount: 8,
    createdAt: "2025-02-10T10:15:00Z",
    updatedAt: "2025-08-25T14:20:00Z",
  },
  {
    id: "3",
    name: "Marketing",
    description: "Marketing and communications team",
    memberCount: 15,
    createdAt: "2025-03-05T08:30:00Z",
    updatedAt: "2025-08-20T11:30:00Z",
  },
];

const mockGroupMembers: Record<string, GroupMember[]> = {
  "1": [
    {
      id: "1",
      userId: "1",
      userName: "John Doe",
      userEmail: "john.doe@ceerion.com",
      role: "admin",
      joinedAt: "2025-01-15T09:00:00Z",
    },
    {
      id: "2",
      userId: "2",
      userName: "Jane Smith",
      userEmail: "jane.smith@ceerion.com",
      role: "admin",
      joinedAt: "2025-02-01T10:00:00Z",
    },
  ],
  "2": [
    {
      id: "3",
      userId: "3",
      userName: "Bob Wilson",
      userEmail: "bob.wilson@ceerion.com",
      role: "support",
      joinedAt: "2025-02-10T10:15:00Z",
    },
  ],
  "3": [],
};

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock API functions
export const groupsAPI = {
  async getGroups(): Promise<Group[]> {
    await delay(300);
    return mockGroups;
  },

  async getGroup(groupId: string): Promise<Group> {
    await delay(200);
    const group = mockGroups.find((g) => g.id === groupId);
    if (!group) throw new Error("Group not found");
    return group;
  },

  async createGroup(data: CreateGroupData): Promise<Group> {
    await delay(400);
    if (Math.random() < 0.05) throw new Error("Failed to create group");

    const newGroup: Group = {
      id: Date.now().toString(),
      name: data.name,
      description: data.description,
      memberCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockGroups.push(newGroup);
    return newGroup;
  },

  async updateGroup(groupId: string, data: UpdateGroupData): Promise<Group> {
    await delay(350);
    if (Math.random() < 0.05) throw new Error("Failed to update group");

    const groupIndex = mockGroups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) throw new Error("Group not found");

    const updatedGroup = {
      ...mockGroups[groupIndex],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    mockGroups[groupIndex] = updatedGroup;
    return updatedGroup;
  },

  async deleteGroup(groupId: string): Promise<void> {
    await delay(300);
    if (Math.random() < 0.03) throw new Error("Failed to delete group");

    const index = mockGroups.findIndex((g) => g.id === groupId);
    if (index === -1) throw new Error("Group not found");

    mockGroups.splice(index, 1);
  },

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    await delay(250);
    return mockGroupMembers[groupId] || [];
  },

  async addMember(groupId: string, userId: string): Promise<GroupMember> {
    await delay(300);
    if (Math.random() < 0.05) throw new Error("Failed to add member");

    const newMember: GroupMember = {
      id: Date.now().toString(),
      userId,
      userName: `User ${userId}`,
      userEmail: `user${userId}@ceerion.com`,
      role: "user",
      joinedAt: new Date().toISOString(),
    };

    if (!mockGroupMembers[groupId]) {
      mockGroupMembers[groupId] = [];
    }
    mockGroupMembers[groupId].push(newMember);

    // Update member count
    const group = mockGroups.find((g) => g.id === groupId);
    if (group) {
      group.memberCount = mockGroupMembers[groupId].length;
    }

    return newMember;
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await delay(250);
    if (Math.random() < 0.03) throw new Error("Failed to remove member");

    if (mockGroupMembers[groupId]) {
      const index = mockGroupMembers[groupId].findIndex(
        (m) => m.userId === userId,
      );
      if (index !== -1) {
        mockGroupMembers[groupId].splice(index, 1);

        // Update member count
        const group = mockGroups.find((g) => g.id === groupId);
        if (group) {
          group.memberCount = mockGroupMembers[groupId].length;
        }
      }
    }
  },
};

// Query Keys
export const groupsKeys = {
  all: ["groups"] as const,
  lists: () => [...groupsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...groupsKeys.lists(), { filters }] as const,
  details: () => [...groupsKeys.all, "detail"] as const,
  detail: (id: string) => [...groupsKeys.details(), id] as const,
  members: (id: string) => [...groupsKeys.detail(id), "members"] as const,
};

// Query Hooks
export function useGroups() {
  return useQuery({
    queryKey: groupsKeys.lists(),
    queryFn: () => groupsAPI.getGroups(),
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupsKeys.detail(groupId),
    queryFn: () => groupsAPI.getGroup(groupId),
    enabled: !!groupId,
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: groupsKeys.members(groupId),
    queryFn: () => groupsAPI.getGroupMembers(groupId),
    enabled: !!groupId,
  });
}

// Mutation Hooks
export function useCreateGroup() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (data: CreateGroupData) => groupsAPI.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKeys.lists() });
      toast.success("Group created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create group: ${error.message}`);
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({
      groupId,
      data,
    }: {
      groupId: string;
      data: UpdateGroupData;
    }) => groupsAPI.updateGroup(groupId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: groupsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: groupsKeys.lists() });
      toast.success("Group updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update group: ${error.message}`);
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (groupId: string) => groupsAPI.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKeys.lists() });
      toast.success("Group deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete group: ${error.message}`);
    },
  });
}

export function useAddGroupMember() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsAPI.addMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupsKeys.members(groupId) });
      queryClient.invalidateQueries({ queryKey: groupsKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupsKeys.lists() });
      toast.success("Member added to group");
    },
    onError: (error: Error) => {
      toast.error(`Failed to add member: ${error.message}`);
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  const toast = useAdminToast();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsAPI.removeMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupsKeys.members(groupId) });
      queryClient.invalidateQueries({ queryKey: groupsKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupsKeys.lists() });
      toast.success("Member removed from group");
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove member: ${error.message}`);
    },
  });
}
