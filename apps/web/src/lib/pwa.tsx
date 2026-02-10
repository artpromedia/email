"use client";

/**
 * PWA Utilities
 * Service worker registration and PWA state management
 */

import { useState, useEffect, useCallback } from "react";

// ============================================================
// TYPES
// ============================================================

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAState {
  /** Whether the app is installed as a PWA */
  isInstalled: boolean;
  /** Whether the app can be installed */
  canInstall: boolean;
  /** Whether the device is online */
  isOnline: boolean;
  /** Whether there's a service worker update available */
  updateAvailable: boolean;
  /** Whether service worker is active */
  isServiceWorkerActive: boolean;
  /** Whether push notifications are supported */
  pushSupported: boolean;
  /** Current push notification permission */
  pushPermission: NotificationPermission | "unsupported";
}

interface UsePWAReturn extends PWAState {
  /** Trigger the PWA install prompt */
  promptInstall: () => Promise<boolean>;
  /** Check for service worker updates */
  checkForUpdates: () => Promise<void>;
  /** Apply pending service worker update */
  applyUpdate: () => void;
  /** Request push notification permission */
  requestPushPermission: () => Promise<NotificationPermission>;
  /** Subscribe to push notifications */
  subscribeToPush: (vapidPublicKey: string) => Promise<PushSubscription | null>;
  /** Clear all caches */
  clearCaches: () => Promise<void>;
}

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.info("[PWA] Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    swRegistration = registration;

    // Check for updates on registration
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New version available
          window.dispatchEvent(new CustomEvent("sw-update-available"));
        }
      });
    });

    console.info("[PWA] Service worker registered:", registration.scope);
    return registration;
  } catch (error) {
    console.error("[PWA] Service worker registration failed", error);
    return null;
  }
}

// ============================================================
// PWA HOOK
// ============================================================

export function usePWA(): UsePWAReturn {
  const [state, setState] = useState<PWAState>({
    isInstalled: false,
    canInstall: false,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    updateAvailable: false,
    isServiceWorkerActive: false,
    pushSupported: false,
    pushPermission: "unsupported",
  });

  // Check if app is installed
  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-expect-error - iOS Safari
        window.navigator.standalone === true;

      setState((prev) => ({ ...prev, isInstalled: isStandalone }));
    };

    checkInstalled();
    window.matchMedia("(display-mode: standalone)").addEventListener("change", checkInstalled);

    return () => {
      window.matchMedia("(display-mode: standalone)").removeEventListener("change", checkInstalled);
    };
  }, []);

  // Listen for install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setState((prev) => ({ ...prev, canInstall: true }));
    };

    const handleAppInstalled = () => {
      deferredInstallPrompt = null;
      setState((prev) => ({ ...prev, canInstall: false, isInstalled: true }));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setState((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Listen for service worker updates
  useEffect(() => {
    const handleUpdateAvailable = () => {
      setState((prev) => ({ ...prev, updateAvailable: true }));
    };

    window.addEventListener("sw-update-available", handleUpdateAvailable);

    return () => {
      window.removeEventListener("sw-update-available", handleUpdateAvailable);
    };
  }, []);

  // Check service worker and push support
  useEffect(() => {
    const checkServiceWorker = async () => {
      if (!("serviceWorker" in navigator)) return;

      const registration = await navigator.serviceWorker.ready;
      setState((prev) => ({
        ...prev,
        isServiceWorkerActive: !!registration.active,
        pushSupported: "PushManager" in window,
        pushPermission: "Notification" in window ? Notification.permission : "unsupported",
      }));
    };

    void checkServiceWorker();
  }, []);

  // Prompt install
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredInstallPrompt) return false;

    try {
      await deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      setState((prev) => ({ ...prev, canInstall: false }));
      return outcome === "accepted";
    } catch (error) {
      console.error("[PWA] Install prompt failed:", error);
      return false;
    }
  }, []);

  // Check for updates
  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;

    try {
      await swRegistration.update();
    } catch (error) {
      console.error("[PWA] Update check failed:", error);
    }
  }, []);

  // Apply update
  const applyUpdate = useCallback((): void => {
    if (!swRegistration?.waiting) return;

    swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });

    // Reload after the new service worker takes over
    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  }, []);

  // Request push permission
  const requestPushPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!("Notification" in window)) return "denied";

    const permission = await Notification.requestPermission();
    setState((prev) => ({ ...prev, pushPermission: permission }));
    return permission;
  }, []);

  // Subscribe to push
  const subscribeToPush = useCallback(
    async (vapidPublicKey: string): Promise<PushSubscription | null> => {
      if (!swRegistration || !state.pushSupported) return null;

      try {
        const subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        return subscription;
      } catch (error) {
        console.error("[PWA] Push subscription failed:", error);
        return null;
      }
    },
    [state.pushSupported]
  );

  // Clear caches
  const clearCaches = useCallback(async (): Promise<void> => {
    if (!("caches" in window)) return;

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    // Notify service worker
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
    }
  }, []);

  return {
    ...state,
    promptInstall,
    checkForUpdates,
    applyUpdate,
    requestPushPermission,
    subscribeToPush,
    clearCaches,
  };
}

// ============================================================
// UTILITIES
// ============================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray as Uint8Array<ArrayBuffer>;
}

// ============================================================
// PWA UPDATE BANNER COMPONENT
// ============================================================

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function PWAUpdateBanner({ onUpdate, onDismiss }: UpdateBannerProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg bg-primary p-4 text-primary-foreground shadow-lg md:left-auto md:right-4 md:w-96">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Update available</p>
          <p className="text-sm opacity-90">A new version of the app is ready.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDismiss} className="rounded px-3 py-1 text-sm hover:bg-white/10">
            Later
          </button>
          <button
            onClick={onUpdate}
            className="rounded bg-white px-3 py-1 text-sm font-medium text-primary hover:bg-white/90"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PWA INSTALL PROMPT COMPONENT
// ============================================================

interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export function PWAInstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-background p-4 shadow-lg md:left-auto md:right-4 md:w-96">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <svg
            className="h-6 w-6 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>
        <div>
          <p className="font-medium">Install Enterprise Email</p>
          <p className="text-sm text-muted-foreground">
            Add to your home screen for quick access and offline support.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onDismiss} className="rounded-lg px-4 py-2 text-sm hover:bg-muted">
          Not now
        </button>
        <button
          onClick={onInstall}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Install
        </button>
      </div>
    </div>
  );
}

// ============================================================
// OFFLINE INDICATOR COMPONENT
// ============================================================

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-50 bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-yellow-950">
      You&apos;re offline. Some features may be limited.
    </div>
  );
}
