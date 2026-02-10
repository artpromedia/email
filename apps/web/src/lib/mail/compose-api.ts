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
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
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
 * Pending email for delayed send (undo send feature)
 */
export interface PendingEmail {
  id: string;
  request: SendEmailRequest;
  scheduledAt: Date;
  timeoutId?: NodeJS.Timeout;
}

// In-memory store for pending emails (can be moved to a store if needed)
const pendingEmails = new Map<string, PendingEmail>();

/**
 * Send an email immediately (internal function)
 */
async function sendEmailImmediately(request: SendEmailRequest): Promise<SendEmailResponse> {
  return fetchJson<SendEmailResponse>("/mail/send", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Send an email with optional delay for undo feature
 */
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      request,
      delaySeconds = 0,
    }: {
      request: SendEmailRequest;
      delaySeconds?: number;
    }) => {
      // If no delay, send immediately
      if (delaySeconds === 0) {
        return sendEmailImmediately(request);
      }

      // Return a pending email object
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: false,
        emailId: pendingId,
        messageId: "",
        isPending: true,
        delaySeconds,
      } as SendEmailResponse & { isPending: boolean; delaySeconds: number };
    },
    onSuccess: (data) => {
      // Only invalidate if email was actually sent (not pending)
      if ("isPending" in data && data.isPending) {
        return;
      }

      // Invalidate sent folder and unread counts
      void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
      void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
    },
  });
}

/**
 * Schedule a delayed send with undo capability
 */
export function useScheduleDelayedSend() {
  const queryClient = useQueryClient();

  return {
    /**
     * Schedule an email to be sent after a delay
     */
    scheduleEmail: (
      id: string,
      request: SendEmailRequest,
      delaySeconds: number,
      onComplete: (response: SendEmailResponse) => void,
      onError: (error: Error) => void
    ) => {
      const scheduledAt = new Date(Date.now() + delaySeconds * 1000);

      // Create timeout to send email
      const timeoutId = setTimeout(async () => {
        try {
          const response = await sendEmailImmediately(request);
          pendingEmails.delete(id);
          onComplete(response);

          // Invalidate queries after successful send
          void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
          void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
        } catch (error) {
          pendingEmails.delete(id);
          onError(error instanceof Error ? error : new Error("Failed to send email"));
        }
      }, delaySeconds * 1000);

      // Store pending email
      const pendingEmail: PendingEmail = {
        id,
        request,
        scheduledAt,
        timeoutId,
      };
      pendingEmails.set(id, pendingEmail);

      return id;
    },

    /**
     * Cancel a pending email (undo send)
     */
    cancelEmail: (id: string): boolean => {
      const pending = pendingEmails.get(id);
      if (!pending) return false;

      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pendingEmails.delete(id);
      return true;
    },

    /**
     * Get a pending email by ID
     */
    getPendingEmail: (id: string): PendingEmail | undefined => {
      return pendingEmails.get(id);
    },

    /**
     * Get all pending emails
     */
    getAllPendingEmails: (): PendingEmail[] => {
      return Array.from(pendingEmails.values());
    },

    /**
     * Check if an email is pending
     */
    isPending: (id: string): boolean => {
      return pendingEmails.has(id);
    },
  };
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
