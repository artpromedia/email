"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X, Mail, Calendar, FileText, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface FABAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  color?: "primary" | "secondary" | "destructive";
}

interface FloatingActionButtonProps {
  /** Primary action (default: compose email) */
  primaryAction?: {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
  };
  /** Additional quick actions (shown on long press or expand) */
  secondaryActions?: FABAction[];
  /** Whether the FAB is visible */
  visible?: boolean;
  /** Position from bottom (accounts for bottom nav) */
  offsetBottom?: number;
  /** Optional additional CSS classes */
  className?: string;
  /** Whether FAB is in expanded state */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OFFSET_BOTTOM = 80; // Accounts for bottom nav + safe area

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to detect scroll direction for FAB visibility
 */
function useScrollVisibility(threshold = 50) {
  const [isVisible, setIsVisible] = React.useState(true);
  const lastScrollY = React.useRef(0);
  const ticking = React.useRef(false);

  React.useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const difference = currentScrollY - lastScrollY.current;

          // Only change visibility after significant scroll
          if (Math.abs(difference) > threshold) {
            setIsVisible(difference < 0 || currentScrollY < 100);
            lastScrollY.current = currentScrollY;
          }

          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return isVisible;
}

// ============================================================================
// Components
// ============================================================================

interface FABSecondaryButtonProps {
  action: FABAction;
  index: number;
  isVisible: boolean;
}

function FABSecondaryButton({ action, index, isVisible }: FABSecondaryButtonProps) {
  const Icon = action.icon;

  return (
    <div
      className={cn(
        "absolute right-0 flex items-center gap-2 transition-all duration-200",
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      )}
      style={{
        bottom: `${(index + 1) * 56 + 8}px`,
        transitionDelay: isVisible ? `${index * 50}ms` : "0ms",
      }}
    >
      {/* Label tooltip */}
      <span
        className={cn(
          "rounded-lg bg-popover px-3 py-1.5 text-sm font-medium shadow-lg",
          "whitespace-nowrap text-popover-foreground"
        )}
      >
        {action.label}
      </span>
      {/* Mini FAB */}
      <button
        type="button"
        onClick={action.onClick}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
          "transition-transform active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          action.color === "destructive"
            ? "bg-destructive text-destructive-foreground focus-visible:ring-destructive"
            : action.color === "secondary"
              ? "bg-secondary text-secondary-foreground focus-visible:ring-secondary"
              : "bg-primary text-primary-foreground focus-visible:ring-primary"
        )}
        aria-label={action.label}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Floating Action Button for mobile compose and quick actions
 *
 * Features:
 * - Primary compose action on tap
 * - Expandable menu for secondary actions
 * - Auto-hides on scroll down
 * - Respects reduced motion preferences
 * - Touch-optimized 56x56 target size
 * - Safe area aware positioning
 *
 * @example
 * ```tsx
 * <FloatingActionButton
 *   primaryAction={{
 *     label: "Compose",
 *     icon: Pencil,
 *     onClick: () => router.push("/mail/compose"),
 *   }}
 *   secondaryActions={[
 *     { id: "meeting", label: "Schedule meeting", icon: Calendar, onClick: () => {} },
 *     { id: "template", label: "Use template", icon: FileText, onClick: () => {} },
 *   ]}
 * />
 * ```
 */
export function FloatingActionButton({
  primaryAction,
  secondaryActions = [],
  visible = true,
  offsetBottom = DEFAULT_OFFSET_BOTTOM,
  className,
  expanded: controlledExpanded,
  onExpandedChange,
}: FloatingActionButtonProps) {
  const router = useRouter();
  const scrollVisible = useScrollVisibility();
  const [internalExpanded, setInternalExpanded] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Support both controlled and uncontrolled modes
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (value: boolean) => {
    setInternalExpanded(value);
    onExpandedChange?.(value);
  };

  // Default primary action is compose
  const primary = primaryAction ?? {
    label: "Compose email",
    icon: Pencil,
    onClick: () => router.push("/mail/compose"),
  };

  const PrimaryIcon = expanded ? X : primary.icon;
  const shouldShow = visible && scrollVisible;
  const hasSecondary = secondaryActions.length > 0;

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded, setExpanded]);

  // Close menu on escape
  React.useEffect(() => {
    if (!expanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [expanded, setExpanded]);

  const handlePrimaryClick = () => {
    if (hasSecondary) {
      // If expanded, close. If closed, execute primary action
      if (expanded) {
        setExpanded(false);
      } else {
        primary.onClick();
      }
    } else {
      primary.onClick();
    }
  };

  const handleLongPress = () => {
    if (hasSecondary) {
      setExpanded(true);
    }
  };

  // Long press detection
  const pressTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleTouchStart = () => {
    pressTimer.current = setTimeout(handleLongPress, 500);
  };

  const handleTouchEnd = () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref.current can be undefined at runtime
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        // Only show on mobile
        "md:hidden",
        // Fixed positioning
        "fixed right-4 z-50",
        // Transitions
        "transition-all duration-300",
        shouldShow ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
        className
      )}
      style={{
        bottom: `calc(${offsetBottom}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {/* Backdrop when expanded */}
      {expanded && <div className="fixed inset-0 -z-10 bg-black/20" aria-hidden="true" />}

      {/* Secondary action buttons */}
      {hasSecondary &&
        secondaryActions.map((action, index) => (
          <FABSecondaryButton
            key={action.id}
            action={{
              ...action,
              onClick: () => {
                action.onClick();
                setExpanded(false);
              },
            }}
            index={index}
            isVisible={expanded}
          />
        ))}

      {/* Primary FAB */}
      <button
        type="button"
        onClick={handlePrimaryClick}
        onTouchStart={hasSecondary ? handleTouchStart : undefined}
        onTouchEnd={hasSecondary ? handleTouchEnd : undefined}
        onTouchCancel={hasSecondary ? handleTouchEnd : undefined}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full shadow-xl",
          "bg-primary text-primary-foreground",
          "transition-all duration-200",
          "active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          expanded && "rotate-45 bg-muted text-muted-foreground"
        )}
        aria-label={expanded ? "Close menu" : primary.label}
        aria-expanded={hasSecondary ? expanded : undefined}
        aria-haspopup={hasSecondary ? "menu" : undefined}
      >
        <PrimaryIcon
          className={cn("h-6 w-6 transition-transform", expanded && "-rotate-45")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

// ============================================================================
// Pre-configured FAB for email compose
// ============================================================================

interface ComposeFloatingButtonProps {
  /** Additional quick actions */
  quickActions?: FABAction[];
  /** Custom compose handler */
  onCompose?: () => void;
  /** Custom className */
  className?: string;
}

/**
 * Pre-configured FAB for email compose with common quick actions
 */
export function ComposeFloatingButton({
  quickActions,
  onCompose,
  className,
}: ComposeFloatingButtonProps) {
  const router = useRouter();

  const defaultQuickActions: FABAction[] = [
    {
      id: "schedule",
      label: "Schedule meeting",
      icon: Calendar,
      onClick: () => router.push("/calendar/new"),
    },
    {
      id: "template",
      label: "Use template",
      icon: FileText,
      onClick: () => router.push("/mail/compose?template=true"),
    },
    {
      id: "new-mail",
      label: "New email",
      icon: Mail,
      onClick: onCompose ?? (() => router.push("/mail/compose")),
    },
  ];

  return (
    <FloatingActionButton
      primaryAction={{
        label: "Compose email",
        icon: Plus,
        onClick: onCompose ?? (() => router.push("/mail/compose")),
      }}
      secondaryActions={quickActions ?? defaultQuickActions}
      className={className}
    />
  );
}

export default FloatingActionButton;
