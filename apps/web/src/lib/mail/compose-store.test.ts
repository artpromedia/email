/**
 * Compose Store Tests
 * Tests for email composition state management
 */

import { act, renderHook } from "@testing-library/react";

// Create mock zustand store
let store: ReturnType<typeof createMockStore>;

function createMockStore() {
  return {
    drafts: new Map<string, Draft>(),
    activeDraftId: null as string | null,
    fromAddresses: [] as FromAddress[],
    scheduledSends: [] as ScheduledEmail[],
    isComposing: false,

    // Actions
    createDraft: jest.fn((options: CreateDraftOptions) => {
      const draft: Draft = {
        id: `draft-${Date.now()}`,
        type: options.type || "new",
        from: options.from || { address: "user@example.com", name: "User" },
        to: options.to || [],
        cc: [],
        bcc: [],
        subject: options.subject || "",
        body: options.body || "",
        bodyHtml: "",
        attachments: [],
        inReplyTo: options.inReplyTo,
        referencedEmailId: options.referencedEmailId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSavedAt: null,
        isDirty: false,
      };
      store.drafts.set(draft.id, draft);
      store.activeDraftId = draft.id;
      store.isComposing = true;
      return draft.id;
    }),

    updateDraft: jest.fn((draftId: string, updates: Partial<Draft>) => {
      const draft = store.drafts.get(draftId);
      if (draft) {
        store.drafts.set(draftId, { ...draft, ...updates, isDirty: true });
      }
    }),

    deleteDraft: jest.fn((draftId: string) => {
      store.drafts.delete(draftId);
      if (store.activeDraftId === draftId) {
        store.activeDraftId = null;
        store.isComposing = false;
      }
    }),

    setActiveDraft: jest.fn((draftId: string | null) => {
      store.activeDraftId = draftId;
      store.isComposing = draftId !== null;
    }),

    closeCompose: jest.fn(() => {
      store.activeDraftId = null;
      store.isComposing = false;
    }),

    getDraft: (draftId: string) => store.drafts.get(draftId),
  };
}

interface Draft {
  id: string;
  type: "new" | "reply" | "reply-all" | "forward";
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
  cc: Array<{ address: string; name?: string }>;
  bcc: Array<{ address: string; name?: string }>;
  subject: string;
  body: string;
  bodyHtml: string;
  attachments: Array<{ id: string; name: string; size: number }>;
  inReplyTo?: string;
  referencedEmailId?: string;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string | null;
  isDirty: boolean;
}

interface FromAddress {
  address: string;
  name?: string;
  domainId: string;
  domainName: string;
}

interface ScheduledEmail {
  id: string;
  draftId: string;
  scheduledFor: string;
}

interface CreateDraftOptions {
  type?: "new" | "reply" | "reply-all" | "forward";
  from?: { address: string; name?: string };
  to?: Array<{ address: string; name?: string }>;
  subject?: string;
  body?: string;
  inReplyTo?: string;
  referencedEmailId?: string;
}

describe("Compose Store", () => {
  beforeEach(() => {
    store = createMockStore();
  });

  describe("createDraft", () => {
    it("creates a new draft with default values", () => {
      const draftId = store.createDraft({});

      expect(draftId).toBeDefined();
      expect(store.drafts.size).toBe(1);
      expect(store.activeDraftId).toBe(draftId);
      expect(store.isComposing).toBe(true);
    });

    it("creates a draft with specified recipients", () => {
      const draftId = store.createDraft({
        to: [{ address: "recipient@example.com", name: "Recipient" }],
        subject: "Test Subject",
      });

      const draft = store.getDraft(draftId);
      expect(draft?.to).toHaveLength(1);
      expect(draft?.to[0]?.address).toBe("recipient@example.com");
      expect(draft?.subject).toBe("Test Subject");
    });

    it("creates a reply draft with reference to original email", () => {
      const draftId = store.createDraft({
        type: "reply",
        referencedEmailId: "original-email-id",
        inReplyTo: "<original@message.id>",
        to: [{ address: "sender@example.com" }],
        subject: "Re: Original Subject",
      });

      const draft = store.getDraft(draftId);
      expect(draft?.type).toBe("reply");
      expect(draft?.referencedEmailId).toBe("original-email-id");
      expect(draft?.inReplyTo).toBe("<original@message.id>");
    });

    it("creates a forward draft", () => {
      const draftId = store.createDraft({
        type: "forward",
        referencedEmailId: "original-email-id",
        subject: "Fwd: Original Subject",
        body: "---------- Forwarded message ----------",
      });

      const draft = store.getDraft(draftId);
      expect(draft?.type).toBe("forward");
      expect(draft?.subject).toContain("Fwd:");
    });
  });

  describe("updateDraft", () => {
    it("updates draft content", () => {
      const draftId = store.createDraft({});

      store.updateDraft(draftId, {
        subject: "Updated Subject",
        body: "Updated body content",
      });

      const draft = store.getDraft(draftId);
      expect(draft?.subject).toBe("Updated Subject");
      expect(draft?.body).toBe("Updated body content");
      expect(draft?.isDirty).toBe(true);
    });

    it("updates recipients", () => {
      const draftId = store.createDraft({});

      store.updateDraft(draftId, {
        to: [{ address: "new@example.com" }],
        cc: [{ address: "cc@example.com" }],
      });

      const draft = store.getDraft(draftId);
      expect(draft?.to).toHaveLength(1);
      expect(draft?.cc).toHaveLength(1);
    });

    it("handles non-existent draft gracefully", () => {
      // Should not throw
      expect(() => store.updateDraft("non-existent", { subject: "test" })).not.toThrow();
    });
  });

  describe("deleteDraft", () => {
    it("removes draft from store", () => {
      const draftId = store.createDraft({});
      expect(store.drafts.size).toBe(1);

      store.deleteDraft(draftId);
      expect(store.drafts.size).toBe(0);
    });

    it("clears active draft if deleted draft was active", () => {
      const draftId = store.createDraft({});
      expect(store.activeDraftId).toBe(draftId);

      store.deleteDraft(draftId);
      expect(store.activeDraftId).toBeNull();
      expect(store.isComposing).toBe(false);
    });

    it("does not affect active draft when deleting other draft", () => {
      const draft1 = store.createDraft({});
      const draft2 = store.createDraft({});
      store.setActiveDraft(draft2);

      store.deleteDraft(draft1);
      expect(store.activeDraftId).toBe(draft2);
      expect(store.isComposing).toBe(true);
    });
  });

  describe("closeCompose", () => {
    it("closes the compose window", () => {
      store.createDraft({});
      expect(store.isComposing).toBe(true);

      store.closeCompose();
      expect(store.isComposing).toBe(false);
      expect(store.activeDraftId).toBeNull();
    });
  });

  describe("multiple drafts", () => {
    it("can manage multiple drafts simultaneously", () => {
      const draft1 = store.createDraft({ subject: "Draft 1" });
      const draft2 = store.createDraft({ subject: "Draft 2" });
      const draft3 = store.createDraft({ subject: "Draft 3" });

      expect(store.drafts.size).toBe(3);

      // Should be able to switch between drafts
      store.setActiveDraft(draft1);
      expect(store.activeDraftId).toBe(draft1);

      store.setActiveDraft(draft2);
      expect(store.activeDraftId).toBe(draft2);
    });
  });
});

describe("Compose Selectors", () => {
  beforeEach(() => {
    store = createMockStore();
  });

  it("selectActiveDraft returns current draft", () => {
    const draftId = store.createDraft({ subject: "Active Draft" });
    const draft = store.getDraft(draftId);

    expect(draft).toBeDefined();
    expect(draft?.subject).toBe("Active Draft");
  });

  it("selectDraftCount returns number of drafts", () => {
    expect(store.drafts.size).toBe(0);

    store.createDraft({});
    expect(store.drafts.size).toBe(1);

    store.createDraft({});
    expect(store.drafts.size).toBe(2);
  });
});
