/**
 * Admin Domain API Hooks
 * React Query hooks for domain management operations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminDomain,
  AdminDomainDetail,
  DomainListQuery,
  DomainListResponse,
  CreateDomainRequest,
  CreateDomainResponse,
  VerifyDomainOwnershipRequest,
  ConfigureDnsRequest,
  ConfigureDnsResponse,
  UpdateDomainSettingsRequest,
  GenerateDkimKeyRequest,
  DkimKey,
  CheckDnsRecordsRequest,
  CheckDnsRecordsResponse,
  DomainUser as _DomainUser,
  DomainUsersResponse,
  DomainBranding,
  DomainSettings,
  DomainPolicies,
} from "@email/types";

// ============================================================
// API CLIENT
// ============================================================

const API_BASE = "/api/v1/admin";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: Object.assign({ "Content-Type": "application/json" }, options?.headers),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Request failed" }))) as {
      message?: string;
    };
    throw new Error(error.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const adminDomainKeys = {
  all: ["admin", "domains"] as const,
  lists: () => [...adminDomainKeys.all, "list"] as const,
  list: (query: DomainListQuery) => [...adminDomainKeys.lists(), query] as const,
  details: () => [...adminDomainKeys.all, "detail"] as const,
  detail: (id: string) => [...adminDomainKeys.details(), id] as const,
  dnsRecords: (id: string) => [...adminDomainKeys.detail(id), "dns"] as const,
  dkimKeys: (id: string) => [...adminDomainKeys.detail(id), "dkim"] as const,
  users: (id: string) => [...adminDomainKeys.detail(id), "users"] as const,
  branding: (id: string) => [...adminDomainKeys.detail(id), "branding"] as const,
  settings: (id: string) => [...adminDomainKeys.detail(id), "settings"] as const,
  policies: (id: string) => [...adminDomainKeys.detail(id), "policies"] as const,
};

// ============================================================
// DOMAIN LIST
// ============================================================

/**
 * Get list of domains with filtering and pagination
 */
export function useAdminDomains(query: DomainListQuery = {}) {
  return useQuery({
    queryKey: adminDomainKeys.list(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.status) params.set("status", query.status);
      if (query.search) params.set("search", query.search);
      if (query.page) params.set("page", query.page.toString());
      if (query.pageSize) params.set("pageSize", query.pageSize.toString());
      if (query.sortBy) params.set("sortBy", query.sortBy);
      if (query.sortOrder) params.set("sortOrder", query.sortOrder);

      return fetchJson<DomainListResponse>(`/domains?${params}`);
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================================
// DOMAIN DETAIL
// ============================================================

/**
 * Get detailed domain information
 */
export function useAdminDomain(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.detail(domainId ?? ""),
    queryFn: () => fetchJson<AdminDomainDetail>(`/domains/${domainId}`),
    enabled: !!domainId,
    staleTime: 30 * 1000,
  });
}

// ============================================================
// CREATE DOMAIN
// ============================================================

/**
 * Create a new domain
 */
export function useCreateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateDomainRequest) =>
      fetchJson<CreateDomainResponse>("/domains", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.lists() });
    },
  });
}

// ============================================================
// VERIFY DOMAIN OWNERSHIP
// ============================================================

/**
 * Verify domain ownership
 */
export function useVerifyDomainOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: VerifyDomainOwnershipRequest) =>
      fetchJson<{ verified: boolean; error?: string }>(
        `/domains/${request.domainId}/verify-ownership`,
        {
          method: "POST",
          body: JSON.stringify({ verificationId: request.verificationId }),
        }
      ),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

// ============================================================
// CONFIGURE DNS
// ============================================================

/**
 * Configure DNS records for domain
 */
export function useConfigureDns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ConfigureDnsRequest) =>
      fetchJson<ConfigureDnsResponse>(`/domains/${request.domainId}/configure-dns`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

// ============================================================
// CHECK DNS RECORDS
// ============================================================

/**
 * Check DNS records status
 */
export function useCheckDnsRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CheckDnsRecordsRequest) =>
      fetchJson<CheckDnsRecordsResponse>(`/domains/${request.domainId}/check-dns`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.dnsRecords(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

/**
 * Get DNS records for domain
 */
export function useDnsRecords(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.dnsRecords(domainId ?? ""),
    queryFn: () => fetchJson<CheckDnsRecordsResponse>(`/domains/${domainId}/dns-records`),
    enabled: !!domainId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================================
// DKIM KEYS
// ============================================================

/**
 * Get DKIM keys for domain
 */
export function useDkimKeys(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.dkimKeys(domainId ?? ""),
    queryFn: () => fetchJson<{ keys: DkimKey[] }>(`/domains/${domainId}/dkim-keys`),
    enabled: !!domainId,
    select: (data) => data.keys,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Generate new DKIM key
 */
export function useGenerateDkimKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: GenerateDkimKeyRequest) =>
      fetchJson<DkimKey>(`/domains/${request.domainId}/dkim-keys`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.dkimKeys(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

/**
 * Activate DKIM key
 */
export function useActivateDkimKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, keyId }: { domainId: string; keyId: string }) =>
      fetchJson<DkimKey>(`/domains/${domainId}/dkim-keys/${keyId}/activate`, {
        method: "POST",
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.dkimKeys(variables.domainId),
      });
    },
  });
}

/**
 * Deactivate DKIM key
 */
export function useDeactivateDkimKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, keyId }: { domainId: string; keyId: string }) =>
      fetchJson<DkimKey>(`/domains/${domainId}/dkim-keys/${keyId}/deactivate`, {
        method: "POST",
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.dkimKeys(variables.domainId),
      });
    },
  });
}

/**
 * Delete DKIM key
 */
export function useDeleteDkimKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, keyId }: { domainId: string; keyId: string }) =>
      fetchJson<null>(`/domains/${domainId}/dkim-keys/${keyId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.dkimKeys(variables.domainId),
      });
    },
  });
}

// ============================================================
// DOMAIN USERS
// ============================================================

interface DomainUsersQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Get users with email addresses on this domain
 */
export function useDomainUsers(domainId: string | null, query: DomainUsersQuery = {}) {
  return useQuery({
    queryKey: [...adminDomainKeys.users(domainId ?? ""), query] as const,
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.search) params.set("search", query.search);
      if (query.page) params.set("page", query.page.toString());
      if (query.pageSize) params.set("pageSize", query.pageSize.toString());
      const queryString = params.toString();
      return fetchJson<DomainUsersResponse>(
        `/domains/${domainId}/users${queryString ? `?${queryString}` : ""}`
      );
    },
    enabled: !!domainId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Export domain users to CSV
 */
export function useExportDomainUsers() {
  return useMutation({
    mutationFn: ({ domainId, search }: { domainId: string; search?: string }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const queryString = params.toString();

      return fetch(
        `${API_BASE}/domains/${domainId}/users/export${queryString ? `?${queryString}` : ""}`,
        {
          method: "GET",
        }
      ).then((res) => res.blob());
    },
  });
}

// ============================================================
// DOMAIN BRANDING
// ============================================================

/**
 * Get domain branding settings
 */
export function useDomainBranding(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.branding(domainId ?? ""),
    queryFn: () => fetchJson<DomainBranding>(`/domains/${domainId}/branding`),
    enabled: !!domainId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update domain branding settings
 */
export function useUpdateDomainBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, branding }: { domainId: string; branding: DomainBranding }) =>
      fetchJson<DomainBranding>(`/domains/${domainId}/branding`, {
        method: "PUT",
        body: JSON.stringify(branding),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.branding(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

/**
 * Upload domain logo
 */
export function useUploadDomainLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domainId, file }: { domainId: string; file: File }) => {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch(`${API_BASE}/domains/${domainId}/branding/logo`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: "Upload failed" }))) as {
          message?: string;
        };
        throw new Error(error.message ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { logoUrl: string };
      return data.logoUrl;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.branding(variables.domainId),
      });
    },
  });
}

// ============================================================
// DOMAIN SETTINGS
// ============================================================

/**
 * Get domain settings
 */
export function useDomainSettings(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.settings(domainId ?? ""),
    queryFn: () => fetchJson<DomainSettings>(`/domains/${domainId}/settings`),
    enabled: !!domainId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update domain settings
 */
export function useUpdateDomainSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, settings }: { domainId: string; settings: DomainSettings }) =>
      fetchJson<DomainSettings>(`/domains/${domainId}/settings`, {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.settings(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

// ============================================================
// DOMAIN POLICIES
// ============================================================

/**
 * Get domain policies
 */
export function useDomainPolicies(domainId: string | null) {
  return useQuery({
    queryKey: adminDomainKeys.policies(domainId ?? ""),
    queryFn: () => fetchJson<DomainPolicies>(`/domains/${domainId}/policies`),
    enabled: !!domainId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update domain policies
 */
export function useUpdateDomainPolicies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, policies }: { domainId: string; policies: DomainPolicies }) =>
      fetchJson<DomainPolicies>(`/domains/${domainId}/policies`, {
        method: "PUT",
        body: JSON.stringify(policies),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.policies(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
    },
  });
}

// ============================================================
// UPDATE DOMAIN
// ============================================================

/**
 * Update domain settings and branding
 */
export function useUpdateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateDomainSettingsRequest) =>
      fetchJson<AdminDomainDetail>(`/domains/${request.domainId}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminDomainKeys.detail(variables.domainId),
      });
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.lists() });
    },
  });
}

/**
 * Make domain primary
 */
export function useMakeDomainPrimary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) =>
      fetchJson<AdminDomain>(`/domains/${domainId}/make-primary`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.all });
    },
  });
}

/**
 * Suspend domain
 */
export function useSuspendDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) =>
      fetchJson<AdminDomain>(`/domains/${domainId}/suspend`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.all });
    },
  });
}

/**
 * Activate domain
 */
export function useActivateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) =>
      fetchJson<AdminDomain>(`/domains/${domainId}/activate`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.all });
    },
  });
}

/**
 * Delete domain
 */
export function useDeleteDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) =>
      fetchJson<null>(`/domains/${domainId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.lists() });
    },
  });
}

// ============================================================
// BULK OPERATIONS
// ============================================================

/**
 * Verify DNS for multiple domains
 */
export function useBulkVerifyDns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainIds: string[]) =>
      fetchJson<{ results: Record<string, CheckDnsRecordsResponse> }>("/domains/bulk-verify-dns", {
        method: "POST",
        body: JSON.stringify({ domainIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminDomainKeys.all });
    },
  });
}

/**
 * Export domains list
 */
export function useExportDomains() {
  return useMutation({
    mutationFn: (query: DomainListQuery) => {
      const params = new URLSearchParams();
      if (query.status) params.set("status", query.status);
      if (query.search) params.set("search", query.search);

      return fetch(`${API_BASE}/domains/export?${params}`, {
        method: "GET",
      }).then((res) => res.blob());
    },
  });
}
