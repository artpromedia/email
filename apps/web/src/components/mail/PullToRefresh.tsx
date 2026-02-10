"use client";

/**
 * Pull-to-Refresh Component
 * Mobile-friendly pull gesture to refresh email list
 *
 * Features:
 * - Touch gesture detection with threshold
 * - Visual progress indicator
 * - Smooth spring animation
 * - Haptic feedback (if supported)
 * - Accessible refresh button fallback
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { RefreshCw, ArrowDown } from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

interface PullToRefreshProps {
  /** Content to wrap with pull-to-refresh functionality */
  children: ReactNode;
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
  /** Optional className for the container */
  className?: string;
  /** Disable pull-to-refresh (for desktop or when not needed) */
  disabled?: boolean;
  /** Pull distance required to trigger refresh (default: 80px) */
  pullThreshold?: number;
  /** Maximum pull distance (default: 120px) */
  maxPullDistance?: number;
  /** Loading text (default: "Refreshing...") */
  loadingText?: string;
  /** Pull instruction text (default: "Pull to refresh") */
  pullText?: string;
  /** Release instruction text (default: "Release to refresh") */
  releaseText?: string;
}

type RefreshState = "idle" | "pulling" | "ready" | "refreshing";

// ============================================================
// PULL TO REFRESH COMPONENT
// ============================================================

export function PullToRefresh({
  children,
  onRefresh,
  className,
  disabled = false,
  pullThreshold = 80,
  maxPullDistance = 120,
  loadingText = "Refreshing...",
  pullText = "Pull to refresh",
  releaseText = "Release to refresh",
}: PullToRefreshProps) {
  const [state, setState] = useState<RefreshState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isPulling = useRef(false);

  // Check if container is at top (scrolled to top)
  const isAtTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    return container.scrollTop <= 0;
  }, []);

  // Trigger haptic feedback if available
  const triggerHaptic = useCallback(() => {
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || state === "refreshing") return;
      if (!isAtTop()) return;

      const touch = e.touches[0];
      if (!touch) return;
      startY.current = touch.clientY;
      isPulling.current = true;
    },
    [disabled, state, isAtTop]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling.current || disabled || state === "refreshing") return;
      if (!isAtTop()) {
        isPulling.current = false;
        setPullDistance(0);
        setState("idle");
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;
      currentY.current = touch.clientY;
      const deltaY = currentY.current - startY.current;

      // Only handle downward pulls
      if (deltaY <= 0) {
        isPulling.current = false;
        setPullDistance(0);
        setState("idle");
        return;
      }

      // Prevent default to stop overscroll
      e.preventDefault();

      // Apply resistance - pull gets harder as you go
      const resistance = 0.5;
      const rawPull = deltaY * resistance;
      const cappedPull = Math.min(rawPull, maxPullDistance);

      setPullDistance(cappedPull);

      // Update state based on pull distance
      if (cappedPull >= pullThreshold) {
        if (state !== "ready") {
          triggerHaptic();
          setState("ready");
        }
      } else {
        setState("pulling");
      }
    },
    [disabled, state, isAtTop, pullThreshold, maxPullDistance, triggerHaptic]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) return;

    isPulling.current = false;

    if (state === "ready") {
      // Trigger refresh
      setState("refreshing");
      setPullDistance(pullThreshold * 0.75); // Keep some visual indication
      triggerHaptic();

      try {
        await onRefresh();
      } catch (error) {
        console.error("Refresh failed:", error);
      } finally {
        // Animate back
        setPullDistance(0);
        setState("idle");
      }
    } else {
      // Snap back
      setPullDistance(0);
      setState("idle");
    }
  }, [disabled, state, onRefresh, pullThreshold, triggerHaptic]);

  // Attach touch listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  // Get status text
  const getStatusText = () => {
    switch (state) {
      case "pulling":
        return pullText;
      case "ready":
        return releaseText;
      case "refreshing":
        return loadingText;
      default:
        return "";
    }
  };

  // Calculate progress (0-1)
  const progress = Math.min(pullDistance / pullThreshold, 1);

  // Calculate icon rotation
  const iconRotation = state === "ready" ? 180 : progress * 180;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto overflow-x-hidden", className)}
      style={{ touchAction: disabled ? "auto" : "pan-y" }}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute left-0 right-0 flex flex-col items-center justify-end transition-transform",
          "pointer-events-none z-10"
        )}
        style={{
          height: maxPullDistance,
          top: -maxPullDistance,
          transform: `translateY(${pullDistance}px)`,
          transition: state === "idle" || state === "pulling" ? "none" : "transform 0.3s ease-out",
        }}
      >
        <div className="flex flex-col items-center gap-2 pb-4">
          {/* Icon */}
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full bg-primary/10",
              state === "refreshing" && "animate-spin"
            )}
            style={{
              opacity: Math.max(progress, state === "refreshing" ? 1 : 0),
              transform: state === "refreshing" ? "none" : `rotate(${iconRotation}deg)`,
              transition: state === "refreshing" ? "none" : "transform 0.1s ease-out",
            }}
          >
            {state === "refreshing" ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <ArrowDown className="h-5 w-5 text-primary" />
            )}
          </div>

          {/* Text */}
          <span
            className="text-sm font-medium text-muted-foreground"
            style={{
              opacity: Math.max(progress * 1.5, state === "refreshing" ? 1 : 0),
            }}
          >
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: state === "idle" || state === "pulling" ? "none" : "transform 0.3s ease-out",
        }}
      >
        {children}
      </div>

      {/* Accessible refresh button (visible on focus or via screen reader) */}
      {!disabled && (
        <button
          onClick={async () => {
            if (state === "refreshing") return;
            setState("refreshing");
            try {
              await onRefresh();
            } finally {
              setState("idle");
            }
          }}
          disabled={state === "refreshing"}
          className={cn(
            "sr-only focus:not-sr-only focus:absolute focus:left-1/2 focus:top-4 focus:z-20",
            "focus:-translate-x-1/2 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2",
            "focus:text-primary-foreground focus:shadow-lg"
          )}
          aria-label={state === "refreshing" ? loadingText : "Refresh email list"}
        >
          {state === "refreshing" ? loadingText : "Refresh"}
        </button>
      )}
    </div>
  );
}

// ============================================================
// HOOK FOR CUSTOM IMPLEMENTATIONS
// ============================================================

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  pullThreshold?: number;
  maxPullDistance?: number;
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  state: RefreshState;
  progress: number;
  containerRef: React.RefObject<HTMLDivElement>;
  handleRefresh: () => Promise<void>;
}

export function usePullToRefresh({
  onRefresh,
  pullThreshold = 80,
  maxPullDistance = 120,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [state, setState] = useState<RefreshState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const isPulling = useRef(false);

  const isAtTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    return container.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || state === "refreshing" || !isAtTop()) return;
      const touch = e.touches[0];
      if (!touch) return;
      startY.current = touch.clientY;
      isPulling.current = true;
    },
    [disabled, state, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling.current || disabled || state === "refreshing" || !isAtTop()) {
        isPulling.current = false;
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY.current;
      if (deltaY <= 0) return;

      e.preventDefault();
      const cappedPull = Math.min(deltaY * 0.5, maxPullDistance);
      setPullDistance(cappedPull);
      setState(cappedPull >= pullThreshold ? "ready" : "pulling");
    },
    [disabled, state, isAtTop, pullThreshold, maxPullDistance]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) return;
    isPulling.current = false;

    if (state === "ready") {
      setState("refreshing");
      setPullDistance(pullThreshold * 0.75);
      try {
        await onRefresh();
      } finally {
        setPullDistance(0);
        setState("idle");
      }
    } else {
      setPullDistance(0);
      setState("idle");
    }
  }, [disabled, state, onRefresh, pullThreshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  const handleRefresh = useCallback(async () => {
    if (state === "refreshing") return;
    setState("refreshing");
    try {
      await onRefresh();
    } finally {
      setState("idle");
    }
  }, [state, onRefresh]);

  return {
    pullDistance,
    state,
    progress: Math.min(pullDistance / pullThreshold, 1),
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    handleRefresh,
  };
}

export default PullToRefresh;
