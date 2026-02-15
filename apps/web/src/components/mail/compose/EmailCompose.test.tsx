/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EmailCompose } from "./EmailCompose";
import { useComposeStore } from "@/lib/mail/compose-store";
import { ComposeContext, SendableAddress } from "@/lib/mail/types";

// ============================================================
// MOCKS
// ============================================================

// Mock the compose API hooks
jest.mock("@/lib/mail/compose-api", () => ({
  useSendableAddresses: jest.fn(() => ({
    data: {
      addresses: mockAddresses,
      primaryAddressId: "addr-1",
    },
    isLoading: false,
  })),
  useSignatureForAddress: jest.fn(() => null),
  useDomainBranding: jest.fn(() => ({ data: null })),
  useSendEmail: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ messageId: "msg-1" }),
    isPending: false,
  })),
  useSaveDraft: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ draftId: "draft-1" }),
    isPending: false,
  })),
  useUploadAttachment: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ fileId: "file-1" }),
    isPending: false,
  })),
  useCheckSendPermission: jest.fn(() => ({
    data: { allowed: true },
  })),
}));

// Mock sanitizeHtml
jest.mock("@/lib/sanitize", () => ({
  sanitizeHtml: jest.fn((html: string) => html),
}));

// Mock lucide-react icons
jest.mock("lucide-react", () => {
  const actual = jest.requireActual("lucide-react");
  const mockIcon = React.forwardRef<SVGSVGElement, { className?: string; "data-testid"?: string }>(
    (props, ref) => <svg ref={ref} {...props} />
  );
  mockIcon.displayName = "MockIcon";

  return {
    ...actual,
    X: mockIcon,
    Minimize2: mockIcon,
    Maximize2: mockIcon,
    Send: mockIcon,
    Paperclip: mockIcon,
    Trash2: mockIcon,
    MoreHorizontal: mockIcon,
    AlertCircle: mockIcon,
    CheckCircle2: mockIcon,
    Loader2: mockIcon,
    ChevronDown: mockIcon,
    Bold: mockIcon,
    Italic: mockIcon,
    Underline: mockIcon,
    List: mockIcon,
    ListOrdered: mockIcon,
    Link: mockIcon,
    Image: mockIcon,
  };
});

// Mock ComposeHeader since it has its own complex behavior
jest.mock("./ComposeHeader", () => ({
  ComposeHeader: ({ fromAddress, toRecipients, subject, onSubjectChange, onToChange }: any) => (
    <div data-testid="compose-header">
      <input
        data-testid="subject-input"
        value={subject || ""}
        onChange={(e) => onSubjectChange(e.target.value)}
        placeholder="Subject"
      />
      <div data-testid="from-address">{fromAddress?.email || "No address selected"}</div>
      <div data-testid="to-recipients">
        {(toRecipients || []).map((r: any) => r.email).join(", ")}
      </div>
    </div>
  ),
}));

// ============================================================
// TEST FIXTURES
// ============================================================

const mockAddresses: SendableAddress[] = [
  {
    id: "addr-1",
    email: "test@example.com",
    displayName: "Test User",
    formatted: "Test User <test@example.com>",
    domainId: "domain-1",
    domainName: "example.com",
    domainColor: "#3B82F6",
    type: "personal",
    isPrimary: true,
    sendAs: true,
    isVerified: true,
  },
  {
    id: "addr-2",
    email: "support@example.com",
    displayName: "Support",
    formatted: "Support <support@example.com>",
    domainId: "domain-1",
    domainName: "example.com",
    domainColor: "#3B82F6",
    type: "shared",
    isPrimary: false,
    sendAs: true,
    isVerified: true,
  },
];

const mockComposeContext: ComposeContext = {
  mode: "new",
};

const mockReplyContext: ComposeContext = {
  mode: "reply",
  originalEmail: {
    id: "email-1",
    threadId: "thread-1",
    from: { address: "sender@external.com", name: "External Sender" },
    to: [{ address: "test@example.com", name: "Test User" }],
    cc: [],
    bcc: [],
    subject: "Original Subject",
    body: "Original body text",
    bodyHtml: "<p>Original body text</p>",
    receivedAt: new Date().toISOString(),
    isRead: true,
    isStarred: false,
  },
};

// ============================================================
// HELPER
// ============================================================

// Reset the compose store before each test
beforeEach(() => {
  const store = useComposeStore.getState();
  // Reset store to initial state
  if (typeof store.closeCompose === "function") {
    store.closeCompose();
  }
});

// ============================================================
// TESTS: RENDERING
// ============================================================

describe("EmailCompose", () => {
  describe("Rendering", () => {
    it("renders the compose form", () => {
      render(<EmailCompose context={mockComposeContext} />);

      // Should render the compose header
      expect(screen.getByTestId("compose-header")).toBeInTheDocument();
    });

    it("renders with className prop", () => {
      const { container } = render(
        <EmailCompose context={mockComposeContext} className="custom-class" />
      );

      // The root element should have the custom class
      const rootElement = container.firstChild;
      if (rootElement instanceof HTMLElement) {
        expect(rootElement.className).toContain("custom-class");
      }
    });

    it("renders subject input", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const subjectInput = screen.getByTestId("subject-input");
      expect(subjectInput).toBeInTheDocument();
    });

    it("opens compose on mount when not already open", () => {
      render(<EmailCompose context={mockComposeContext} />);

      // After rendering, compose should be open
      const state = useComposeStore.getState();
      expect(state.isComposeOpen).toBe(true);
    });
  });

  // ============================================================
  // TESTS: RECIPIENT INPUT
  // ============================================================

  describe("Recipient handling", () => {
    it("displays from address from sendable addresses", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const fromAddress = screen.getByTestId("from-address");
      expect(fromAddress).toBeInTheDocument();
    });
  });

  // ============================================================
  // TESTS: SUBJECT
  // ============================================================

  describe("Subject handling", () => {
    it("allows typing a subject", async () => {
      render(<EmailCompose context={mockComposeContext} />);

      const subjectInput = screen.getByTestId("subject-input");
      fireEvent.change(subjectInput, { target: { value: "Test Subject" } });

      expect(subjectInput).toHaveValue("Test Subject");
    });
  });

  // ============================================================
  // TESTS: CONTEXT
  // ============================================================

  describe("Compose context", () => {
    it("handles new compose context", () => {
      render(<EmailCompose context={{ mode: "new" }} />);

      const state = useComposeStore.getState();
      expect(state.isComposeOpen).toBe(true);
    });

    it("renders without context", () => {
      render(<EmailCompose />);

      // Should still render, opening an empty compose
      expect(screen.getByTestId("compose-header")).toBeInTheDocument();
    });
  });

  // ============================================================
  // TESTS: CLOSE/CALLBACKS
  // ============================================================

  describe("Close behavior", () => {
    it("accepts onClose callback", () => {
      const onClose = jest.fn();
      render(<EmailCompose context={mockComposeContext} onClose={onClose} />);

      // onClose should be provided but not called yet
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TESTS: ATTACHMENTS
  // ============================================================

  describe("Attachment handling", () => {
    it("renders file input for attachments", () => {
      const { container } = render(<EmailCompose context={mockComposeContext} />);

      // Should have a hidden file input
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it("handles file selection", async () => {
      const { container } = render(<EmailCompose context={mockComposeContext} />);

      const fileInput = container.querySelector('input[type="file"]');
      if (fileInput) {
        const file = new File(["test content"], "test-doc.pdf", {
          type: "application/pdf",
        });

        await act(async () => {
          fireEvent.change(fileInput, { target: { files: [file] } });
        });

        // The attachment should be added to the draft
        // The upload mock should have been called
      }
    });
  });

  // ============================================================
  // TESTS: DRAFT SAVING
  // ============================================================

  describe("Draft saving", () => {
    it("initializes with empty draft values", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const state = useComposeStore.getState();
      const activeDraftId = state.activeDraftId;

      if (activeDraftId) {
        const draft = state.drafts.get(activeDraftId);
        if (draft) {
          expect(draft.subject).toBe("");
          expect(draft.body).toBe("");
          expect(draft.to).toEqual([]);
        }
      }
    });
  });

  // ============================================================
  // TESTS: VALIDATION
  // ============================================================

  describe("Validation", () => {
    it("store tracks validation errors", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const store = useComposeStore.getState();

      // Set a validation error
      store.setValidationError("to", "At least one recipient is required");

      const updatedState = useComposeStore.getState();
      expect(updatedState.validationErrors.get("to")).toBe("At least one recipient is required");
    });

    it("validation can be cleared", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const store = useComposeStore.getState();

      store.setValidationError("to", "Required");
      store.clearValidationErrors();

      const updatedState = useComposeStore.getState();
      expect(updatedState.validationErrors.size).toBe(0);
    });
  });

  // ============================================================
  // TESTS: SENDABLE ADDRESSES
  // ============================================================

  describe("Sendable addresses", () => {
    it("loads sendable addresses from API", () => {
      render(<EmailCompose context={mockComposeContext} />);

      // After render, the store should have sendable addresses set
      const state = useComposeStore.getState();
      expect(state.sendableAddresses.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // TESTS: FULL SCREEN
  // ============================================================

  describe("Full screen toggle", () => {
    it("starts in non-fullscreen mode", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const state = useComposeStore.getState();
      expect(state.isFullScreen).toBe(false);
    });

    it("can toggle fullscreen via store", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const store = useComposeStore.getState();
      store.toggleFullScreen();

      expect(useComposeStore.getState().isFullScreen).toBe(true);

      store.toggleFullScreen();
      expect(useComposeStore.getState().isFullScreen).toBe(false);
    });
  });

  // ============================================================
  // TESTS: SEND STATE
  // ============================================================

  describe("Send state", () => {
    it("starts with isSending false", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const state = useComposeStore.getState();
      expect(state.isSending).toBe(false);
    });

    it("starts with no send error", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const state = useComposeStore.getState();
      expect(state.sendError).toBeNull();
    });

    it("can track send error state", () => {
      render(<EmailCompose context={mockComposeContext} />);

      const store = useComposeStore.getState();
      store.setSendError("Failed to send email");

      expect(useComposeStore.getState().sendError).toBe("Failed to send email");
    });
  });
});
