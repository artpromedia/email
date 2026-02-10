/**
 * Undo Send Hook
 * Manages delayed email sending with undo capability
 */

import { useState, useCallback, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useScheduleDelayedSend, type PendingEmail } from "./compose-api";
import type { SendEmailRequest } from "./types";

export interface UndoSendSettings {
  /** Delay in seconds before sending (5-30) */
  delaySeconds: number;
  /** Whether undo send is enabled */
  enabled: boolean;
}

const DEFAULT_SETTINGS: UndoSendSettings = {
  delaySeconds: 5,
  enabled: true,
};

/**
 * Hook to manage undo send feature
 */
export function useUndoSend(settings: UndoSendSettings = DEFAULT_SETTINGS) {
  const [activePendingEmails, setActivePendingEmails] = useState<Set<string>>(new Set());
  const delayedSend = useScheduleDelayedSend();

  /**
   * Send an email with undo capability
   */
  const sendWithUndo = useCallback(
    (
      request: SendEmailRequest,
      options?: {
        onSuccess?: (response: { emailId: string; messageId: string }) => void;
        onError?: (error: Error) => void;
        onUndo?: () => void;
      }
    ) => {
      const { onSuccess, onError, onUndo } = options ?? {};

      // Generate unique ID for this pending email
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Add to active pending emails
      setActivePendingEmails((prev) => new Set(prev).add(pendingId));

      // Get recipient for toast message
      let recipientDisplay: string;
      const firstRecipient = request.to[0] ?? "recipient";
      if (request.to.length === 1) {
        recipientDisplay = firstRecipient;
      } else if (request.to.length === 2) {
        recipientDisplay = `${firstRecipient} and 1 other`;
      } else {
        recipientDisplay = `${firstRecipient} and ${request.to.length - 1} others`;
      }

      // Show countdown toast
      let toastId: string | number | undefined;
      const showToast = () => {
        toastId = toast.custom(
          <CountdownToastContent
            duration={settings.delaySeconds}
            message={`Sending to ${recipientDisplay}`}
            onComplete={() => {
              // This should not be called as we handle completion in scheduleEmail
              toast.dismiss(toastId);
            }}
            onUndo={() => {
              const cancelled = delayedSend.cancelEmail(pendingId);
              if (cancelled) {
                setActivePendingEmails((prev) => {
                  const next = new Set(prev);
                  next.delete(pendingId);
                  return next;
                });
                toast.dismiss(toastId);
                toast.success("Send cancelled");
                onUndo?.();
              }
            }}
          />,
          {
            duration: (settings.delaySeconds + 1) * 1000,
          }
        );
      };

      showToast();

      // Schedule the email
      delayedSend.scheduleEmail(
        pendingId,
        request,
        settings.delaySeconds,
        (response) => {
          // Success - remove from pending
          setActivePendingEmails((prev) => {
            const next = new Set(prev);
            next.delete(pendingId);
            return next;
          });
          toast.dismiss(toastId);
          toast.emailSent(recipientDisplay);
          onSuccess?.(response);
        },
        (error) => {
          // Error - remove from pending
          setActivePendingEmails((prev) => {
            const next = new Set(prev);
            next.delete(pendingId);
            return next;
          });
          toast.dismiss(toastId);
          toast.emailFailed(error.message);
          onError?.(error);
        }
      );

      return pendingId;
    },
    [settings.delaySeconds, delayedSend]
  );

  /**
   * Cancel a pending email (undo)
   */
  const cancelPendingEmail = useCallback(
    (pendingId: string) => {
      const cancelled = delayedSend.cancelEmail(pendingId);
      if (cancelled) {
        setActivePendingEmails((prev) => {
          const next = new Set(prev);
          next.delete(pendingId);
          return next;
        });
      }
      return cancelled;
    },
    [delayedSend]
  );

  /**
   * Get all pending emails
   */
  const getPendingEmails = useCallback((): PendingEmail[] => {
    return delayedSend.getAllPendingEmails();
  }, [delayedSend]);

  return {
    sendWithUndo,
    cancelPendingEmail,
    getPendingEmails,
    activePendingEmails: Array.from(activePendingEmails),
    hasPendingEmails: activePendingEmails.size > 0,
  };
}

/**
 * Internal component for countdown toast content
 */
function CountdownToastContent({
  duration,
  message,
  onComplete,
  onUndo,
}: Readonly<{
  duration: number;
  message: string;
  onComplete: () => void;
  onUndo: () => void;
}>) {
  const [secondsLeft, setSecondsLeft] = useState(duration);

  // Countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onComplete]);

  const progress = ((duration - secondsLeft) / duration) * 100;

  return (
    <div className="relative flex min-w-[320px] items-center gap-3">
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg bg-blue-500 transition-all duration-1000 ease-linear"
        style={{ width: `${progress}%` }}
      />

      {/* Content */}
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">{message}</p>
        <p className="text-xs text-neutral-500">
          Sending in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
        </p>
      </div>

      {/* Undo button */}
      <button
        onClick={onUndo}
        className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        Undo
      </button>
    </div>
  );
}

/**
 * Hook to get/set undo send settings from user preferences
 */
export function useUndoSendSettings() {
  const [settings, setSettings] = useState<UndoSendSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from user preferences on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load from localStorage first (immediate)
        const stored = localStorage.getItem("undo-send-settings");
        if (stored) {
          setSettings(JSON.parse(stored) as UndoSendSettings);
        }

        // Then sync with API (for cross-device preferences)
        // NOTE: Implement API endpoint /api/preferences/undo-send
        const response = await fetch("/api/preferences/undo-send");
        if (response.ok) {
          const apiSettings = (await response.json()) as UndoSendSettings;
          setSettings(apiSettings);
          localStorage.setItem("undo-send-settings", JSON.stringify(apiSettings));
        }
      } catch (error) {
        console.error("Failed to load undo send settings:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    void loadSettings();
  }, []);

  const updateSettings = useCallback((updates: Partial<UndoSendSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };

      // Validate delay is within bounds
      if (next.delaySeconds < 5) next.delaySeconds = 5;
      if (next.delaySeconds > 30) next.delaySeconds = 30;

      // Save to localStorage immediately
      localStorage.setItem("undo-send-settings", JSON.stringify(next));

      // Save to API in background
      // NOTE: Implement API endpoint PUT /api/preferences/undo-send
      fetch("/api/preferences/undo-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch((error: unknown) => console.error("Failed to save undo send settings:", error));

      return next;
    });
  }, []);

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
