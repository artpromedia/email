/**
 * Domain Admin API Hooks
 * React Query hooks for domain management operations
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type {
  AdminDomain,
  AdminDomainDetail,
  ListDomainsQuery,
  ListDomainsResponse,
  CreateDomainRequest,
  VerifyDomainRequest,
  VerifyDomainResponse,
  VerificationRecord,
  VerificationMethod,
  ConfigureDnsResponse,
  DnsRecord,
  DkimKey,
  GenerateDkimKeyRequest,
  UpdateDomainSettingsRequest,
  UpdateDomainBrandingRequest,
  DomainSettings,
  DomainBranding,
  ListDomainUsersQuery,
  ListDomainUsersResponse,
  DomainUser,
  BulkUserAction,
  ExportDomainsRequest,
} from "./types";

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
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error((error as { message?: string }).message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function uploadFile(url: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return response.json() as Promise<{ url: string }>;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const domainAdminKeys = {
  all: ["admin", "domains"] as const,
  list: (query: ListDomainsQuery) => [...domainAdminKeys.all, "list", query] as const,
  detail: (id: string) => [...domainAdminKeys.all, "detail", id] as const,
  dnsRecords: (id: string) => [...domainAdminKeys.all, "dns", id] as const,
  dkimKeys: (id: string) => [...domainAdminKeys.all, "dkim", id] as const,
  users: (query: ListDomainUsersQuery) => [...domainAdminKeys.all, "users", query] as const,
  settings: (id: string) => [...domainAdminKeys.all, "settings", id] as const,
  branding: (id: string) => [...domainAdminKeys.all, "branding", id] as const,
  verificationRecord: (id: string, method: VerificationMethod) =>
    [...domainAdminKeys.all, "verification", id, method] as const,
};

// ============================================================
// DOMAIN LIST QUERIES
// ============================================================

/**
 * Fetch list of domains with pagination and filters
 */
export function useDomainsList(
  query: ListDomainsQuery,
  options?: Omit<UseQueryOptions<ListDomainsResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.list(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.status) params.set("status", query.status);
      if (query.search) params.set("search", query.search);
      if (query.page) params.set("page", String(query.page));
      if (query.pageSize) params.set("pageSize", String(query.pageSize));
      if (query.sortBy) params.set("sortBy", query.sortBy);
      if (query.sortOrder) params.set("sortOrder", query.sortOrder);

      return fetchJson<ListDomainsResponse>(`/domains?${params.toString()}`);
    },
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Fetch single domain with full details
 */
export function useDomainDetail(
  domainId: string,
  options?: Omit<UseQueryOptions<AdminDomainDetail>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.detail(domainId),
    queryFn: () => fetchJson<AdminDomainDetail>(`/domains/${domainId}`),
    enabled: !!domainId,
    staleTime: 30 * 1000,
    ...options,
  });
}

// ============================================================
// DOMAIN CRUD MUTATIONS
// ============================================================

/**
 * Create a new domain (Step 1 of wizard)
 */
export function useCreateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateDomainRequest) =>
      fetchJson<{ domain: AdminDomain; verificationRecords: VerificationRecord[] }>("/domains", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

/**
 * Check if domain is available
 */
export function useCheckDomainAvailability() {
  return useMutation({
    mutationFn: (domain: string) =>
      fetchJson<{ available: boolean; reason?: string }>(
        `/domains/check?domain=${encodeURIComponent(domain)}`
      ),
  });
}

/**
 * Get verification record for a domain
 */
export function useVerificationRecord(
  domainId: string,
  method: VerificationMethod,
  options?: Omit<UseQueryOptions<VerificationRecord>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.verificationRecord(domainId, method),
    queryFn: () => fetchJson<VerificationRecord>(`/domains/${domainId}/verification/${method}`),
    enabled: !!domainId && !!method,
    ...options,
  });
}

/**
 * Verify domain ownership (Step 2)
 */
export function useVerifyDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: VerifyDomainRequest) =>
      fetchJson<VerifyDomainResponse>(`/domains/${request.domainId}/verify`, {
        method: "POST",
        body: JSON.stringify({ method: request.method }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.detail(variables.domainId),
      });
    },
  });
}

/**
 * Update domain status
 */
export function useUpdateDomainStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, status }: { domainId: string; status: "active" | "suspended" }) =>
      fetchJson<AdminDomain>(`/domains/${domainId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.detail(variables.domainId),
      });
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

/**
 * Delete domain
 */
export function useDeleteDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) => fetchJson<null>(`/domains/${domainId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

// ============================================================
// DNS QUERIES & MUTATIONS
// ============================================================

/**
 * Get DNS records for domain
 */
export function useDnsRecords(
  domainId: string,
  options?: Omit<UseQueryOptions<DnsRecord[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.dnsRecords(domainId),
    queryFn: () =>
      fetchJson<{ records: DnsRecord[] }>(`/domains/${domainId}/dns`).then((r) => r.records),
    enabled: !!domainId,
    ...options,
  });
}

/**
 * Verify DNS records
 */
export function useVerifyDns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) =>
      fetchJson<ConfigureDnsResponse>(`/domains/${domainId}/dns/verify`, {
        method: "POST",
      }),
    onSuccess: (_, domainId) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.dnsRecords(domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.detail(domainId),
      });
    },
  });
}

/**
 * Bulk verify DNS for multiple domains
 */
export function useBulkVerifyDns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainIds: string[]) =>
      fetchJson<{ results: Record<string, ConfigureDnsResponse> }>("/domains/dns/bulk-verify", {
        method: "POST",
        body: JSON.stringify({ domainIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

// ============================================================
// DKIM QUERIES & MUTATIONS
// ============================================================

/**
 * Get DKIM keys for domain
 */
export function useDkimKeys(
  domainId: string,
  options?: Omit<UseQueryOptions<DkimKey[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.dkimKeys(domainId),
    queryFn: () => fetchJson<{ keys: DkimKey[] }>(`/domains/${domainId}/dkim`).then((r) => r.keys),
    enabled: !!domainId,
    ...options,
  });
}

/**
 * Generate new DKIM key
 */
export function useGenerateDkimKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, request }: { domainId: string; request: GenerateDkimKeyRequest }) =>
      fetchJson<DkimKey>(`/domains/${domainId}/dkim`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.dkimKeys(variables.domainId),
      });
    },
  });
}

/**
 * Update DKIM key status
 */
export function useUpdateDkimKeyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      domainId,
      keyId,
      status,
    }: {
      domainId: string;
      keyId: string;
      status: "active" | "disabled";
    }) =>
      fetchJson<DkimKey>(`/domains/${domainId}/dkim/${keyId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.dkimKeys(variables.domainId),
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
      fetchJson<null>(`/domains/${domainId}/dkim/${keyId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.dkimKeys(variables.domainId),
      });
    },
  });
}

// ============================================================
// SETTINGS QUERIES & MUTATIONS
// ============================================================

/**
 * Get domain settings
 */
export function useDomainSettings(
  domainId: string,
  options?: Omit<UseQueryOptions<DomainSettings>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.settings(domainId),
    queryFn: () => fetchJson<DomainSettings>(`/domains/${domainId}/settings`),
    enabled: !!domainId,
    ...options,
  });
}

/**
 * Update domain settings
 */
export function useUpdateDomainSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateDomainSettingsRequest) =>
      fetchJson<DomainSettings>(`/domains/${request.domainId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(request.settings),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.settings(variables.domainId),
      });
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.detail(variables.domainId),
      });
    },
  });
}

// ============================================================
// BRANDING QUERIES & MUTATIONS
// ============================================================

/**
 * Get domain branding
 */
export function useDomainBranding(
  domainId: string,
  options?: Omit<UseQueryOptions<DomainBranding>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.branding(domainId),
    queryFn: () => fetchJson<DomainBranding>(`/domains/${domainId}/branding`),
    enabled: !!domainId,
    ...options,
  });
}

/**
 * Update domain branding
 */
export function useUpdateDomainBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateDomainBrandingRequest) =>
      fetchJson<DomainBranding>(`/domains/${request.domainId}/branding`, {
        method: "PATCH",
        body: JSON.stringify(request.branding),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: domainAdminKeys.branding(variables.domainId),
      });
    },
  });
}

/**
 * Upload branding asset (logo, favicon, background)
 */
export function useUploadBrandingAsset() {
  return useMutation({
    mutationFn: ({
      domainId,
      assetType,
      file,
    }: {
      domainId: string;
      assetType: "logo" | "favicon" | "loginBackground";
      file: File;
    }) => uploadFile(`/domains/${domainId}/branding/${assetType}`, file),
  });
}

// ============================================================
// DOMAIN USERS QUERIES & MUTATIONS
// ============================================================

/**
 * Get users for a domain
 */
export function useDomainUsers(
  query: ListDomainUsersQuery,
  options?: Omit<UseQueryOptions<ListDomainUsersResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: domainAdminKeys.users(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.search) params.set("search", query.search);
      if (query.status) params.set("status", query.status);
      if (query.role) params.set("role", query.role);
      if (query.page) params.set("page", String(query.page));
      if (query.pageSize) params.set("pageSize", String(query.pageSize));

      return fetchJson<ListDomainUsersResponse>(
        `/domains/${query.domainId}/users?${params.toString()}`
      );
    },
    enabled: !!query.domainId,
    ...options,
  });
}

/**
 * Add user to domain
 */
export function useAddUserToDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      domainId,
      userId,
      emailAddress,
    }: {
      domainId: string;
      userId?: string;
      emailAddress: string;
    }) =>
      fetchJson<DomainUser>(`/domains/${domainId}/users`, {
        method: "POST",
        body: JSON.stringify({ userId, emailAddress }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

/**
 * Perform bulk action on users
 */
export function useBulkUserAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, action }: { domainId: string; action: BulkUserAction }) =>
      fetchJson<{ affected: number }>(`/domains/${domainId}/users/bulk`, {
        method: "POST",
        body: JSON.stringify(action),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainAdminKeys.all });
    },
  });
}

// ============================================================
// EXPORT
// ============================================================

/**
 * Export domains
 */
export function useExportDomains() {
  return useMutation({
    mutationFn: async (request: ExportDomainsRequest) => {
      const response = await fetch(`${API_BASE}/domains/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `domains-export.${request.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}
