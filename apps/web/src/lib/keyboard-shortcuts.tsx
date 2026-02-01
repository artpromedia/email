"use client";

/**
 * Keyboard Shortcuts System
 * Gmail-style keyboard navigation for power users
 *
 * Shortcuts:
 * Navigation:
 *   j/k or ↓/↑ - Next/Previous email
 *   o or Enter - Open selected email
 *   u - Return to email list
 *   g then i - Go to Inbox
 *   g then s - Go to Starred
 *   g then d - Go to Drafts
 *   g then t - Go to Sent
 *
 * Actions:
 *   c - Compose new email
 *   r - Reply
 *   a - Reply all
 *   f - Forward
 *   e - Archive
 *   # or Delete - Delete/Trash
 *   s - Star/Unstar
 *   Shift+u - Mark as unread
 *   Shift+i - Mark as read
 *   x - Select/Deselect email
 *   Escape - Close compose, deselect
 *
 * Search:
 *   / - Focus search
 *   ? - Show keyboard shortcuts help
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMailStore } from "./mail";

// ============================================================
// TYPES
// ============================================================

export interface KeyboardShortcut {
  key: string;
  description: string;
  category: "navigation" | "actions" | "search" | "other";
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** For two-key sequences like "g i" */
  sequence?: string;
  handler: () => void;
  /** If true, won't fire when focused in input/textarea */
  disableInInput?: boolean;
}

interface KeyboardShortcutsContextValue {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  registerShortcut: (shortcut: KeyboardShortcut) => () => void;
  shortcuts: KeyboardShortcut[];
}

// ============================================================
// CONTEXT
// ============================================================

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error("useKeyboardShortcuts must be used within a KeyboardShortcutsProvider");
  }
  return context;
}

// ============================================================
// PROVIDER
// ============================================================

interface KeyboardShortcutsProviderProps {
  readonly children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);

  // Track sequence state for two-key shortcuts (e.g., "g i")
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingTimeout, setPendingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const registerShortcut = useCallback((shortcut: KeyboardShortcut) => {
    setShortcuts((prev) => {
      const filtered = prev.filter(
        (s) => s.key !== shortcut.key || s.sequence !== shortcut.sequence
      );
      return [...filtered, shortcut];
    });
    return () => {
      setShortcuts((prev) =>
        prev.filter((s) => s.key !== shortcut.key || s.sequence !== shortcut.sequence)
      );
    };
  }, []);

  // Main keyboard event handler
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if typing in input
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const key = event.key;

      // Handle pending sequence
      if (pendingKey) {
        const sequenceKey = `${pendingKey} ${key}`;
        const sequenceShortcut = shortcuts.find(
          (s) => s.sequence === sequenceKey && (!isInput || !s.disableInInput)
        );

        if (sequenceShortcut) {
          event.preventDefault();
          sequenceShortcut.handler();
        }

        // Clear pending state
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          setPendingTimeout(null);
        }
        setPendingKey(null);
        return;
      }

      // Check if this key starts a sequence
      const potentialSequence = shortcuts.find(
        (s) => s.sequence?.startsWith(`${key} `) && (!isInput || !s.disableInInput)
      );

      if (potentialSequence) {
        event.preventDefault();
        setPendingKey(key);
        // Clear pending key after 1 second
        const timeout = setTimeout(() => {
          setPendingKey(null);
          setPendingTimeout(null);
        }, 1000);
        setPendingTimeout(timeout);
        return;
      }

      // Find matching single-key shortcut
      const matchingShortcut = shortcuts.find((s) => {
        if (s.sequence) return false;
        if (isInput && s.disableInInput) return false;
        if (s.key !== key) return false;
        if (s.ctrl && !event.ctrlKey) return false;
        if (s.alt && !event.altKey) return false;
        if (s.shift && !event.shiftKey) return false;
        if (!s.ctrl && event.ctrlKey) return false;
        if (!s.alt && event.altKey) return false;
        if (!s.shift && event.shiftKey && key.length === 1) return false;
        return true;
      });

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.handler();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, shortcuts, pendingKey, pendingTimeout]);

  const value = useMemo<KeyboardShortcutsContextValue>(
    () => ({
      isEnabled,
      setEnabled: setIsEnabled,
      showHelp,
      setShowHelp,
      registerShortcut,
      shortcuts,
    }),
    [isEnabled, showHelp, registerShortcut, shortcuts]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
    </KeyboardShortcutsContext.Provider>
  );
}

// ============================================================
// HELP DIALOG
// ============================================================

interface KeyboardShortcutsHelpProps {
  readonly onClose: () => void;
}

const categoryLabels: Record<KeyboardShortcut["category"], string> = {
  navigation: "Navigation",
  actions: "Actions",
  search: "Search",
  other: "Other",
};

function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  const { shortcuts } = useKeyboardShortcuts();

  // Group shortcuts by category
  const grouped = useMemo(() => {
    const result: Record<KeyboardShortcut["category"], KeyboardShortcut[]> = {
      navigation: [],
      actions: [],
      search: [],
      other: [],
    };

    shortcuts.forEach((shortcut) => {
      result[shortcut.category].push(shortcut);
    });

    return result;
  }, [shortcuts]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    globalThis.addEventListener("keydown", handleEscape);
    return () => globalThis.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleOverlayClick = () => {
    onClose();
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      onClose();
    }
  };

  return (
    <button
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      aria-label="Close keyboard shortcuts help"
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close"
            type="button"
          >
            <span className="text-xl">×</span>
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {(Object.entries(grouped) as [KeyboardShortcut["category"], KeyboardShortcut[]][]).map(
            ([category, categoryShortcuts]) => {
              if (categoryShortcuts.length === 0) return null;
              return (
                <div key={category}>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {categoryLabels[category]}
                  </h3>
                  <div className="space-y-1">
                    {categoryShortcuts.map((shortcut) => (
                      <div
                        key={shortcut.sequence ?? shortcut.key}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {shortcut.description}
                        </span>
                        <ShortcutKey shortcut={shortcut} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          )}
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Press{" "}
          <kbd className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            ?
          </kbd>{" "}
          to toggle this help
        </div>
      </div>
    </button>
  );
}

interface ShortcutKeyProps {
  readonly shortcut: KeyboardShortcut;
}

function ShortcutKey({ shortcut }: ShortcutKeyProps) {
  const keys: string[] = [];

  if (shortcut.ctrl) keys.push("Ctrl");
  if (shortcut.alt) keys.push("Alt");
  if (shortcut.shift) keys.push("Shift");

  if (shortcut.sequence) {
    const parts = shortcut.sequence.split(" ");
    return (
      <div className="flex items-center gap-1">
        {parts.map((part) => (
          <span key={`${shortcut.sequence}-${part}`} className="flex items-center gap-1">
            <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
              {formatKey(part)}
            </kbd>
          </span>
        ))}
      </div>
    );
  }

  keys.push(formatKey(shortcut.key));

  return (
    <div className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={`${shortcut.key}-${key}`}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}

function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    " ": "Space",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "⏎",
    Escape: "Esc",
    Delete: "Del",
    Backspace: "⌫",
    "#": "#",
  };

  return keyMap[key] ?? key.toUpperCase();
}

// ============================================================
// MAIL SHORTCUTS HOOK
// ============================================================

/**
 * Helper to get email IDs for bulk actions
 */
function getTargetEmailIds(selectedEmailIds: string[], focusedEmailId: string | null): string[] {
  if (selectedEmailIds.length > 0) {
    return selectedEmailIds;
  }
  if (focusedEmailId) {
    return [focusedEmailId];
  }
  return [];
}

/**
 * Hook that registers all email-related keyboard shortcuts
 * Should be used in the main mail layout
 */
export function useMailKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { registerShortcut, setShowHelp } = useKeyboardShortcuts();

  // Get mail store actions
  const emails = useMailStore((state) => state.emails);
  const focusedEmailId = useMailStore((state) => state.focusedEmailId);
  const setFocusedEmail = useMailStore((state) => state.setFocusedEmail);
  const selectedEmails = useMailStore((state) => state.selectedEmails);
  const toggleEmailSelection = useMailStore((state) => state.toggleEmailSelection);
  const clearSelection = useMailStore((state) => state.clearSelection);
  const markAsRead = useMailStore((state) => state.markAsRead);
  const markAsUnread = useMailStore((state) => state.markAsUnread);
  const starEmails = useMailStore((state) => state.starEmails);
  const unstarEmails = useMailStore((state) => state.unstarEmails);
  const deleteEmails = useMailStore((state) => state.deleteEmails);

  // Convert Set to array for selected emails
  const selectedEmailIds = useMemo(() => Array.from(selectedEmails), [selectedEmails]);

  // Navigation helpers
  const getEmailIndex = useCallback(() => {
    if (!focusedEmailId) return -1;
    return emails.findIndex((e) => e.id === focusedEmailId);
  }, [emails, focusedEmailId]);

  const selectEmailByIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < emails.length) {
        const email = emails[index];
        if (email) {
          setFocusedEmail(email.id);
        }
      }
    },
    [emails, setFocusedEmail]
  );

  // Register all shortcuts
  useEffect(() => {
    const unregisters: (() => void)[] = [];

    // Helper function to register and track
    const register = (shortcut: KeyboardShortcut) => {
      unregisters.push(registerShortcut(shortcut));
    };

    // --- NAVIGATION ---

    register({
      key: "j",
      description: "Next email",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        const index = getEmailIndex();
        selectEmailByIndex(index + 1);
      },
    });

    register({
      key: "k",
      description: "Previous email",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        const index = getEmailIndex();
        selectEmailByIndex(index - 1);
      },
    });

    register({
      key: "ArrowDown",
      description: "Next email (arrow)",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        const index = getEmailIndex();
        selectEmailByIndex(index + 1);
      },
    });

    register({
      key: "ArrowUp",
      description: "Previous email (arrow)",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        const index = getEmailIndex();
        selectEmailByIndex(index - 1);
      },
    });

    register({
      key: "o",
      description: "Open email",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          router.push(`/mail/${focusedEmailId}`);
        }
      },
    });

    register({
      key: "Enter",
      description: "Open email",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          router.push(`/mail/${focusedEmailId}`);
        }
      },
    });

    register({
      key: "u",
      description: "Return to email list",
      category: "navigation",
      disableInInput: true,
      handler: () => {
        if (pathname.startsWith("/mail/") && pathname !== "/mail") {
          router.push("/mail");
        }
      },
    });

    // Go to sequences
    register({
      key: "g i",
      sequence: "g i",
      description: "Go to Inbox",
      category: "navigation",
      disableInInput: true,
      handler: () => router.push("/mail?folder=inbox"),
    });

    register({
      key: "g s",
      sequence: "g s",
      description: "Go to Starred",
      category: "navigation",
      disableInInput: true,
      handler: () => router.push("/mail?folder=starred"),
    });

    register({
      key: "g d",
      sequence: "g d",
      description: "Go to Drafts",
      category: "navigation",
      disableInInput: true,
      handler: () => router.push("/mail?folder=drafts"),
    });

    register({
      key: "g t",
      sequence: "g t",
      description: "Go to Sent",
      category: "navigation",
      disableInInput: true,
      handler: () => router.push("/mail?folder=sent"),
    });

    // --- ACTIONS ---

    register({
      key: "c",
      description: "Compose new email",
      category: "actions",
      disableInInput: true,
      handler: () => router.push("/mail/compose"),
    });

    register({
      key: "r",
      description: "Reply",
      category: "actions",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          router.push(`/mail/compose?reply=${focusedEmailId}`);
        }
      },
    });

    register({
      key: "a",
      description: "Reply all",
      category: "actions",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          router.push(`/mail/compose?replyAll=${focusedEmailId}`);
        }
      },
    });

    register({
      key: "f",
      description: "Forward",
      category: "actions",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          router.push(`/mail/compose?forward=${focusedEmailId}`);
        }
      },
    });

    register({
      key: "e",
      description: "Archive",
      category: "actions",
      disableInInput: true,
      handler: () => {
        const ids = getTargetEmailIds(selectedEmailIds, focusedEmailId);
        if (ids.length > 0) {
          // Remove from current view (optimistic UI - full archive implementation would call API)
          deleteEmails(ids);
        }
      },
    });

    register({
      key: "#",
      description: "Move to trash",
      category: "actions",
      disableInInput: true,
      handler: () => {
        const ids = getTargetEmailIds(selectedEmailIds, focusedEmailId);
        if (ids.length > 0) {
          deleteEmails(ids);
        }
      },
    });

    register({
      key: "Delete",
      description: "Move to trash",
      category: "actions",
      disableInInput: true,
      handler: () => {
        const ids = getTargetEmailIds(selectedEmailIds, focusedEmailId);
        if (ids.length > 0) {
          deleteEmails(ids);
        }
      },
    });

    register({
      key: "s",
      description: "Star/Unstar",
      category: "actions",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          const email = emails.find((e) => e.id === focusedEmailId);
          if (email) {
            if (email.isStarred) {
              unstarEmails([focusedEmailId]);
            } else {
              starEmails([focusedEmailId]);
            }
          }
        }
      },
    });

    register({
      key: "i",
      shift: true,
      description: "Mark as read",
      category: "actions",
      disableInInput: true,
      handler: () => {
        const ids = getTargetEmailIds(selectedEmailIds, focusedEmailId);
        if (ids.length > 0) {
          markAsRead(ids);
        }
      },
    });

    register({
      key: "u",
      shift: true,
      description: "Mark as unread",
      category: "actions",
      disableInInput: true,
      handler: () => {
        const ids = getTargetEmailIds(selectedEmailIds, focusedEmailId);
        if (ids.length > 0) {
          markAsUnread(ids);
        }
      },
    });

    register({
      key: "x",
      description: "Select/Deselect email",
      category: "actions",
      disableInInput: true,
      handler: () => {
        if (focusedEmailId) {
          toggleEmailSelection(focusedEmailId);
        }
      },
    });

    register({
      key: "Escape",
      description: "Deselect all / Close",
      category: "other",
      disableInInput: false,
      handler: () => {
        clearSelection();
        setFocusedEmail(null);
      },
    });

    // --- SEARCH ---

    register({
      key: "/",
      description: "Focus search",
      category: "search",
      disableInInput: true,
      handler: () => {
        const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
        searchInput?.focus();
      },
    });

    register({
      key: "?",
      description: "Show keyboard shortcuts",
      category: "other",
      disableInInput: true,
      handler: () => setShowHelp(true),
    });

    // Cleanup on unmount
    return () => {
      unregisters.forEach((unregister) => unregister());
    };
  }, [
    registerShortcut,
    router,
    pathname,
    getEmailIndex,
    selectEmailByIndex,
    focusedEmailId,
    selectedEmailIds,
    emails,
    toggleEmailSelection,
    clearSelection,
    markAsRead,
    markAsUnread,
    deleteEmails,
    starEmails,
    unstarEmails,
    setFocusedEmail,
    setShowHelp,
  ]);
}

// ============================================================
// EXPORTS
// ============================================================

export { KeyboardShortcutsHelp };
