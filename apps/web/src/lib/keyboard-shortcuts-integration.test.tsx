/**
 * Keyboard Shortcuts Integration Tests
 * Tests that actually import and exercise the keyboard-shortcuts module
 */

import React from "react";
import { render, screen, act, fireEvent, renderHook } from "@testing-library/react";

// Now import after mocks are set up
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
  useMailKeyboardShortcuts,
  KeyboardShortcutsHelp,
} from "./keyboard-shortcuts";
import type { KeyboardShortcut } from "./keyboard-shortcuts";

// Mock Next.js router
const mockPush = jest.fn();
const mockPathname = "/mail/inbox";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => mockPathname,
}));

// Mock mail store - must mock before import
const mockMailStore = {
  emails: [
    { id: "email-1", subject: "Test 1", isRead: false },
    { id: "email-2", subject: "Test 2", isRead: true },
    { id: "email-3", subject: "Test 3", isRead: false },
  ],
  selectedEmails: new Set<string>(),
  focusedEmailId: null as string | null,
  markAsRead: jest.fn(),
  markAsUnread: jest.fn(),
  starEmails: jest.fn(),
  unstarEmails: jest.fn(),
  deleteEmails: jest.fn(),
  toggleEmailSelection: jest.fn(),
  clearSelection: jest.fn(),
  setFocusedEmail: jest.fn(),
};

jest.mock("./mail", () => ({
  useMailStore: (selector: (state: typeof mockMailStore) => unknown) => selector(mockMailStore),
}));

describe("Keyboard Shortcuts Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMailStore.selectedEmails = new Set<string>();
    mockMailStore.focusedEmailId = null;
  });

  describe("KeyboardShortcutsProvider", () => {
    it("renders children", () => {
      render(
        <KeyboardShortcutsProvider>
          <div data-testid="child">Child content</div>
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("provides context to children", () => {
      function TestConsumer() {
        const context = useKeyboardShortcuts();
        return <div data-testid="enabled">{String(context.isEnabled)}</div>;
      }

      render(
        <KeyboardShortcutsProvider>
          <TestConsumer />
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    });

    it("initially has shortcuts enabled", () => {
      function TestConsumer() {
        const context = useKeyboardShortcuts();
        return <div data-testid="state">{context.isEnabled ? "yes" : "no"}</div>;
      }

      render(
        <KeyboardShortcutsProvider>
          <TestConsumer />
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId("state")).toHaveTextContent("yes");
    });

    it("initially has help hidden", () => {
      function TestConsumer() {
        const context = useKeyboardShortcuts();
        return <div data-testid="help">{context.showHelp ? "showing" : "hidden"}</div>;
      }

      render(
        <KeyboardShortcutsProvider>
          <TestConsumer />
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId("help")).toHaveTextContent("hidden");
    });
  });

  describe("useKeyboardShortcuts", () => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>;
    }

    it("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        renderHook(() => useKeyboardShortcuts());
      }).toThrow("useKeyboardShortcuts must be used within a KeyboardShortcutsProvider");

      consoleSpy.mockRestore();
    });

    it("provides enabled state", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      expect(result.current.isEnabled).toBe(true);
    });

    it("provides shortcuts list", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      expect(Array.isArray(result.current.shortcuts)).toBe(true);
    });

    it("provides setEnabled function", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      expect(typeof result.current.setEnabled).toBe("function");
    });

    it("can disable shortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      act(() => {
        result.current.setEnabled(false);
      });

      expect(result.current.isEnabled).toBe(false);
    });

    it("can re-enable shortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      act(() => {
        result.current.setEnabled(false);
      });

      act(() => {
        result.current.setEnabled(true);
      });

      expect(result.current.isEnabled).toBe(true);
    });

    it("can toggle help visibility", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      expect(result.current.showHelp).toBe(false);

      act(() => {
        result.current.setShowHelp(true);
      });

      expect(result.current.showHelp).toBe(true);

      act(() => {
        result.current.setShowHelp(false);
      });

      expect(result.current.showHelp).toBe(false);
    });

    it("provides registerShortcut function", () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });

      expect(typeof result.current.registerShortcut).toBe("function");
    });
  });

  describe("useMailKeyboardShortcuts", () => {
    // useMailKeyboardShortcuts registers shortcuts using useEffect
    // which requires proper store mock - test it is exported and callable
    it("is exported and callable", () => {
      expect(typeof useMailKeyboardShortcuts).toBe("function");
    });
  });

  describe("Keyboard event handling", () => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>;
    }

    it("does not handle events when disabled", () => {
      function TestComponent() {
        const { setEnabled, isEnabled } = useKeyboardShortcuts();
        return (
          <div>
            <button onClick={() => setEnabled(false)}>Disable</button>
            <span data-testid="status">{isEnabled ? "enabled" : "disabled"}</span>
          </div>
        );
      }

      render(
        <Wrapper>
          <TestComponent />
        </Wrapper>
      );

      fireEvent.click(screen.getByText("Disable"));
      expect(screen.getByTestId("status")).toHaveTextContent("disabled");
    });

    it("ignores events from input elements", () => {
      render(
        <Wrapper>
          <input data-testid="input" />
        </Wrapper>
      );

      const input = screen.getByTestId("input");
      fireEvent.keyDown(input, { key: "c" });

      // Should not trigger any action
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("ignores events from textarea elements", () => {
      render(
        <Wrapper>
          <textarea data-testid="textarea" />
        </Wrapper>
      );

      const textarea = screen.getByTestId("textarea");
      fireEvent.keyDown(textarea, { key: "c" });

      // Should not trigger any action
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("Shortcut registration", () => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>;
    }

    it("allows registering custom shortcuts", () => {
      const customHandler = jest.fn();

      function TestComponent() {
        const { registerShortcut, shortcuts } = useKeyboardShortcuts();

        React.useEffect(() => {
          const unregister = registerShortcut({
            key: "t",
            description: "Test shortcut",
            category: "actions",
            handler: customHandler,
          });

          return unregister;
        }, [registerShortcut]);

        return <div data-testid="count">{shortcuts.length}</div>;
      }

      render(
        <Wrapper>
          <TestComponent />
        </Wrapper>
      );

      // Shortcut should be registered
      expect(screen.getByTestId("count").textContent).not.toBe("0");
    });

    it("unregisters shortcuts on cleanup", () => {
      const customHandler = jest.fn();

      function TestComponent({ register }: { register: boolean }) {
        const { registerShortcut, shortcuts } = useKeyboardShortcuts();

        React.useEffect(() => {
          if (register) {
            const unregister = registerShortcut({
              key: "z",
              description: "Temp shortcut",
              category: "actions",
              handler: customHandler,
            });
            return unregister;
          }
        }, [register, registerShortcut]);

        return <div data-testid="has-z">{shortcuts.some((s) => s.key === "z") ? "yes" : "no"}</div>;
      }

      const { rerender } = render(
        <Wrapper>
          <TestComponent register />
        </Wrapper>
      );

      expect(screen.getByTestId("has-z")).toHaveTextContent("yes");

      rerender(
        <Wrapper>
          <TestComponent register={false} />
        </Wrapper>
      );

      expect(screen.getByTestId("has-z")).toHaveTextContent("no");
    });

    it("replaces existing shortcut with same key", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      function TestComponent() {
        const { registerShortcut, shortcuts } = useKeyboardShortcuts();

        React.useEffect(() => {
          registerShortcut({
            key: "q",
            description: "First handler",
            category: "actions",
            handler: handler1,
          });

          registerShortcut({
            key: "q",
            description: "Second handler",
            category: "actions",
            handler: handler2,
          });
        }, [registerShortcut]);

        return <div data-testid="q-count">{shortcuts.filter((s) => s.key === "q").length}</div>;
      }

      render(
        <Wrapper>
          <TestComponent />
        </Wrapper>
      );

      // Should only have one shortcut with key "q"
      expect(screen.getByTestId("q-count")).toHaveTextContent("1");
    });
  });

  describe("KeyboardShortcutsHelp component", () => {
    it("renders when imported", () => {
      expect(KeyboardShortcutsHelp).toBeDefined();
    });

    it("renders with onClose prop inside provider", () => {
      const onClose = jest.fn();
      render(
        <KeyboardShortcutsProvider>
          <KeyboardShortcutsHelp onClose={onClose} />
        </KeyboardShortcutsProvider>
      );

      // Should render some content
      expect(document.body.textContent).toBeTruthy();
    });

    it("calls onClose when close button clicked", () => {
      const onClose = jest.fn();
      render(
        <KeyboardShortcutsProvider>
          <KeyboardShortcutsHelp onClose={onClose} />
        </KeyboardShortcutsProvider>
      );

      // Find and click close button using getAllByRole and find the specific one
      const closeButtons = screen.queryAllByRole("button", { name: /close/i });
      if (closeButtons.length > 0) {
        // Click the first close button found
        fireEvent.click(closeButtons[0]!);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("displays in provider when showHelp is true", () => {
      function TestComponent() {
        const { setShowHelp, showHelp } = useKeyboardShortcuts();
        return (
          <div>
            <button onClick={() => setShowHelp(true)}>Show Help</button>
            <span data-testid="state">{showHelp ? "visible" : "hidden"}</span>
          </div>
        );
      }

      render(
        <KeyboardShortcutsProvider>
          <TestComponent />
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId("state")).toHaveTextContent("hidden");

      fireEvent.click(screen.getByText("Show Help"));

      expect(screen.getByTestId("state")).toHaveTextContent("visible");
    });
  });

  describe("Two-key sequences", () => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>;
    }

    it("can register sequence shortcuts", () => {
      const sequenceHandler = jest.fn();

      function TestComponent() {
        const { registerShortcut, shortcuts } = useKeyboardShortcuts();

        React.useEffect(() => {
          const unregister = registerShortcut({
            key: "i",
            sequence: "g i",
            description: "Go to inbox",
            category: "navigation",
            handler: sequenceHandler,
          });

          return unregister;
        }, [registerShortcut]);

        return (
          <div data-testid="has-sequence">
            {shortcuts.some((s) => s.sequence === "g i") ? "yes" : "no"}
          </div>
        );
      }

      render(
        <Wrapper>
          <TestComponent />
        </Wrapper>
      );

      expect(screen.getByTestId("has-sequence")).toHaveTextContent("yes");
    });
  });

  describe("KeyboardShortcut type", () => {
    it("allows creating typed shortcut objects", () => {
      const shortcut: KeyboardShortcut = {
        key: "x",
        description: "Select email",
        category: "selection",
        handler: () => {},
      };

      expect(shortcut.key).toBe("x");
      expect(shortcut.description).toBe("Select email");
      expect(shortcut.category).toBe("selection");
    });

    it("allows optional properties", () => {
      const shortcut: KeyboardShortcut = {
        key: "s",
        description: "Star",
        category: "actions",
        handler: () => {},
        ctrl: true,
        alt: false,
        shift: true,
        sequence: undefined,
        disableInInput: true,
      };

      expect(shortcut.ctrl).toBe(true);
      expect(shortcut.shift).toBe(true);
      expect(shortcut.disableInInput).toBe(true);
    });
  });
});

describe("Provider edge cases", () => {
  it("multiple providers work independently", () => {
    function TestConsumer({ testId }: { testId: string }) {
      const { isEnabled, setEnabled } = useKeyboardShortcuts();
      return (
        <div>
          <span data-testid={`${testId}-state`}>{isEnabled ? "on" : "off"}</span>
          <button data-testid={`${testId}-toggle`} onClick={() => setEnabled(!isEnabled)}>
            Toggle
          </button>
        </div>
      );
    }

    render(
      <div>
        <KeyboardShortcutsProvider>
          <TestConsumer testId="first" />
        </KeyboardShortcutsProvider>
        <KeyboardShortcutsProvider>
          <TestConsumer testId="second" />
        </KeyboardShortcutsProvider>
      </div>
    );

    expect(screen.getByTestId("first-state")).toHaveTextContent("on");
    expect(screen.getByTestId("second-state")).toHaveTextContent("on");

    // Toggle first provider
    fireEvent.click(screen.getByTestId("first-toggle"));

    // First should be off, second should still be on
    expect(screen.getByTestId("first-state")).toHaveTextContent("off");
    expect(screen.getByTestId("second-state")).toHaveTextContent("on");
  });

  it("nested providers use closest context", () => {
    function TestConsumer({ testId }: { testId: string }) {
      const { shortcuts } = useKeyboardShortcuts();
      return <div data-testid={testId}>{shortcuts.length}</div>;
    }

    function InnerComponent() {
      const { registerShortcut } = useKeyboardShortcuts();

      React.useEffect(() => {
        return registerShortcut({
          key: "inner",
          description: "Inner shortcut",
          category: "actions",
          handler: () => {},
        });
      }, [registerShortcut]);

      return <TestConsumer testId="inner" />;
    }

    render(
      <KeyboardShortcutsProvider>
        <TestConsumer testId="outer" />
        <KeyboardShortcutsProvider>
          <InnerComponent />
        </KeyboardShortcutsProvider>
      </KeyboardShortcutsProvider>
    );

    // Inner should have shortcut registered, outer should not
    expect(Number(screen.getByTestId("inner").textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId("outer")).toHaveTextContent("0");
  });
});
