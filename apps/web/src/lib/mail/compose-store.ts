/**
 * Compose Store
 * Zustand store for email composition state management
 */

import { enableMapSet } from "immer";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type {
  SendableAddress,
  EmailRecipient,
  ComposeDraft,
  ComposeAttachment,
  ComposeContext,
  EmailSignature,
  EmailBranding,
} from "./types";

// Immer needs this plugin to handle Map/Set in producers
enableMapSet();

// ============================================================
// STATE INTERFACE
// ============================================================

interface ComposeState {
  // Active compose windows
  drafts: Map<string, ComposeDraft>;
  activeDraftId: string | null;

  // Available addresses (cached from API)
  sendableAddresses: SendableAddress[];
  primaryAddressId: string | null;

  // Current signature (loaded based on from address)
  currentSignature: EmailSignature | null;

  // Current branding (loaded based on domain)
  currentBranding: EmailBranding | null;

  // UI State
  isComposeOpen: boolean;
  isFullScreen: boolean;
  isSending: boolean;
  sendError: string | null;

  // Validation State
  validationErrors: Map<string, string>;
  showValidationErrors: boolean;
}

// ============================================================
// ACTIONS INTERFACE
// ============================================================

interface ComposeActions {
  // Draft Management
  createDraft: (context?: ComposeContext) => string;
  updateDraft: (draftId: string, updates: Partial<ComposeDraft>) => void;
  deleteDraft: (draftId: string) => void;
  setActiveDraft: (draftId: string | null) => void;
  getDraft: (draftId: string) => ComposeDraft | undefined;

  // From Address
  setFromAddress: (draftId: string, address: SendableAddress) => void;
  setSendMode: (draftId: string, mode: "send-as" | "send-on-behalf") => void;

  // Recipients
  addRecipient: (draftId: string, field: "to" | "cc" | "bcc", recipient: EmailRecipient) => void;
  removeRecipient: (draftId: string, field: "to" | "cc" | "bcc", email: string) => void;
  updateRecipient: (
    draftId: string,
    field: "to" | "cc" | "bcc",
    email: string,
    updates: Partial<EmailRecipient>
  ) => void;
  clearRecipients: (draftId: string, field: "to" | "cc" | "bcc") => void;

  // Content
  setSubject: (draftId: string, subject: string) => void;
  setBody: (draftId: string, body: string, bodyHtml?: string) => void;
  setSignature: (signature: EmailSignature | null) => void;
  setBranding: (branding: EmailBranding | null) => void;

  // Attachments
  addAttachment: (draftId: string, attachment: ComposeAttachment) => void;
  updateAttachment: (
    draftId: string,
    attachmentId: string,
    updates: Partial<ComposeAttachment>
  ) => void;
  removeAttachment: (draftId: string, attachmentId: string) => void;

  // Send Options
  setPriority: (draftId: string, priority: "normal" | "high" | "low") => void;
  setRequestReadReceipt: (draftId: string, request: boolean) => void;

  // UI State
  openCompose: (context?: ComposeContext) => string;
  closeCompose: () => void;
  toggleFullScreen: () => void;
  setSending: (isSending: boolean) => void;
  setSendError: (error: string | null) => void;

  // Validation
  setValidationError: (field: string, error: string | null) => void;
  clearValidationErrors: () => void;
  setShowValidationErrors: (show: boolean) => void;
  validateDraft: (draftId: string) => boolean;

  // Cache
  setSendableAddresses: (addresses: SendableAddress[], primaryId: string) => void;
}

// ============================================================
// INITIAL VALUES
// ============================================================

function createEmptyDraft(id: string, fromAddress?: SendableAddress): ComposeDraft {
  return {
    id,
    fromAddressId: fromAddress?.id ?? "",
    fromAddress,
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    body: "",
    bodyHtml: "",
    attachments: [],
    sendMode: fromAddress?.type === "shared" ? "send-as" : "send-as",
    priority: "normal",
    requestReadReceipt: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createReplyDraft(
  id: string,
  context: ComposeContext,
  fromAddress?: SendableAddress
): ComposeDraft {
  const draft = createEmptyDraft(id, fromAddress);
  const original = context.originalEmail;

  if (!original) return draft;

  // Set reply type
  draft.replyType = context.mode as "reply" | "reply-all" | "forward";
  draft.originalEmailId = original.id;

  // Set subject
  const subjectPrefix = context.mode === "forward" ? "Fwd: " : "Re: ";
  const cleanSubject = original.subject.replace(/^(Re:|Fwd:)\s*/gi, "");
  draft.subject = `${subjectPrefix}${cleanSubject}`;

  // Set recipients
  if (context.mode === "reply" || context.mode === "reply-all") {
    // Reply to sender
    draft.to = [
      {
        email: original.from.address,
        name: original.from.name,
        isInternal: false,
        isValid: true,
      },
    ];

    // Reply-all: add other recipients
    if (context.mode === "reply-all") {
      const myEmail = fromAddress?.email.toLowerCase();
      const senderEmail = original.from.address.toLowerCase();

      // Add original To recipients (except self)
      original.to.forEach((recipient) => {
        if (recipient.address.toLowerCase() !== myEmail) {
          draft.to.push({
            email: recipient.address,
            name: recipient.name,
            isInternal: false,
            isValid: true,
          });
        }
      });

      // Add original CC recipients (except self and sender)
      original.cc?.forEach((recipient) => {
        const recipientEmail = recipient.address.toLowerCase();
        if (recipientEmail !== myEmail && recipientEmail !== senderEmail) {
          draft.cc.push({
            email: recipient.address,
            name: recipient.name,
            isInternal: false,
            isValid: true,
          });
        }
      });
    }
  }

  // Set body with quote
  const quotedDate = new Date(original.receivedAt ?? original.createdAt).toLocaleString();
  const quotedHeader = `On ${quotedDate}, ${original.from.name ?? original.from.address} wrote:`;
  draft.body = `\n\n${quotedHeader}\n> ${original.snippet}`;
  draft.bodyHtml = `<br><br><div class="gmail_quote">${quotedHeader}<blockquote>${original.snippet}</blockquote></div>`;

  return draft;
}

// ============================================================
// STORE
// ============================================================

export const useComposeStore = create<ComposeState & ComposeActions>()(
  immer((set, get) => ({
    // Initial State
    drafts: new Map(),
    activeDraftId: null,
    sendableAddresses: [],
    primaryAddressId: null,
    currentSignature: null,
    currentBranding: null,
    isComposeOpen: false,
    isFullScreen: false,
    isSending: false,
    sendError: null,
    validationErrors: new Map(),
    showValidationErrors: false,

    // Draft Management
    createDraft: (context) => {
      const id = nanoid();
      const { sendableAddresses, primaryAddressId } = get();

      // Find the best from address
      let fromAddress: SendableAddress | undefined;

      if (context?.originalEmail && (context.mode === "reply" || context.mode === "reply-all")) {
        // Match address that was in To
        const originalTo = context.originalEmail.to;
        fromAddress = sendableAddresses.find((addr) =>
          originalTo.some((r) => r.address.toLowerCase() === addr.email.toLowerCase())
        );
      }

      if (!fromAddress && context?.currentDomainId) {
        fromAddress = sendableAddresses.find(
          (addr) => addr.domainId === context.currentDomainId && addr.type === "personal"
        );
      }

      if (!fromAddress && primaryAddressId) {
        fromAddress = sendableAddresses.find((addr) => addr.id === primaryAddressId);
      }

      fromAddress ??= sendableAddresses[0];

      const draft =
        context?.mode && context.mode !== "new"
          ? createReplyDraft(id, context, fromAddress)
          : createEmptyDraft(id, fromAddress);

      // Handle prefill
      if (context?.prefillTo) {
        context.prefillTo.forEach((email) => {
          draft.to.push({ email, isInternal: false, isValid: true });
        });
      }
      if (context?.prefillSubject) {
        draft.subject = context.prefillSubject;
      }

      set((state) => {
        state.drafts.set(id, draft);
        state.activeDraftId = id;
      });

      return id;
    },

    updateDraft: (draftId, updates) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          Object.assign(draft, updates, { updatedAt: new Date() });
        }
      });
    },

    deleteDraft: (draftId) => {
      set((state) => {
        state.drafts.delete(draftId);
        if (state.activeDraftId === draftId) {
          state.activeDraftId = null;
        }
      });
    },

    setActiveDraft: (draftId) => {
      set((state) => {
        state.activeDraftId = draftId;
      });
    },

    getDraft: (draftId) => {
      return get().drafts.get(draftId);
    },

    // From Address
    setFromAddress: (draftId, address) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.fromAddressId = address.id;
          draft.fromAddress = address;
          draft.sendMode = address.type === "shared" ? "send-as" : "send-as";
          draft.updatedAt = new Date();
        }
      });
    },

    setSendMode: (draftId, mode) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.sendMode = mode;
          draft.updatedAt = new Date();
        }
      });
    },

    // Recipients
    addRecipient: (draftId, field, recipient) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          // Avoid duplicates
          const exists = draft[field].some(
            (r) => r.email.toLowerCase() === recipient.email.toLowerCase()
          );
          if (!exists) {
            draft[field].push(recipient);
            draft.updatedAt = new Date();
          }
        }
      });
    },

    removeRecipient: (draftId, field, email) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          const index = draft[field].findIndex(
            (r) => r.email.toLowerCase() === email.toLowerCase()
          );
          if (index !== -1) {
            draft[field].splice(index, 1);
            draft.updatedAt = new Date();
          }
        }
      });
    },

    updateRecipient: (draftId, field, email, updates) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          const recipient = draft[field].find((r) => r.email.toLowerCase() === email.toLowerCase());
          if (recipient) {
            Object.assign(recipient, updates);
            draft.updatedAt = new Date();
          }
        }
      });
    },

    clearRecipients: (draftId, field) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft[field] = [];
          draft.updatedAt = new Date();
        }
      });
    },

    // Content
    setSubject: (draftId, subject) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.subject = subject;
          draft.updatedAt = new Date();
        }
      });
    },

    setBody: (draftId, body, bodyHtml) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.body = body;
          if (bodyHtml !== undefined) {
            draft.bodyHtml = bodyHtml;
          }
          draft.updatedAt = new Date();
        }
      });
    },

    setSignature: (signature) => {
      set((state) => {
        state.currentSignature = signature;
      });
    },

    setBranding: (branding) => {
      set((state) => {
        state.currentBranding = branding;
      });
    },

    // Attachments
    addAttachment: (draftId, attachment) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.attachments.push(attachment);
          draft.updatedAt = new Date();
        }
      });
    },

    updateAttachment: (draftId, attachmentId, updates) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          const attachment = draft.attachments.find((a) => a.id === attachmentId);
          if (attachment) {
            Object.assign(attachment, updates);
            draft.updatedAt = new Date();
          }
        }
      });
    },

    removeAttachment: (draftId, attachmentId) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          const index = draft.attachments.findIndex((a) => a.id === attachmentId);
          if (index !== -1) {
            draft.attachments.splice(index, 1);
            draft.updatedAt = new Date();
          }
        }
      });
    },

    // Send Options
    setPriority: (draftId, priority) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.priority = priority;
          draft.updatedAt = new Date();
        }
      });
    },

    setRequestReadReceipt: (draftId, request) => {
      set((state) => {
        const draft = state.drafts.get(draftId);
        if (draft) {
          draft.requestReadReceipt = request;
          draft.updatedAt = new Date();
        }
      });
    },

    // UI State
    openCompose: (context) => {
      const draftId = get().createDraft(context);
      set((state) => {
        state.isComposeOpen = true;
        state.sendError = null;
        state.validationErrors.clear();
        state.showValidationErrors = false;
      });
      return draftId;
    },

    closeCompose: () => {
      set((state) => {
        state.isComposeOpen = false;
        state.activeDraftId = null;
      });
    },

    toggleFullScreen: () => {
      set((state) => {
        state.isFullScreen = !state.isFullScreen;
      });
    },

    setSending: (isSending) => {
      set((state) => {
        state.isSending = isSending;
      });
    },

    setSendError: (error) => {
      set((state) => {
        state.sendError = error;
      });
    },

    // Validation
    setValidationError: (field, error) => {
      set((state) => {
        if (error) {
          state.validationErrors.set(field, error);
        } else {
          state.validationErrors.delete(field);
        }
      });
    },

    clearValidationErrors: () => {
      set((state) => {
        state.validationErrors.clear();
        state.showValidationErrors = false;
      });
    },

    setShowValidationErrors: (show) => {
      set((state) => {
        state.showValidationErrors = show;
      });
    },

    validateDraft: (draftId) => {
      const draft = get().getDraft(draftId);
      if (!draft) return false;

      const errors = new Map<string, string>();

      // Validate from address
      if (!draft.fromAddressId) {
        errors.set("from", "Please select a From address");
      }

      // Validate recipients
      if (draft.to.length === 0) {
        errors.set("to", "Please add at least one recipient");
      }

      // Validate recipient emails
      const invalidRecipients = [...draft.to, ...draft.cc, ...draft.bcc].filter((r) => !r.isValid);
      if (invalidRecipients.length > 0) {
        errors.set("recipients", `Invalid email address: ${invalidRecipients[0]?.email}`);
      }

      // Validate subject (warning only)
      if (!draft.subject.trim()) {
        errors.set("subject", "No subject - send anyway?");
      }

      set((state) => {
        state.validationErrors = errors;
        state.showValidationErrors = errors.size > 0;
      });

      // Return true if only warning (subject), false if real errors
      return errors.size === 0 || (errors.size === 1 && errors.has("subject"));
    },

    // Cache
    setSendableAddresses: (addresses, primaryId) => {
      set((state) => {
        state.sendableAddresses = addresses;
        state.primaryAddressId = primaryId;
      });
    },
  }))
);

// ============================================================
// SELECTORS
// ============================================================

export const selectActiveDraft = (state: ComposeState) => {
  if (!state.activeDraftId) return null;
  return state.drafts.get(state.activeDraftId) ?? null;
};

export const selectDraftCount = (state: ComposeState) => state.drafts.size;

export const selectPersonalAddresses = (state: ComposeState) =>
  state.sendableAddresses.filter((a) => a.type === "personal" || a.type === "alias");

export const selectSharedAddresses = (state: ComposeState) =>
  state.sendableAddresses.filter((a) => a.type === "shared");

export const selectAddressesByDomain = (state: ComposeState) => {
  const byDomain = new Map<string, SendableAddress[]>();

  state.sendableAddresses.forEach((addr) => {
    const existing = byDomain.get(addr.domainId) ?? [];
    existing.push(addr);
    byDomain.set(addr.domainId, existing);
  });

  return byDomain;
};
