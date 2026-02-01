"use client";

/**
 * Focus Trap Hook
 * Traps focus within a modal/dialog for keyboard accessibility
 * WCAG 2.1 Criterion 2.1.2: No Keyboard Trap (must be escapable)
 */

import { useEffect, useRef, useCallback } from "react";

export interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  isActive: boolean;
  /** Callback when Escape key is pressed */
  onEscape?: () => void;
  /** Initial element to focus (defaults to first focusable) */
  initialFocus?: HTMLElement | null;
  /** Whether to return focus to trigger element on close */
  returnFocus?: boolean;
}

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(", ");

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
    (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null
  );
}

/**
 * Hook to trap focus within a container element (e.g., modal, dialog)
 */
export function useFocusTrap<T extends HTMLElement>({
  isActive,
  onEscape,
  initialFocus,
  returnFocus = true,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Store the previously focused element when trap activates
  useEffect(() => {
    if (isActive && returnFocus) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
    }
  }, [isActive, returnFocus]);

  // Focus initial element when trap activates
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // Focus initial element or first focusable element
    if (initialFocus) {
      initialFocus.focus();
    } else {
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        focusableElements[0]?.focus();
      }
    }
  }, [isActive, initialFocus]);

  // Handle Tab key to trap focus
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive || !containerRef.current) return;

      const container = containerRef.current;

      // Handle Escape key
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }

      // Handle Tab key
      if (event.key === "Tab") {
        const focusableElements = getFocusableElements(container);

        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements.at(0);
        const lastElement = focusableElements.at(-1);
        const activeElement = document.activeElement as HTMLElement;

        // Shift + Tab on first element -> focus last element
        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
        // Tab on last element -> focus first element
        else if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [isActive, onEscape]
  );

  // Attach/detach event listener
  useEffect(() => {
    if (isActive) {
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);

        // Return focus to previously focused element
        if (returnFocus && previouslyFocusedElement.current) {
          previouslyFocusedElement.current.focus();
        }
      };
    }
    return undefined;
  }, [isActive, handleKeyDown, returnFocus]);

  return containerRef;
}

/**
 * Example usage:
 *
 * function Modal({ isOpen, onClose }) {
 *   const modalRef = useFocusTrap<HTMLDivElement>({
 *     isActive: isOpen,
 *     onEscape: onClose,
 *     returnFocus: true,
 *   });
 *
 *   if (!isOpen) return null;
 *
 *   return (
 *     <div ref={modalRef} role="dialog" aria-modal="true">
 *       <button onClick={onClose}>Close</button>
 *       <input type="text" />
 *     </div>
 *   );
 * }
 */
