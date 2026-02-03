"use client";

/**
 * Accessibility Components and Utilities
 * Enhanced keyboard navigation and screen reader support
 *
 * Features:
 * - Skip links for keyboard navigation
 * - Focus trap for modals
 * - Live region announcements
 * - Reduced motion support
 * - High contrast detection
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@email/ui";

// ============================================================
// SKIP LINKS
// ============================================================

interface SkipLinkTarget {
  id: string;
  label: string;
}

interface SkipLinksProps {
  targets?: SkipLinkTarget[];
}

const DEFAULT_SKIP_TARGETS: SkipLinkTarget[] = [
  { id: "main-content", label: "Skip to main content" },
  { id: "navigation", label: "Skip to navigation" },
  { id: "email-list", label: "Skip to email list" },
  { id: "compose", label: "Skip to compose" },
];

export function SkipLinks({ targets = DEFAULT_SKIP_TARGETS }: SkipLinksProps) {
  return (
    <nav aria-label="Skip links" className="sr-only focus-within:not-sr-only">
      <ul className="fixed left-4 top-4 z-[9999] flex flex-col gap-2">
        {targets.map((target) => (
          <li key={target.id}>
            <a
              href={`#${target.id}`}
              className={cn(
                "block rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-lg",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "sr-only focus:not-sr-only"
              )}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(target.id);
                if (element) {
                  element.focus();
                  element.scrollIntoView({ behavior: "smooth" });
                }
              }}
            >
              {target.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ============================================================
// FOCUS TRAP
// ============================================================

interface FocusTrapProps {
  children: ReactNode;
  active?: boolean;
  returnFocus?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
}

export function FocusTrap({
  children,
  active = true,
  returnFocus = true,
  initialFocus,
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Store the previously focused element
  useEffect(() => {
    if (active) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
  }, [active]);

  // Return focus when trap is deactivated
  useEffect(() => {
    return () => {
      if (returnFocus && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [returnFocus]);

  // Set initial focus
  useEffect(() => {
    if (!active) return;

    if (initialFocus?.current) {
      initialFocus.current.focus();
    } else {
      // Focus first focusable element
      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  }, [active, initialFocus]);

  // Handle tab key to trap focus
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return (
    <div ref={containerRef} data-focus-trap={active ? "true" : "false"}>
      {children}
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  const focusableSelectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
  );
}

// ============================================================
// LIVE REGION / ANNOUNCER
// ============================================================

interface AnnouncerContextType {
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

const AnnouncerContext = createContext<AnnouncerContextType | null>(null);

export function useAnnouncer() {
  const context = useContext(AnnouncerContext);
  if (!context) {
    throw new Error("useAnnouncer must be used within an AnnouncerProvider");
  }
  return context;
}

interface AnnouncerProviderProps {
  children: ReactNode;
}

export function AnnouncerProvider({ children }: AnnouncerProviderProps) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    if (priority === "assertive") {
      setAssertiveMessage("");
      // Small delay to ensure screen readers pick up the change
      setTimeout(() => setAssertiveMessage(message), 50);
    } else {
      setPoliteMessage("");
      setTimeout(() => setPoliteMessage(message), 50);
    }
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      {/* Polite live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {politeMessage}
      </div>
      {/* Assertive live region */}
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
}

// ============================================================
// REDUCED MOTION HOOK
// ============================================================

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}

// ============================================================
// HIGH CONTRAST HOOK
// ============================================================

export function useHighContrast(): boolean {
  const [highContrast, setHighContrast] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(forced-colors: active)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(forced-colors: active)");

    const handleChange = (e: MediaQueryListEvent) => {
      setHighContrast(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return highContrast;
}

// ============================================================
// KEYBOARD NAVIGATION INDICATOR
// ============================================================

export function useKeyboardNavigation(): boolean {
  const [isKeyboardUser, setIsKeyboardUser] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setIsKeyboardUser(true);
      }
    };

    const handleMouseDown = () => {
      setIsKeyboardUser(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  return isKeyboardUser;
}

// ============================================================
// VISUALLY HIDDEN (SR-ONLY)
// ============================================================

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

export function VisuallyHidden({ children, as: Component = "span" }: VisuallyHiddenProps) {
  return <Component className="sr-only">{children}</Component>;
}

// ============================================================
// FOCUS VISIBLE RING
// ============================================================

interface FocusRingProps {
  children: ReactNode;
  className?: string;
  ringClassName?: string;
}

export function FocusRing({ children, className, ringClassName }: FocusRingProps) {
  return (
    <div
      className={cn(
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2",
        ringClassName ?? "focus-within:ring-primary",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// ROVING TABINDEX HOOK
// ============================================================

interface UseRovingTabIndexOptions {
  /** Container ref */
  containerRef: React.RefObject<HTMLElement>;
  /** Item selector */
  itemSelector?: string;
  /** Whether to loop at ends */
  loop?: boolean;
  /** Orientation for arrow key navigation */
  orientation?: "horizontal" | "vertical" | "both";
  /** Initial focused index */
  initialIndex?: number;
}

export function useRovingTabIndex({
  containerRef,
  itemSelector = '[role="option"], [role="menuitem"], [role="tab"]',
  loop: loopEnabled = true,
  orientation = "vertical",
  initialIndex = 0,
}: UseRovingTabIndexOptions) {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  const getItems = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(itemSelector));
  }, [containerRef, itemSelector]);

  const focusItem = useCallback(
    (index: number) => {
      const items = getItems();
      if (items.length === 0) return;

      let newIndex = index;

      if (loopEnabled) {
        newIndex = ((index % items.length) + items.length) % items.length;
      } else {
        newIndex = Math.max(0, Math.min(index, items.length - 1));
      }

      setFocusedIndex(newIndex);
      items[newIndex]?.focus();
    },
    [getItems, loopEnabled]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) return;

      const isHorizontal = orientation === "horizontal" || orientation === "both";
      const isVertical = orientation === "vertical" || orientation === "both";

      switch (e.key) {
        case "ArrowDown":
          if (isVertical) {
            e.preventDefault();
            focusItem(focusedIndex + 1);
          }
          break;
        case "ArrowUp":
          if (isVertical) {
            e.preventDefault();
            focusItem(focusedIndex - 1);
          }
          break;
        case "ArrowRight":
          if (isHorizontal) {
            e.preventDefault();
            focusItem(focusedIndex + 1);
          }
          break;
        case "ArrowLeft":
          if (isHorizontal) {
            e.preventDefault();
            focusItem(focusedIndex - 1);
          }
          break;
        case "Home":
          e.preventDefault();
          focusItem(0);
          break;
        case "End":
          e.preventDefault();
          focusItem(items.length - 1);
          break;
      }
    },
    [focusItem, focusedIndex, getItems, orientation]
  );

  useEffect(() => {
    const container = containerRef.current;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!container) return;

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, handleKeyDown]);

  return {
    focusedIndex,
    focusItem,
    getTabIndex: (index: number) => (index === focusedIndex ? 0 : -1),
  };
}

// ============================================================
// ACCESSIBLE DIALOG
// ============================================================

interface AccessibleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function AccessibleDialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}: AccessibleDialogProps) {
  const titleId = `dialog-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const descriptionId = description
    ? `dialog-desc-${title.replace(/\s+/g, "-").toLowerCase()}`
    : undefined;

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Dialog content */}
      <FocusTrap active={isOpen}>
        <div
          className={cn(
            "relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-background p-6 shadow-xl",
            className
          )}
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
              {description}
            </p>
          )}
          <div className="mt-4">{children}</div>
        </div>
      </FocusTrap>
    </div>
  );
}

export default {
  SkipLinks,
  FocusTrap,
  AnnouncerProvider,
  useAnnouncer,
  useReducedMotion,
  useHighContrast,
  useKeyboardNavigation,
  VisuallyHidden,
  FocusRing,
  useRovingTabIndex,
  AccessibleDialog,
};
