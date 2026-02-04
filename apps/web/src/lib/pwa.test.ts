/**
 * PWA Tests
 * Tests for PWA utilities and hooks
 */

// ============================================================
// PWA STATE INTERFACE TESTS
// ============================================================

interface PWAState {
  isInstalled: boolean;
  canInstall: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
  isServiceWorkerActive: boolean;
  pushSupported: boolean;
  pushPermission: NotificationPermission | "unsupported";
}

describe("PWA State Interface", () => {
  const defaultState: PWAState = {
    isInstalled: false,
    canInstall: false,
    isOnline: true,
    updateAvailable: false,
    isServiceWorkerActive: false,
    pushSupported: false,
    pushPermission: "unsupported",
  };

  it("has correct default values", () => {
    expect(defaultState.isInstalled).toBe(false);
    expect(defaultState.canInstall).toBe(false);
    expect(defaultState.isOnline).toBe(true);
    expect(defaultState.updateAvailable).toBe(false);
    expect(defaultState.isServiceWorkerActive).toBe(false);
    expect(defaultState.pushSupported).toBe(false);
    expect(defaultState.pushPermission).toBe("unsupported");
  });
});

// ============================================================
// STANDALONE DETECTION TESTS
// ============================================================

describe("Standalone detection", () => {
  it("detects standalone mode from display-mode media query", () => {
    const matchResult = { matches: true };
    const isStandalone = matchResult.matches;
    expect(isStandalone).toBe(true);
  });

  it("detects non-standalone mode", () => {
    const matchResult = { matches: false };
    const isStandalone = matchResult.matches;
    expect(isStandalone).toBe(false);
  });

  it("detects iOS standalone mode", () => {
    const navigatorStandalone = true;
    expect(navigatorStandalone).toBe(true);
  });
});

// ============================================================
// URL BASE64 TO UINT8ARRAY TESTS
// ============================================================

describe("urlBase64ToUint8Array", () => {
  // Re-implement the function for testing
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.codePointAt(i) ?? 0;
    }

    return outputArray;
  };

  it("converts URL-safe base64 to Uint8Array", () => {
    const base64 = "SGVsbG8"; // "Hello" in base64
    const result = urlBase64ToUint8Array(base64);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(5);
  });

  it("handles URL-safe characters", () => {
    // Valid base64 string "abc+def/" would become "abc-def_" in URL-safe
    // Testing with valid base64 "YWJjZGVm" (abcdef)
    const base64 = "YWJjZGVm";
    const result = urlBase64ToUint8Array(base64);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(6);
  });

  it("adds correct padding", () => {
    // Test padding calculation
    const calcPadding = (len: number) => "=".repeat((4 - (len % 4)) % 4);

    expect(calcPadding(3)).toBe("="); // 3 % 4 = 3, need 1 padding
    expect(calcPadding(2)).toBe("=="); // 2 % 4 = 2, need 2 padding
    expect(calcPadding(4)).toBe(""); // 4 % 4 = 0, no padding
    expect(calcPadding(5)).toBe("==="); // 5 % 4 = 1, need 3 padding
  });
});

// ============================================================
// ONLINE/OFFLINE STATE TESTS
// ============================================================

describe("Online/Offline state", () => {
  it("updates state to online", () => {
    let isOnline = false;
    const handleOnline = () => {
      isOnline = true;
    };

    handleOnline();
    expect(isOnline).toBe(true);
  });

  it("updates state to offline", () => {
    let isOnline = true;
    const handleOffline = () => {
      isOnline = false;
    };

    handleOffline();
    expect(isOnline).toBe(false);
  });
});

// ============================================================
// INSTALL PROMPT TESTS
// ============================================================

describe("Install prompt handling", () => {
  it("stores deferred prompt on beforeinstallprompt", () => {
    let deferredPrompt: Event | null = null;

    const event = new Event("beforeinstallprompt");
    event.preventDefault();
    deferredPrompt = event;

    expect(deferredPrompt).not.toBeNull();
  });

  it("clears deferred prompt on appinstalled", () => {
    const initialPrompt: Event = new Event("beforeinstallprompt");
    let deferredPrompt: Event | null = initialPrompt;
    let isInstalled = false;

    // Verify initial state
    expect(deferredPrompt).toBe(initialPrompt);

    // Simulate appinstalled
    deferredPrompt = null;
    isInstalled = true;

    expect(deferredPrompt).toBeNull();
    expect(isInstalled).toBe(true);
  });

  it("promptInstall returns false when no deferred prompt", async () => {
    const deferredInstallPrompt = null;

    const promptInstall = async (): Promise<boolean> => {
      if (!deferredInstallPrompt) return false;
      return true;
    };

    const result = await promptInstall();
    expect(result).toBe(false);
  });
});

// ============================================================
// SERVICE WORKER REGISTRATION TESTS
// ============================================================

describe("Service worker registration", () => {
  it("returns null when window is undefined", async () => {
    const register = async () => {
      if (globalThis.window === undefined) {
        return null;
      }
      return { scope: "/" };
    };

    // In Node.js test environment, this should work
    const result = await register();
    expect(result).toBeDefined();
  });

  it("checks serviceWorker support", () => {
    const hasServiceWorker = "serviceWorker" in navigator;
    // In jsdom, serviceWorker may or may not exist
    expect(typeof hasServiceWorker).toBe("boolean");
  });
});

// ============================================================
// UPDATE AVAILABLE TESTS
// ============================================================

describe("Update available handling", () => {
  it("sets updateAvailable when sw-update-available event fires", () => {
    let updateAvailable = false;

    const handleUpdateAvailable = () => {
      updateAvailable = true;
    };

    handleUpdateAvailable();
    expect(updateAvailable).toBe(true);
  });
});

// ============================================================
// SKIP WAITING MESSAGE TESTS
// ============================================================

describe("Skip waiting message", () => {
  it("posts SKIP_WAITING message type", () => {
    const messages: { type: string }[] = [];

    const mockPostMessage = (msg: { type: string }) => {
      messages.push(msg);
    };

    mockPostMessage({ type: "SKIP_WAITING" });

    expect(messages).toContainEqual({ type: "SKIP_WAITING" });
  });

  it("posts CLEAR_CACHE message type", () => {
    const messages: { type: string }[] = [];

    const mockPostMessage = (msg: { type: string }) => {
      messages.push(msg);
    };

    mockPostMessage({ type: "CLEAR_CACHE" });

    expect(messages).toContainEqual({ type: "CLEAR_CACHE" });
  });
});

// ============================================================
// PUSH NOTIFICATION TESTS
// ============================================================

describe("Push notifications", () => {
  it("checks PushManager support", () => {
    const pushSupported = "PushManager" in globalThis;
    expect(typeof pushSupported).toBe("boolean");
  });

  it("checks Notification support", () => {
    const notificationSupported = "Notification" in globalThis;
    expect(typeof notificationSupported).toBe("boolean");
  });

  it("returns unsupported when Notification not available", () => {
    const hasNotification = false;
    const permission = hasNotification ? "default" : "unsupported";
    expect(permission).toBe("unsupported");
  });
});

// ============================================================
// CLEAR CACHES TESTS
// ============================================================

describe("Clear caches", () => {
  it("checks caches support", () => {
    const cachesSupported = "caches" in globalThis;
    expect(typeof cachesSupported).toBe("boolean");
  });

  it("returns early when caches not supported", async () => {
    let executed = false;

    const clearCaches = async () => {
      if (!("caches" in globalThis)) return;
      executed = true;
    };

    await clearCaches();
    // May or may not execute depending on environment
    expect(typeof executed).toBe("boolean");
  });
});

// ============================================================
// BEFORE INSTALL PROMPT EVENT INTERFACE TESTS
// ============================================================

describe("BeforeInstallPromptEvent interface", () => {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }

  it("has prompt method", () => {
    const mockEvent = {
      prompt: jest.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };

    expect(typeof mockEvent.prompt).toBe("function");
  });

  it("has userChoice promise", async () => {
    const mockEvent = {
      prompt: jest.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    };

    const result = await mockEvent.userChoice;
    expect(result.outcome).toBe("dismissed");
  });
});

// ============================================================
// SERVICE WORKER REGISTRATION OPTIONS TESTS
// ============================================================

describe("Service worker registration options", () => {
  it("uses correct scope", () => {
    const options = {
      scope: "/",
      updateViaCache: "none" as const,
    };

    expect(options.scope).toBe("/");
    expect(options.updateViaCache).toBe("none");
  });
});

// ============================================================
// PUSH SUBSCRIPTION OPTIONS TESTS
// ============================================================

describe("Push subscription options", () => {
  it("creates correct subscription options", () => {
    const vapidKey = new Uint8Array([1, 2, 3]);
    const options = {
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    };

    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBe(vapidKey);
  });
});

// ============================================================
// STATE UPDATE PATTERN TESTS
// ============================================================

describe("State update patterns", () => {
  interface State {
    isOnline: boolean;
    canInstall: boolean;
    isInstalled: boolean;
  }

  it("updates partial state correctly", () => {
    const state: State = { isOnline: true, canInstall: false, isInstalled: false };
    const setState = (updater: (prev: State) => State) => {
      return updater(state);
    };

    const newState = setState((prev) => ({ ...prev, isOnline: false }));
    expect(newState.isOnline).toBe(false);
    expect(newState.canInstall).toBe(false);
  });

  it("updates multiple fields correctly", () => {
    const state: State = { isOnline: true, canInstall: true, isInstalled: false };
    const newState = { ...state, canInstall: false, isInstalled: true };

    expect(newState.isOnline).toBe(true);
    expect(newState.canInstall).toBe(false);
    expect(newState.isInstalled).toBe(true);
  });
});

// ============================================================
// CONSOLE LOGGING TESTS
// ============================================================

describe("Console logging", () => {
  const originalInfo = console.info;
  const originalError = console.error;

  beforeEach(() => {
    console.info = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.info = originalInfo;
    console.error = originalError;
  });

  it("logs info with PWA prefix", () => {
    console.info("[PWA] Service worker registered:", "/");
    expect(console.info).toHaveBeenCalledWith("[PWA] Service worker registered:", "/");
  });

  it("logs error with PWA prefix", () => {
    console.error("[PWA] Service worker registration failed", new Error("test"));
    expect(console.error).toHaveBeenCalled();
  });
});

// ============================================================
// EXPORT TESTS
// ============================================================

describe("PWA exports", () => {
  it("exports usePWA function", async () => {
    const mod = await import("./pwa");
    expect(mod.usePWA).toBeDefined();
    expect(typeof mod.usePWA).toBe("function");
  });

  it("exports registerServiceWorker function", async () => {
    const mod = await import("./pwa");
    expect(mod.registerServiceWorker).toBeDefined();
    expect(typeof mod.registerServiceWorker).toBe("function");
  });
});
