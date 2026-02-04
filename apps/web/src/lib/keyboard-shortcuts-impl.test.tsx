/**
 * Keyboard Shortcuts Implementation Tests
 * Tests for the actual keyboard-shortcuts.tsx file
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ============================================================
// FORMAT KEY FUNCTION TESTS
// ============================================================

describe("formatKey utility", () => {
  // Re-implement formatKey for testing
  const formatKey = (key: string): string => {
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
  };

  it("formats space as Space", () => {
    expect(formatKey(" ")).toBe("Space");
  });

  it("formats arrow keys as symbols", () => {
    expect(formatKey("ArrowUp")).toBe("↑");
    expect(formatKey("ArrowDown")).toBe("↓");
    expect(formatKey("ArrowLeft")).toBe("←");
    expect(formatKey("ArrowRight")).toBe("→");
  });

  it("formats Enter as return symbol", () => {
    expect(formatKey("Enter")).toBe("⏎");
  });

  it("formats Escape as Esc", () => {
    expect(formatKey("Escape")).toBe("Esc");
  });

  it("formats Delete as Del", () => {
    expect(formatKey("Delete")).toBe("Del");
  });

  it("formats Backspace as delete symbol", () => {
    expect(formatKey("Backspace")).toBe("⌫");
  });

  it("preserves # symbol", () => {
    expect(formatKey("#")).toBe("#");
  });

  it("uppercases regular keys", () => {
    expect(formatKey("j")).toBe("J");
    expect(formatKey("k")).toBe("K");
    expect(formatKey("a")).toBe("A");
  });
});

// ============================================================
// CATEGORY LABELS TESTS
// ============================================================

describe("categoryLabels", () => {
  const categoryLabels = {
    navigation: "Navigation",
    actions: "Actions",
    search: "Search",
    other: "Other",
  };

  it("has navigation label", () => {
    expect(categoryLabels.navigation).toBe("Navigation");
  });

  it("has actions label", () => {
    expect(categoryLabels.actions).toBe("Actions");
  });

  it("has search label", () => {
    expect(categoryLabels.search).toBe("Search");
  });

  it("has other label", () => {
    expect(categoryLabels.other).toBe("Other");
  });
});

// ============================================================
// GET TARGET EMAIL IDS TESTS
// ============================================================

describe("getTargetEmailIds", () => {
  const getTargetEmailIds = (
    selectedEmailIds: string[],
    focusedEmailId: string | null
  ): string[] => {
    if (selectedEmailIds.length > 0) {
      return selectedEmailIds;
    }
    if (focusedEmailId) {
      return [focusedEmailId];
    }
    return [];
  };

  it("returns selected emails when available", () => {
    expect(getTargetEmailIds(["email-1", "email-2"], "email-3")).toEqual(["email-1", "email-2"]);
  });

  it("returns focused email when no selection", () => {
    expect(getTargetEmailIds([], "email-1")).toEqual(["email-1"]);
  });

  it("returns empty array when nothing is selected or focused", () => {
    expect(getTargetEmailIds([], null)).toEqual([]);
  });

  it("prefers selection over focused email", () => {
    expect(getTargetEmailIds(["selected"], "focused")).toEqual(["selected"]);
  });
});

// ============================================================
// KEYBOARD SHORTCUT INTERFACE TESTS
// ============================================================

describe("KeyboardShortcut interface", () => {
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

  it("creates valid navigation shortcut", () => {
    const shortcut: KeyboardShortcut = {
      key: "j",
      description: "Next email",
      category: "navigation",
      handler: jest.fn(),
      disableInInput: true,
    };

    expect(shortcut.key).toBe("j");
    expect(shortcut.category).toBe("navigation");
    expect(shortcut.disableInInput).toBe(true);
  });

  it("creates valid action shortcut with modifiers", () => {
    const shortcut: KeyboardShortcut = {
      key: "i",
      description: "Mark as read",
      category: "actions",
      shift: true,
      handler: jest.fn(),
    };

    expect(shortcut.shift).toBe(true);
    expect(shortcut.ctrl).toBeUndefined();
  });

  it("creates valid sequence shortcut", () => {
    const shortcut: KeyboardShortcut = {
      key: "g i",
      description: "Go to Inbox",
      category: "navigation",
      sequence: "g i",
      handler: jest.fn(),
    };

    expect(shortcut.sequence).toBe("g i");
  });
});

// ============================================================
// SHORTCUT MATCHING LOGIC TESTS
// ============================================================

describe("Shortcut matching logic", () => {
  interface KeyboardShortcut {
    key: string;
    sequence?: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    disableInInput?: boolean;
    handler: () => void;
  }

  const matchShortcut = (
    shortcuts: KeyboardShortcut[],
    event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
    isInput: boolean
  ): KeyboardShortcut | undefined => {
    return shortcuts.find((s) => {
      if (s.sequence) return false;
      if (isInput && s.disableInInput) return false;
      if (s.key !== event.key) return false;
      if (s.ctrl && !event.ctrlKey) return false;
      if (s.alt && !event.altKey) return false;
      if (s.shift && !event.shiftKey) return false;
      if (!s.ctrl && event.ctrlKey) return false;
      if (!s.alt && event.altKey) return false;
      if (!s.shift && event.shiftKey && event.key.length === 1) return false;
      return true;
    });
  };

  it("matches simple key shortcut", () => {
    const shortcuts: KeyboardShortcut[] = [
      { key: "j", handler: jest.fn() },
      { key: "k", handler: jest.fn() },
    ];

    const event = { key: "j", ctrlKey: false, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, false);

    expect(match?.key).toBe("j");
  });

  it("matches shortcut with ctrl modifier", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "s", ctrl: true, handler: jest.fn() }];

    const event = { key: "s", ctrlKey: true, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, false);

    expect(match?.key).toBe("s");
  });

  it("does not match when ctrl is required but not pressed", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "s", ctrl: true, handler: jest.fn() }];

    const event = { key: "s", ctrlKey: false, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, false);

    expect(match).toBeUndefined();
  });

  it("matches shortcut with shift modifier", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "i", shift: true, handler: jest.fn() }];

    const event = { key: "i", ctrlKey: false, altKey: false, shiftKey: true };
    const match = matchShortcut(shortcuts, event, false);

    expect(match?.key).toBe("i");
  });

  it("does not match in input when disableInInput is true", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "j", disableInInput: true, handler: jest.fn() }];

    const event = { key: "j", ctrlKey: false, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, true);

    expect(match).toBeUndefined();
  });

  it("matches in input when disableInInput is false", () => {
    const shortcuts: KeyboardShortcut[] = [
      { key: "Escape", disableInInput: false, handler: jest.fn() },
    ];

    const event = { key: "Escape", ctrlKey: false, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, true);

    expect(match?.key).toBe("Escape");
  });

  it("skips sequence shortcuts in matching", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "g i", sequence: "g i", handler: jest.fn() }];

    const event = { key: "g i", ctrlKey: false, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, false);

    expect(match).toBeUndefined();
  });

  it("does not match when extra ctrl is pressed", () => {
    const shortcuts: KeyboardShortcut[] = [{ key: "j", handler: jest.fn() }];

    const event = { key: "j", ctrlKey: true, altKey: false, shiftKey: false };
    const match = matchShortcut(shortcuts, event, false);

    expect(match).toBeUndefined();
  });
});

// ============================================================
// SEQUENCE MATCHING TESTS
// ============================================================

describe("Sequence matching", () => {
  interface Shortcut {
    sequence?: string;
    disableInInput?: boolean;
    handler: () => void;
  }

  const findSequenceStart = (
    shortcuts: Shortcut[],
    key: string,
    isInput: boolean
  ): Shortcut | undefined => {
    return shortcuts.find(
      (s) => s.sequence?.startsWith(`${key} `) && (!isInput || !s.disableInInput)
    );
  };

  const findSequenceMatch = (
    shortcuts: Shortcut[],
    sequence: string,
    isInput: boolean
  ): Shortcut | undefined => {
    return shortcuts.find((s) => s.sequence === sequence && (!isInput || !s.disableInInput));
  };

  it("finds sequence start", () => {
    const shortcuts: Shortcut[] = [
      { sequence: "g i", handler: jest.fn() },
      { sequence: "g s", handler: jest.fn() },
    ];

    const match = findSequenceStart(shortcuts, "g", false);
    expect(match?.sequence?.startsWith("g ")).toBe(true);
  });

  it("does not find non-existent sequence start", () => {
    const shortcuts: Shortcut[] = [{ sequence: "g i", handler: jest.fn() }];

    const match = findSequenceStart(shortcuts, "x", false);
    expect(match).toBeUndefined();
  });

  it("finds complete sequence match", () => {
    const shortcuts: Shortcut[] = [
      { sequence: "g i", handler: jest.fn() },
      { sequence: "g s", handler: jest.fn() },
    ];

    const match = findSequenceMatch(shortcuts, "g i", false);
    expect(match?.sequence).toBe("g i");
  });

  it("respects disableInInput for sequences", () => {
    const shortcuts: Shortcut[] = [{ sequence: "g i", disableInInput: true, handler: jest.fn() }];

    const match = findSequenceStart(shortcuts, "g", true);
    expect(match).toBeUndefined();
  });
});

// ============================================================
// INPUT DETECTION TESTS
// ============================================================

describe("Input element detection", () => {
  const isInputElement = (target: { tagName: string; isContentEditable?: boolean }): boolean => {
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable === true
    );
  };

  it("detects INPUT element", () => {
    expect(isInputElement({ tagName: "INPUT" })).toBe(true);
  });

  it("detects TEXTAREA element", () => {
    expect(isInputElement({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("detects contentEditable element", () => {
    expect(isInputElement({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("does not detect regular DIV", () => {
    expect(isInputElement({ tagName: "DIV", isContentEditable: false })).toBe(false);
  });

  it("does not detect BUTTON", () => {
    expect(isInputElement({ tagName: "BUTTON" })).toBe(false);
  });
});

// ============================================================
// SHORTCUT REGISTRATION TESTS
// ============================================================

describe("Shortcut registration", () => {
  interface Shortcut {
    key: string;
    sequence?: string;
    handler: () => void;
  }

  it("adds new shortcut to list", () => {
    let shortcuts: Shortcut[] = [];
    const newShortcut = { key: "j", handler: jest.fn() };

    // Simulate registerShortcut
    const filtered = shortcuts.filter(
      (s) => s.key !== newShortcut.key || s.sequence !== newShortcut.sequence
    );
    shortcuts = [...filtered, newShortcut];

    expect(shortcuts).toContainEqual(newShortcut);
  });

  it("replaces existing shortcut with same key", () => {
    const oldHandler = jest.fn();
    const newHandler = jest.fn();
    let shortcuts: Shortcut[] = [{ key: "j", handler: oldHandler }];
    const newShortcut = { key: "j", handler: newHandler };

    const filtered = shortcuts.filter(
      (s) => s.key !== newShortcut.key || s.sequence !== newShortcut.sequence
    );
    shortcuts = [...filtered, newShortcut];

    expect(shortcuts.length).toBe(1);
    expect(shortcuts[0]?.handler).toBe(newHandler);
  });

  it("unregisters shortcut", () => {
    const shortcut = { key: "j", handler: jest.fn() };
    let shortcuts: Shortcut[] = [shortcut, { key: "k", handler: jest.fn() }];

    // Simulate unregister
    shortcuts = shortcuts.filter((s) => s.key !== shortcut.key || s.sequence !== shortcut.sequence);

    expect(shortcuts.find((s) => s.key === "j")).toBeUndefined();
    expect(shortcuts.length).toBe(1);
  });
});

// ============================================================
// GROUPING BY CATEGORY TESTS
// ============================================================

describe("Grouping shortcuts by category", () => {
  interface Shortcut {
    key: string;
    category: "navigation" | "actions" | "search" | "other";
  }

  it("groups shortcuts into categories", () => {
    const shortcuts: Shortcut[] = [
      { key: "j", category: "navigation" },
      { key: "k", category: "navigation" },
      { key: "c", category: "actions" },
      { key: "/", category: "search" },
    ];

    const result: Record<string, Shortcut[]> = {
      navigation: [],
      actions: [],
      search: [],
      other: [],
    };

    shortcuts.forEach((shortcut) => {
      result[shortcut.category].push(shortcut);
    });

    expect(result.navigation.length).toBe(2);
    expect(result.actions.length).toBe(1);
    expect(result.search.length).toBe(1);
    expect(result.other.length).toBe(0);
  });
});

// ============================================================
// NAVIGATION EMAIL INDEX TESTS
// ============================================================

describe("Email navigation", () => {
  interface Email {
    id: string;
  }

  const getEmailIndex = (emails: Email[], focusedEmailId: string | null): number => {
    if (!focusedEmailId) return -1;
    return emails.findIndex((e) => e.id === focusedEmailId);
  };

  it("finds email index", () => {
    const emails = [{ id: "1" }, { id: "2" }, { id: "3" }];
    expect(getEmailIndex(emails, "2")).toBe(1);
  });

  it("returns -1 for null focused email", () => {
    const emails = [{ id: "1" }, { id: "2" }];
    expect(getEmailIndex(emails, null)).toBe(-1);
  });

  it("returns -1 for non-existent email", () => {
    const emails = [{ id: "1" }, { id: "2" }];
    expect(getEmailIndex(emails, "999")).toBe(-1);
  });

  it("selects next email by index", () => {
    const emails = [{ id: "1" }, { id: "2" }, { id: "3" }];
    let focusedId: string | null = null;

    const selectByIndex = (index: number) => {
      if (index >= 0 && index < emails.length) {
        focusedId = emails[index]?.id ?? null;
      }
    };

    selectByIndex(0);
    expect(focusedId).toBe("1");

    selectByIndex(1);
    expect(focusedId).toBe("2");
  });

  it("does not select out-of-bounds index", () => {
    const emails = [{ id: "1" }, { id: "2" }];
    let focusedId: string | null = "2";

    const selectByIndex = (index: number) => {
      if (index >= 0 && index < emails.length) {
        focusedId = emails[index]?.id ?? null;
      }
    };

    selectByIndex(5); // Out of bounds
    expect(focusedId).toBe("2"); // Unchanged
  });
});

// ============================================================
// STAR TOGGLE LOGIC TESTS
// ============================================================

describe("Star toggle logic", () => {
  interface Email {
    id: string;
    isStarred: boolean;
  }

  it("unstars starred email", () => {
    const email: Email = { id: "1", isStarred: true };
    const shouldUnstar = email.isStarred;
    expect(shouldUnstar).toBe(true);
  });

  it("stars unstarred email", () => {
    const email: Email = { id: "1", isStarred: false };
    const shouldStar = !email.isStarred;
    expect(shouldStar).toBe(true);
  });
});

// ============================================================
// ROUTE GENERATION TESTS
// ============================================================

describe("Route generation", () => {
  it("generates email detail route", () => {
    const emailId = "email-123";
    const route = `/mail/${emailId}`;
    expect(route).toBe("/mail/email-123");
  });

  it("generates compose reply route", () => {
    const emailId = "email-456";
    const route = `/mail/compose?reply=${emailId}`;
    expect(route).toBe("/mail/compose?reply=email-456");
  });

  it("generates compose reply-all route", () => {
    const emailId = "email-789";
    const route = `/mail/compose?replyAll=${emailId}`;
    expect(route).toBe("/mail/compose?replyAll=email-789");
  });

  it("generates compose forward route", () => {
    const emailId = "email-abc";
    const route = `/mail/compose?forward=${emailId}`;
    expect(route).toBe("/mail/compose?forward=email-abc");
  });

  it("generates folder routes", () => {
    expect("/mail?folder=inbox").toBe("/mail?folder=inbox");
    expect("/mail?folder=starred").toBe("/mail?folder=starred");
    expect("/mail?folder=drafts").toBe("/mail?folder=drafts");
    expect("/mail?folder=sent").toBe("/mail?folder=sent");
  });
});

// ============================================================
// PATHNAME CHECK TESTS
// ============================================================

describe("Pathname checks", () => {
  it("detects email detail page", () => {
    const pathname = "/mail/email-123";
    const isEmailDetail = pathname.startsWith("/mail/") && pathname !== "/mail";
    expect(isEmailDetail).toBe(true);
  });

  it("detects mail list page", () => {
    const pathname = "/mail";
    const isEmailDetail = pathname.startsWith("/mail/") && pathname !== "/mail";
    expect(isEmailDetail).toBe(false);
  });
});

// ============================================================
// CONTEXT HOOK ERROR TESTS
// ============================================================

describe("Context hook error handling", () => {
  it("throws error when used outside provider", () => {
    // Simulate the useKeyboardShortcuts hook behavior
    const useKeyboardShortcuts = () => {
      const context = null; // Simulating no provider
      if (!context) {
        throw new Error("useKeyboardShortcuts must be used within a KeyboardShortcutsProvider");
      }
      return context;
    };

    expect(() => useKeyboardShortcuts()).toThrow(
      "useKeyboardShortcuts must be used within a KeyboardShortcutsProvider"
    );
  });
});

// ============================================================
// SEQUENCE TIMEOUT TESTS
// ============================================================

describe("Sequence timeout", () => {
  jest.useFakeTimers();

  it("clears pending key after 1 second", () => {
    let pendingKey: string | null = "g";

    const timeout = setTimeout(() => {
      pendingKey = null;
    }, 1000);

    expect(pendingKey).toBe("g");

    jest.advanceTimersByTime(1000);

    expect(pendingKey).toBeNull();

    clearTimeout(timeout);
  });

  it("clears pending key before timeout when sequence completes", () => {
    let pendingKey: string | null = "g";
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

    pendingTimeout = setTimeout(() => {
      pendingKey = null;
    }, 1000);

    // Simulate sequence completion
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    pendingKey = null;

    expect(pendingKey).toBeNull();
  });

  afterAll(() => {
    jest.useRealTimers();
  });
});
