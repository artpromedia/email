// Mock admin client for development - replace with real SDK when backend is ready
export interface MockAdminClient {
  admin: {
    users: {
      list: (params?: any) => Promise<any>;
      create: (body: any) => Promise<any>;
      update: (id: string, body: any) => Promise<any>;
      delete: (id: string) => Promise<any>;
      resetPassword: (id: string) => Promise<any>;
    };
    quarantine: {
      list: (params?: any) => Promise<any>;
      get: (id: string) => Promise<any>;
      release: (id: string) => Promise<any>;
      delete: (id: string) => Promise<any>;
      allowlist: (id: string) => Promise<any>;
      downloadEml: (id: string) => Promise<any>;
      bulkRelease: (body: any) => Promise<any>;
      bulkDelete: (body: any) => Promise<any>;
      bulkAllowlist: (body: any) => Promise<any>;
      stats: () => Promise<any>;
    };
  };
}

export function createMockAdminClient(): MockAdminClient {
  return {
    admin: {
      users: {
        list: async (_params?: any) => {
          // Mock implementation
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: [], total: 0 };
        },
        create: async (body: any) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: { id: `user-${Date.now()}`, ...body } };
        },
        update: async (id: string, body: any) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: { id, ...body } };
        },
        delete: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true };
        },
        resetPassword: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            tempPassword: "temp123",
            resetLink: "https://admin.ceerion.com/reset/token123",
          };
        },
      },
      quarantine: {
        list: async (_params?: any) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: [], total: 0 };
        },
        get: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: null };
        },
        release: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true };
        },
        delete: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true };
        },
        allowlist: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true };
        },
        downloadEml: async (_id: string) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { data: "mock-eml-content" };
        },
        bulkRelease: async (body: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { success: body.ids, failed: [] };
        },
        bulkDelete: async (body: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { success: body.ids, failed: [] };
        },
        bulkAllowlist: async (body: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { success: body.ids, failed: [] };
        },
        stats: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            data: {
              total: 156,
              spam: 89,
              malware: 23,
              policy: 44,
              todayCount: 12,
              avgScore: 78.5,
            },
          };
        },
      },
    },
  };
}
