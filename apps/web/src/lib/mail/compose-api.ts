/**
 * Compose API Hooks
 * React Query hooks for email composition operations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mailKeys } from "./api";
import type {
  SendableAddress,
  EmailSignature,
  EmailBranding,
  SendPermissionResult,
  SendEmailRequest,
  RecipientHint,
  ComposeContext,
} from "./types";

// ============================================================
// API CLIENT
// ============================================================

const API_BASE = "/api/v1";

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

export const composeKeys = {
  all: ["compose"] as const,
  addresses: () => [...composeKeys.all, "addresses"] as const,
  signatures: () => [...composeKeys.all, "signatures"] as const,
  signature: (addressId: string) => [...composeKeys.signatures(), addressId] as const,
  branding: (domainId: string) => [...composeKeys.all, "branding", domainId] as const,
  recipientHints: (query: string) => [...composeKeys.all, "hints", query] as const,
  permission: (addressId: string) => [...composeKeys.all, "permission", addressId] as const,
};

// ============================================================
// SENDABLE ADDRESSES
// ============================================================

interface SendableAddressesResponse {
  addresses: SendableAddress[];
  primaryAddressId: string;
}

/**
 * Get all addresses the user can send from
 */
export function useSendableAddresses() {
  return useQuery({
    queryKey: composeKeys.addresses(),
    queryFn: () => fetchJson<SendableAddressesResponse>("/mail/compose/addresses"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get the best default "From" address based on context
 */
export function useDefaultFromAddress(context?: ComposeContext) {
  const { data: addressData } = useSendableAddresses();

  if (!addressData) return null;

  const { addresses, primaryAddressId } = addressData;

  // 1. If replying, use address the original was sent TO
  if (context?.originalEmail && (context.mode === "reply" || context.mode === "reply-all")) {
    const originalTo = context.originalEmail.to;
    const matchingAddress = addresses.find((addr) =>
      originalTo.some((recipient) => recipient.address.toLowerCase() === addr.email.toLowerCase())
    );
    if (matchingAddress) return matchingAddress;
  }

  // 2. If context is specific domain, use that domain's address
  if (context?.currentDomainId) {
    const domainAddress = addresses.find(
      (addr) => addr.domainId === context.currentDomainId && addr.type === "personal"
    );
    if (domainAddress) return domainAddress;
  }

  // 3. If context is specific mailbox, use that mailbox's address
  if (context?.currentMailboxId) {
    const mailboxAddress = addresses.find((addr) => addr.id === context.currentMailboxId);
    if (mailboxAddress) return mailboxAddress;
  }

  // 4. Otherwise, user's primary address
  const primaryAddress = addresses.find((addr) => addr.id === primaryAddressId);
  if (primaryAddress) return primaryAddress;

  // 5. Fallback to first personal address
  return addresses.find((addr) => addr.type === "personal") ?? addresses[0];
}

// ============================================================
// SIGNATURES
// ============================================================

interface SignaturesResponse {
  signatures: EmailSignature[];
}

/**
 * Get all user signatures
 */
export function useSignatures() {
  return useQuery({
    queryKey: composeKeys.signatures(),
    queryFn: () => fetchJson<SignaturesResponse>("/mail/compose/signatures"),
    select: (data) => data.signatures,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get the appropriate signature for an address
 * Follows hierarchy: address-specific → domain default → global default
 */
export function useSignatureForAddress(addressId: string | null, domainId: string | null) {
  const { data: signatures } = useSignatures();

  if (!signatures || !addressId) return null;

  // 1. Address-specific signature
  const addressSignature = signatures.find(
    (sig) => sig.level === "address" && sig.addressId === addressId && sig.isDefault
  );
  if (addressSignature) return addressSignature;

  // 2. Domain default signature
  if (domainId) {
    const domainSignature = signatures.find(
      (sig) => sig.level === "domain" && sig.domainId === domainId && sig.isDefault
    );
    if (domainSignature) return domainSignature;
  }

  // 3. Global default signature
  const globalSignature = signatures.find((sig) => sig.level === "global" && sig.isDefault);
  return globalSignature ?? null;
}

// ============================================================
// DOMAIN BRANDING
// ============================================================

/**
 * Get domain email branding
 */
export function useDomainBranding(domainId: string | null) {
  return useQuery({
    queryKey: composeKeys.branding(domainId ?? ""),
    queryFn: () => fetchJson<EmailBranding>(`/mail/compose/branding/${domainId}`),
    enabled: !!domainId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// ============================================================
// SEND PERMISSION VALIDATION
// ============================================================

/**
 * Validate permission to send from an address
 */
export function useValidateSendPermission(addressId: string | null) {
  return useQuery({
    queryKey: composeKeys.permission(addressId ?? ""),
    queryFn: () => fetchJson<SendPermissionResult>(`/mail/compose/validate/${addressId}`),
    enabled: !!addressId,
    staleTime: 60 * 1000, // 1 minute - check frequently before send
  });
}

/**
 * Mutation to validate send permission (imperative check before sending)
 */
export function useCheckSendPermission() {
  return useMutation({
    mutationFn: (addressId: string) =>
      fetchJson<SendPermissionResult>(`/mail/compose/validate/${addressId}`),
  });
}

// ============================================================
// RECIPIENT HINTS
// ============================================================

interface RecipientHintsResponse {
  hints: RecipientHint[];
  contacts: {
    email: string;
    name?: string;
    isInternal: boolean;
    domainId?: string;
  }[];
}

/**
 * Get recipient hints and suggestions
 */
export function useRecipientHints(query: string, fromDomainId?: string) {
  return useQuery({
    queryKey: composeKeys.recipientHints(query),
    queryFn: () => {
      const params = new URLSearchParams({ q: query });
      if (fromDomainId) params.set("fromDomain", fromDomainId);
      return fetchJson<RecipientHintsResponse>(`/mail/compose/recipients?${params}`);
    },
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
}

/**
 * Check if a recipient is internal (same organization)
 */
export function useCheckRecipientInternal() {
  return useMutation({
    mutationFn: (email: string) =>
      fetchJson<RecipientHint>(`/mail/compose/check-recipient`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  });
}

// ============================================================
// SEND EMAIL
// ============================================================

interface SendEmailResponse {
  success: boolean;
  emailId: string;
  messageId: string;
}

/**
 * Send an email
 */
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SendEmailRequest) =>
      fetchJson<SendEmailResponse>("/mail/send", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      // Invalidate sent folder and unread counts
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

// ============================================================
// DRAFT OPERATIONS
// ============================================================

interface SaveDraftRequest {
  id?: string;
  fromAddressId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  attachmentIds?: string[];
  inReplyTo?: string;
}

interface SaveDraftResponse {
  draftId: string;
  savedAt: string;
}

/**
 * Save a draft
 */
export function useSaveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SaveDraftRequest) =>
      fetchJson<SaveDraftResponse>("/mail/drafts", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
    },
  });
}

/**
 * Delete a draft
 */
export function useDeleteDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) => fetchJson(`/mail/drafts/${draftId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
    },
  });
}

// ============================================================
// ATTACHMENT UPLOAD
// ============================================================

interface UploadAttachmentResponse {
  fileId: string;
  name: string;
  size: number;
  type: string;
}

/**
 * Upload an attachment
 */
export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/mail/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: "Upload failed" }))) as {
          message?: string;
        };
        throw new Error(error.message ?? "Upload failed");
      }

      return response.json() as Promise<UploadAttachmentResponse>;
    },
  });
}
