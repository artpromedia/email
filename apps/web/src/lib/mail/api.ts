/**
 * Mail API Hooks
 * React Query hooks for mail-related API operations
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import type {
  Domain,
  EmailListItem,
  EmailListQuery,
  MoveEmailRequest,
  MoveDestination,
} from "./types";

// ============================================================
// API CLIENT (placeholder - implement with actual API)
// ============================================================

const API_BASE = "/api/v1";

function getMailAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...getMailAuthHeaders(), ...(options?.headers as Record<string, string>) },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Request failed" }))) as {
      message?: string;
    };
    throw new Error(error.message ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const mailKeys = {
  all: ["mail"] as const,
  domains: () => [...mailKeys.all, "domains"] as const,
  domain: (id: string) => [...mailKeys.domains(), id] as const,
  emails: () => [...mailKeys.all, "emails"] as const,
  emailList: (query: EmailListQuery) => [...mailKeys.emails(), query] as const,
  email: (id: string) => [...mailKeys.emails(), id] as const,
  folders: () => [...mailKeys.all, "folders"] as const,
  folder: (id: string) => [...mailKeys.folders(), id] as const,
  unreadCounts: () => [...mailKeys.all, "unreadCounts"] as const,
};

// ============================================================
// DOMAIN QUERIES
// ============================================================

export function useDomains() {
  return useQuery({
    queryKey: mailKeys.domains(),
    queryFn: () => fetchJson<{ domains: Domain[] }>("/mail/domains"),
    select: (data) => data.domains,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDomain(domainId: string) {
  return useQuery({
    queryKey: mailKeys.domain(domainId),
    queryFn: () => fetchJson<Domain>(`/mail/domains/${domainId}`),
    enabled: !!domainId && domainId !== "all",
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================
// EMAIL LIST QUERIES
// ============================================================

interface EmailListResponse {
  emails: EmailListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function useEmails(query: EmailListQuery) {
  return useQuery({
    queryKey: mailKeys.emailList(query),
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (value instanceof Date) {
            params.set(key, value.toISOString());
          } else {
            params.set(key, String(value));
          }
        }
      });
      return fetchJson<EmailListResponse>(`/mail/emails?${params}`);
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useInfiniteEmails(query: Omit<EmailListQuery, "page">) {
  return useInfiniteQuery({
    queryKey: mailKeys.emailList({ ...query, page: -1 } as EmailListQuery),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      Object.entries({ ...query, page: pageParam }).forEach(([key, value]) => {
        if (value instanceof Date) {
          params.set(key, value.toISOString());
        } else {
          params.set(key, String(value));
        }
      });
      return fetchJson<EmailListResponse>(`/mail/emails?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 30 * 1000,
  });
}

// ============================================================
// EMAIL DETAIL QUERY
// ============================================================

export function useEmail(emailId: string | null) {
  return useQuery({
    queryKey: mailKeys.email(emailId ?? ""),
    queryFn: () => fetchJson<EmailListItem>(`/mail/emails/${emailId}`),
    enabled: !!emailId,
    staleTime: 60 * 1000,
  });
}

// ============================================================
// EMAIL MUTATIONS
// ============================================================

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails/read", {
        method: "POST",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails/unread", {
        method: "POST",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

export function useStarEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails/star", {
        method: "POST",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
    },
  });
}

export function useUnstarEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails/unstar", {
        method: "POST",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
    },
  });
}

export function useMoveEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: MoveEmailRequest) =>
      fetchJson("/mail/emails/move", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

export function useDeleteEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails", {
        method: "DELETE",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

export function usePermanentlyDeleteEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (emailIds: string[]) =>
      fetchJson("/mail/emails/permanent", {
        method: "DELETE",
        body: JSON.stringify({ emailIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

// ============================================================
// UNREAD COUNTS
// ============================================================

interface UnreadCounts {
  total: number;
  byDomain: Record<string, number>;
  byMailbox: Record<string, number>;
  byFolder: Record<string, number>;
}

export function useUnreadCounts() {
  return useQuery({
    queryKey: mailKeys.unreadCounts(),
    queryFn: () => fetchJson<UnreadCounts>("/mail/unread-counts"),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Poll every minute
  });
}

// ============================================================
// FOLDER OPERATIONS
// ============================================================

export function useFolderTree(domainId?: string) {
  return useQuery({
    queryKey: [...mailKeys.folders(), domainId ?? "all"],
    queryFn: () => {
      const url = domainId ? `/mail/folders?domain=${domainId}` : "/mail/folders";
      return fetchJson<{ folders: MoveDestination[] }>(url);
    },
    select: (data) => data.folders,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; parentId?: string; mailboxId: string }) =>
      fetchJson("/mail/folders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.folders() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.domains() });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      fetchJson(`/mail/folders/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.folders() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.domains() });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) =>
      fetchJson(`/mail/folders/${folderId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.folders() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.domains() });
    },
  });
}
