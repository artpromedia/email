"use client";

/**
 * Countdown Toast Component
 * Special toast with countdown timer for undo send feature
 */

import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@email/ui";

export interface CountdownToastProps {
  /** Duration in seconds */
  duration: number;
  /** Message to display */
  message: string;
  /** Callback when countdown completes */
  onComplete: () => void;
  /** Callback when user clicks undo */
  onUndo: () => void;
  /** Optional callback when toast is dismissed */
  onDismiss?: () => void;
  /** Unique identifier for this toast */
  id: string | number;
}

export function CountdownToast({
  duration,
  message,
  onComplete,
  onUndo,
  onDismiss,
  id,
}: Readonly<CountdownToastProps>) {
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [isVisible, setIsVisible] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    // Start countdown
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onComplete]);

  const handleUndo = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    hasCompletedRef.current = true;
    onUndo();
    setIsVisible(false);
  };

  const handleDismiss = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    onDismiss?.();
    setIsVisible(false);
  };

  const progress = ((duration - secondsLeft) / duration) * 100;

  if (!isVisible) {
    return null;
  }

  return (
    <div
      data-toast-id={id}
      className={cn(
        "relative flex items-center gap-3 p-4 pr-8",
        "bg-white dark:bg-neutral-900",
        "border border-neutral-200 dark:border-neutral-800",
        "rounded-lg shadow-lg",
        "min-w-[320px] max-w-[420px]",
        "animate-in slide-in-from-bottom-2 fade-in"
      )}
    >
      {/* Progress bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-1",
          "bg-blue-500 transition-all duration-1000 ease-linear",
          "rounded-b-lg"
        )}
        style={{ width: `${progress}%` }}
      />

      {/* Content */}
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{message}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Sending in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
        </p>
      </div>

      {/* Undo button */}
      <button
        onClick={handleUndo}
        className={cn(
          "px-3 py-1.5 text-xs font-medium",
          "bg-blue-500 text-white",
          "hover:bg-blue-600",
          "rounded transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-400"
        )}
      >
        Undo
      </button>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className={cn(
          "absolute right-2 top-2",
          "rounded-sm p-1",
          "text-neutral-400 hover:text-neutral-600",
          "dark:text-neutral-500 dark:hover:text-neutral-300",
          "transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-neutral-400"
        )}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Hook to manage countdown toast state
 */
export function useCountdownToast() {
  const [activeToast, setActiveToast] = useState<{
    id: string | number;
    emailId: string;
    duration: number;
    message: string;
    onComplete: () => void;
    onUndo: () => void;
  } | null>(null);

  const showCountdownToast = (config: {
    id: string | number;
    emailId: string;
    duration: number;
    message: string;
    onComplete: () => void;
    onUndo: () => void;
  }) => {
    setActiveToast(config);
  };

  const dismissToast = () => {
    setActiveToast(null);
  };

  return {
    activeToast,
    showCountdownToast,
    dismissToast,
  };
}
