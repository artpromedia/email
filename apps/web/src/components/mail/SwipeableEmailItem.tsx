"use client";

/**
 * Swipeable Email Item Component
 * Touch-enabled swipe gestures for mobile email actions
 *
 * Swipe Actions:
 * - Swipe left: Delete (red)
 * - Swipe right: Archive (green)
 * - Partial swipe: Reveal action, release to cancel
 * - Full swipe: Execute action immediately
 */

import { useState, useRef, useCallback, type ReactNode, type TouchEvent } from "react";
import { Archive, Trash2, Mail, Star, MailOpen } from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

export type SwipeAction = "archive" | "delete" | "markRead" | "markUnread" | "star";

interface SwipeActionConfig {
  icon: ReactNode;
  label: string;
  color: string;
  bgColor: string;
}

interface SwipeableEmailItemProps {
  /** Child content to render */
  children: ReactNode;
  /** Email ID for actions */
  emailId: string;
  /** Whether the email is read */
  isRead?: boolean;
  /** Whether the email is starred */
  isStarred?: boolean;
  /** Callback when archive is triggered */
  onArchive?: (emailId: string) => void;
  /** Callback when delete is triggered */
  onDelete?: (emailId: string) => void;
  /** Callback when mark read/unread is triggered */
  onToggleRead?: (emailId: string) => void;
  /** Callback when star is triggered */
  onStar?: (emailId: string) => void;
  /** Whether swipe is enabled */
  enabled?: boolean;
  /** Threshold for triggering action (px) */
  threshold?: number;
  /** Class name */
  className?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const SWIPE_ACTIONS: Record<SwipeAction, SwipeActionConfig> = {
  archive: {
    icon: <Archive className="h-6 w-6" />,
    label: "Archive",
    color: "text-white",
    bgColor: "bg-green-500",
  },
  delete: {
    icon: <Trash2 className="h-6 w-6" />,
    label: "Delete",
    color: "text-white",
    bgColor: "bg-red-500",
  },
  markRead: {
    icon: <MailOpen className="h-6 w-6" />,
    label: "Mark read",
    color: "text-white",
    bgColor: "bg-blue-500",
  },
  markUnread: {
    icon: <Mail className="h-6 w-6" />,
    label: "Mark unread",
    color: "text-white",
    bgColor: "bg-blue-500",
  },
  star: {
    icon: <Star className="h-6 w-6" />,
    label: "Star",
    color: "text-white",
    bgColor: "bg-yellow-500",
  },
};

const DEFAULT_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;

// ============================================================
// ACTION BACKGROUND COMPONENT
// ============================================================

interface ActionBackgroundProps {
  action: SwipeAction;
  progress: number;
  direction: "left" | "right";
}

function ActionBackground({ action, progress, direction }: ActionBackgroundProps) {
  const config = SWIPE_ACTIONS[action];
  const isTriggered = progress >= 1;

  return (
    <div
      className={cn(
        "absolute inset-y-0 flex items-center transition-all",
        config.bgColor,
        direction === "left" ? "right-0 justify-end pr-6" : "left-0 justify-start pl-6"
      )}
      style={{
        width: `${Math.abs(progress) * 100}%`,
        minWidth: "80px",
        opacity: Math.min(1, Math.abs(progress) * 2),
      }}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-1 transition-transform",
          config.color,
          isTriggered && "scale-110"
        )}
      >
        {config.icon}
        <span className="text-xs font-medium">{config.label}</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SwipeableEmailItem({
  children,
  emailId,
  _isRead = true,
  _isStarred = false,
  onArchive,
  onDelete,
  onToggleRead,
  onStar,
  enabled = true,
  threshold = DEFAULT_THRESHOLD,
  className,
}: SwipeableEmailItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine which action based on swipe direction
  const getActionForDirection = useCallback((direction: "left" | "right"): SwipeAction => {
    if (direction === "left") {
      return "delete";
    } else {
      return "archive";
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      if (!touch) return;

      startX.current = touch.clientX;
      startY.current = touch.clientY;
      startTime.current = Date.now();
      isHorizontalSwipe.current = null;
      setIsDragging(true);
    },
    [enabled]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !isDragging) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // Determine if horizontal or vertical swipe on first significant move
      if (isHorizontalSwipe.current === null) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
        return;
      }

      // Only handle horizontal swipes
      if (!isHorizontalSwipe.current) {
        return;
      }

      // Prevent vertical scrolling during horizontal swipe
      e.preventDefault();

      // Apply resistance at edges
      const resistance = 0.5;
      const maxOffset = threshold * 1.5;
      let newOffset = deltaX;

      if (Math.abs(newOffset) > threshold) {
        const excess = Math.abs(newOffset) - threshold;
        newOffset = (threshold + excess * resistance) * (newOffset > 0 ? 1 : -1);
      }

      // Clamp to max
      newOffset = Math.max(-maxOffset, Math.min(maxOffset, newOffset));

      setOffsetX(newOffset);
    },
    [enabled, isDragging, threshold]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    const deltaTime = Date.now() - startTime.current;
    const velocity = Math.abs(offsetX) / deltaTime;
    const shouldTrigger = Math.abs(offsetX) >= threshold || velocity >= VELOCITY_THRESHOLD;

    if (shouldTrigger && Math.abs(offsetX) > 20) {
      const direction = offsetX > 0 ? "right" : "left";
      const action = getActionForDirection(direction);

      // Animate out
      const finalOffset = direction === "left" ? -window.innerWidth : window.innerWidth;
      setOffsetX(finalOffset);

      // Execute action after animation
      setTimeout(() => {
        switch (action) {
          case "archive":
            onArchive?.(emailId);
            break;
          case "delete":
            onDelete?.(emailId);
            break;
          case "markRead":
          case "markUnread":
            onToggleRead?.(emailId);
            break;
          case "star":
            onStar?.(emailId);
            break;
        }
        setOffsetX(0);
      }, 200);
    } else {
      // Snap back
      setOffsetX(0);
    }

    setIsDragging(false);
    isHorizontalSwipe.current = null;
  }, [
    isDragging,
    offsetX,
    threshold,
    emailId,
    getActionForDirection,
    onArchive,
    onDelete,
    onToggleRead,
    onStar,
  ]);

  // Calculate progress for visual feedback
  const progress = Math.abs(offsetX) / threshold;
  const direction = offsetX > 0 ? "right" : "left";
  const _currentAction = getActionForDirection(direction);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Background action indicators */}
      {offsetX !== 0 && (
        <>
          {offsetX > 0 && (
            <ActionBackground
              action={getActionForDirection("right")}
              progress={progress}
              direction="right"
            />
          )}
          {offsetX < 0 && (
            <ActionBackground
              action={getActionForDirection("left")}
              progress={progress}
              direction="left"
            />
          )}
        </>
      )}

      {/* Content */}
      <div
        className={cn(
          "relative bg-white dark:bg-neutral-900",
          isDragging ? "transition-none" : "transition-transform duration-200"
        )}
        style={{
          transform: `translateX(${offsetX}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// HOOK FOR DETECTING TOUCH DEVICE
// ============================================================

export function useIsTouchDevice() {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export default SwipeableEmailItem;
