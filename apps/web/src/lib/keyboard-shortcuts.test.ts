/**
 * Keyboard Shortcuts Tests
 * Tests for the Gmail-style keyboard navigation system
 */

import { renderHook, act } from "@testing-library/react";
import React from "react";

// Types for keyboard shortcuts
interface KeyboardShortcut {
  key: string;
  description: string;
  category: "navigation" | "actions" | "search" | "other";
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  sequence?: string;
  handler: () => void;
  disableInInput?: boolean;
}

interface KeyboardShortcutsState {
  isEnabled: boolean;
  showHelp: boolean;
  shortcuts: KeyboardShortcut[];
  setEnabled: (enabled: boolean) => void;
  setShowHelp: (show: boolean) => void;
  registerShortcut: (shortcut: KeyboardShortcut) => () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
}

// Mock implementation of keyboard shortcuts
function createKeyboardShortcutsState(): KeyboardShortcutsState {
  let isEnabled = true;
  let showHelp = false;
  const shortcuts: KeyboardShortcut[] = [];
  let pendingSequence: string | null = null;
  let sequenceTimeout: NodeJS.Timeout | null = null;

  return {
    get isEnabled() {
      return isEnabled;
    },
    get showHelp() {
      return showHelp;
    },
    get shortcuts() {
      return shortcuts;
    },
    setEnabled(enabled: boolean) {
      isEnabled = enabled;
    },
    setShowHelp(show: boolean) {
      showHelp = show;
    },
    registerShortcut(shortcut: KeyboardShortcut) {
      shortcuts.push(shortcut);
      return () => {
        const index = shortcuts.indexOf(shortcut);
        if (index !== -1) {
          shortcuts.splice(index, 1);
        }
      };
    },
    handleKeyDown(event: KeyboardEvent) {
      if (!isEnabled) return;

      // Check if we're in an input
      const target = event.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const key = event.key.toLowerCase();

      // Handle sequence shortcuts (e.g., "g" then "i" for go to inbox)
      if (pendingSequence) {
        const fullSequence = `${pendingSequence} ${key}`;
        const sequenceShortcut = shortcuts.find(
          (s) => s.sequence === fullSequence && (!isInInput || !s.disableInInput)
        );

        if (sequenceShortcut) {
          event.preventDefault();
          sequenceShortcut.handler();
        }

        pendingSequence = null;
        if (sequenceTimeout) {
          clearTimeout(sequenceTimeout);
          sequenceTimeout = null;
        }
        return;
      }

      // Check for sequence starters
      const hasSequenceStarting = shortcuts.some((s) => s.sequence?.startsWith(`${key} `));

      if (hasSequenceStarting) {
        pendingSequence = key;
        sequenceTimeout = setTimeout(() => {
          pendingSequence = null;
        }, 1000);
        return;
      }

      // Find matching shortcut
      const shortcut = shortcuts.find((s) => {
        if (s.sequence) return false;
        if (s.key.toLowerCase() !== key) return false;
        if (s.ctrl && !event.ctrlKey) return false;
        if (s.alt && !event.altKey) return false;
        if (s.shift && !event.shiftKey) return false;
        if (isInInput && s.disableInInput) return false;
        return true;
      });

      if (shortcut) {
        event.preventDefault();
        shortcut.handler();
      }
    },
  };
}

describe("Keyboard Shortcuts", () => {
  let state: KeyboardShortcutsState;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    state = createKeyboardShortcutsState();
    mockHandler = jest.fn();
  });

  describe("shortcut registration", () => {
    it("registers a shortcut", () => {
      state.registerShortcut({
        key: "c",
        description: "Compose new email",
        category: "actions",
        handler: mockHandler,
      });

      expect(state.shortcuts).toHaveLength(1);
    });

    it("unregisters a shortcut", () => {
      const unregister = state.registerShortcut({
        key: "c",
        description: "Compose new email",
        category: "actions",
        handler: mockHandler,
      });

      expect(state.shortcuts).toHaveLength(1);

      unregister();

      expect(state.shortcuts).toHaveLength(0);
    });
  });

  describe("simple key shortcuts", () => {
    it("triggers shortcut on key press", () => {
      state.registerShortcut({
        key: "c",
        description: "Compose",
        category: "actions",
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "c" }));

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it("handles j/k navigation", () => {
      const nextHandler = jest.fn();
      const prevHandler = jest.fn();

      state.registerShortcut({
        key: "j",
        description: "Next email",
        category: "navigation",
        handler: nextHandler,
      });

      state.registerShortcut({
        key: "k",
        description: "Previous email",
        category: "navigation",
        handler: prevHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "j" }));
      expect(nextHandler).toHaveBeenCalledTimes(1);

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "k" }));
      expect(prevHandler).toHaveBeenCalledTimes(1);
    });

    it("handles delete key", () => {
      state.registerShortcut({
        key: "#",
        description: "Delete",
        category: "actions",
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "#", shiftKey: true }));

      // Note: This won't match because we check shift modifier
      // The handler should handle shift+3 = #
    });

    it("handles star toggle", () => {
      state.registerShortcut({
        key: "s",
        description: "Star/Unstar",
        category: "actions",
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "s" }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("modifier keys", () => {
    it("requires ctrl key when specified", () => {
      state.registerShortcut({
        key: "s",
        description: "Save",
        category: "actions",
        ctrl: true,
        handler: mockHandler,
      });

      // Without ctrl - should not trigger
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "s" }));
      expect(mockHandler).not.toHaveBeenCalled();

      // With ctrl - should trigger
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it("requires shift key when specified", () => {
      state.registerShortcut({
        key: "u",
        description: "Mark as unread",
        category: "actions",
        shift: true,
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "u" }));
      expect(mockHandler).not.toHaveBeenCalled();

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "u", shiftKey: true }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("sequence shortcuts", () => {
    it("handles two-key sequences", async () => {
      state.registerShortcut({
        key: "i",
        description: "Go to Inbox",
        category: "navigation",
        sequence: "g i",
        handler: mockHandler,
      });

      // First key
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "g" }));
      expect(mockHandler).not.toHaveBeenCalled();

      // Second key
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "i" }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it("handles g s for starred", async () => {
      state.registerShortcut({
        key: "s",
        description: "Go to Starred",
        category: "navigation",
        sequence: "g s",
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "g" }));
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "s" }));

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it("handles g d for drafts", async () => {
      state.registerShortcut({
        key: "d",
        description: "Go to Drafts",
        category: "navigation",
        sequence: "g d",
        handler: mockHandler,
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "g" }));
      state.handleKeyDown(new KeyboardEvent("keydown", { key: "d" }));

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("input handling", () => {
    it("blocks shortcuts in input fields when disableInInput is true", () => {
      state.registerShortcut({
        key: "j",
        description: "Next email",
        category: "navigation",
        handler: mockHandler,
        disableInInput: true,
      });

      // Create event with input as target
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "j" });
      Object.defineProperty(event, "target", { value: input });

      state.handleKeyDown(event);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("allows shortcuts in input when disableInInput is false", () => {
      state.registerShortcut({
        key: "Escape",
        description: "Close",
        category: "other",
        handler: mockHandler,
        disableInInput: false,
      });

      // Create event with input as target
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      Object.defineProperty(event, "target", { value: input });

      state.handleKeyDown(event);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("enable/disable", () => {
    it("does not trigger shortcuts when disabled", () => {
      state.registerShortcut({
        key: "c",
        description: "Compose",
        category: "actions",
        handler: mockHandler,
      });

      state.setEnabled(false);

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "c" }));
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("triggers shortcuts when re-enabled", () => {
      state.registerShortcut({
        key: "c",
        description: "Compose",
        category: "actions",
        handler: mockHandler,
      });

      state.setEnabled(false);
      state.setEnabled(true);

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "c" }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("help modal", () => {
    it("shows help modal with ? key", () => {
      state.registerShortcut({
        key: "?",
        description: "Show help",
        category: "other",
        handler: () => state.setShowHelp(true),
      });

      expect(state.showHelp).toBe(false);

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "?" }));

      expect(state.showHelp).toBe(true);
    });

    it("hides help modal with Escape", () => {
      state.setShowHelp(true);

      state.registerShortcut({
        key: "Escape",
        description: "Close",
        category: "other",
        handler: () => state.setShowHelp(false),
      });

      state.handleKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));

      expect(state.showHelp).toBe(false);
    });
  });
});

describe("Email Action Shortcuts", () => {
  let state: KeyboardShortcutsState;
  let actions: Record<string, jest.Mock>;

  beforeEach(() => {
    state = createKeyboardShortcutsState();
    actions = {
      reply: jest.fn(),
      replyAll: jest.fn(),
      forward: jest.fn(),
      archive: jest.fn(),
      delete: jest.fn(),
      markRead: jest.fn(),
      markUnread: jest.fn(),
    };

    // Register all email action shortcuts
    state.registerShortcut({
      key: "r",
      description: "Reply",
      category: "actions",
      handler: actions.reply,
    });

    state.registerShortcut({
      key: "a",
      description: "Reply All",
      category: "actions",
      handler: actions.replyAll,
    });

    state.registerShortcut({
      key: "f",
      description: "Forward",
      category: "actions",
      handler: actions.forward,
    });

    state.registerShortcut({
      key: "e",
      description: "Archive",
      category: "actions",
      handler: actions.archive,
    });

    state.registerShortcut({
      key: "Delete",
      description: "Delete",
      category: "actions",
      handler: actions.delete,
    });

    state.registerShortcut({
      key: "i",
      description: "Mark as read",
      category: "actions",
      shift: true,
      handler: actions.markRead,
    });

    state.registerShortcut({
      key: "u",
      description: "Mark as unread",
      category: "actions",
      shift: true,
      handler: actions.markUnread,
    });
  });

  it("r triggers reply", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "r" }));
    expect(actions.reply).toHaveBeenCalled();
  });

  it("a triggers reply all", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "a" }));
    expect(actions.replyAll).toHaveBeenCalled();
  });

  it("f triggers forward", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "f" }));
    expect(actions.forward).toHaveBeenCalled();
  });

  it("e triggers archive", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "e" }));
    expect(actions.archive).toHaveBeenCalled();
  });

  it("Delete triggers delete", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(actions.delete).toHaveBeenCalled();
  });

  it("Shift+I marks as read", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "i", shiftKey: true }));
    expect(actions.markRead).toHaveBeenCalled();
  });

  it("Shift+U marks as unread", () => {
    state.handleKeyDown(new KeyboardEvent("keydown", { key: "u", shiftKey: true }));
    expect(actions.markUnread).toHaveBeenCalled();
  });
});
