"use client";

/**
 * Enterprise Email - Domain Selector Component
 * Dropdown to switch between available domains
 */

import {
  forwardRef,
  useCallback,
  useId,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { useDomain } from "../../providers/DomainBrandingProvider";
import { cn } from "../../utils/cn";
// DomainBadge not used directly in this file

// ============================================================
// TYPES
// ============================================================

export interface DomainSelectorProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Called when domain selection changes */
  onChange?: (domain: string) => void;
  /** Placeholder text when no domain selected */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Show full domain instead of display name */
  showDomain?: boolean;
  /** Label for accessibility */
  label?: string;
}

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================

const sizeConfig = {
  sm: {
    trigger: "h-8 min-w-[160px] px-2 text-sm",
    dropdown: "text-sm",
    item: "h-8 px-2",
    logo: "h-4 w-4",
  },
  md: {
    trigger: "h-10 min-w-[200px] px-3 text-sm",
    dropdown: "text-sm",
    item: "h-10 px-3",
    logo: "h-5 w-5",
  },
  lg: {
    trigger: "h-12 min-w-[240px] px-4 text-base",
    dropdown: "text-base",
    item: "h-12 px-4",
    logo: "h-6 w-6",
  },
} as const;

// ============================================================
// ICONS
// ============================================================

function ChevronDownIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("h-5 w-5", className)}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("h-5 w-5", className)}
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export const DomainSelector = forwardRef<HTMLDivElement, DomainSelectorProps>(
  (
    {
      onChange,
      placeholder: _placeholder = "Select domain",
      disabled = false,
      size = "md",
      showDomain = false,
      label = "Select domain",
      className,
      ...props
    },
    ref
  ) => {
    const id = useId();
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    const { activeDomain, availableDomains, switchDomain, getBrandingForDomain } = useDomain();

    const config = sizeConfig[size];
    const activeBranding = getBrandingForDomain(activeDomain);

    const handleSelect = useCallback(
      (domain: string) => {
        switchDomain(domain);
        onChange?.(domain);
        setIsOpen(false);
        setFocusedIndex(-1);
      },
      [switchDomain, onChange]
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (disabled) return;

        switch (e.key) {
          case "Enter":
          case " ":
            e.preventDefault();
            if (isOpen && focusedIndex >= 0) {
              const domain = availableDomains[focusedIndex];
              if (domain) {
                handleSelect(domain);
              }
            } else {
              setIsOpen(!isOpen);
            }
            break;
          case "Escape":
            setIsOpen(false);
            setFocusedIndex(-1);
            break;
          case "ArrowDown":
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setFocusedIndex(0);
            } else {
              setFocusedIndex((prev) => (prev < availableDomains.length - 1 ? prev + 1 : prev));
            }
            break;
          case "ArrowUp":
            e.preventDefault();
            if (isOpen) {
              setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
            }
            break;
          case "Tab":
            setIsOpen(false);
            setFocusedIndex(-1);
            break;
        }
      },
      [disabled, isOpen, focusedIndex, availableDomains, handleSelect]
    );

    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        {/* Trigger Button */}
        <button
          type="button"
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          className={cn(
            "border-border-default bg-surface-default flex w-full items-center justify-between gap-2 rounded-lg border transition-colors",
            "focus:ring-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2",
            "hover:bg-surface-variant",
            disabled && "cursor-not-allowed opacity-50",
            config.trigger
          )}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 truncate">
            <img
              src={activeBranding.logoMark}
              alt=""
              className={cn("object-contain", config.logo)}
            />
            <span className="text-text-primary truncate">
              {showDomain ? activeBranding.domain : activeBranding.displayName}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "text-text-secondary flex-shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="z-dropdown fixed inset-0"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Dropdown Panel */}
            <div
              id={`${id}-listbox`}
              role="listbox"
              aria-labelledby={id}
              className={cn(
                "z-dropdown border-border-default bg-surface-elevated absolute left-0 top-full mt-1 w-full min-w-max overflow-hidden rounded-lg border shadow-lg",
                config.dropdown
              )}
            >
              <ul className="max-h-60 overflow-auto py-1">
                {availableDomains.map((domain, index) => {
                  const branding = getBrandingForDomain(domain);
                  const isSelected = domain === activeDomain;
                  const isFocused = index === focusedIndex;

                  return (
                    <li key={domain}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={cn(
                          "flex w-full items-center gap-2 transition-colors",
                          config.item,
                          isFocused && "bg-surface-variant",
                          isSelected && "bg-primary-50 dark:bg-primary-900/20"
                        )}
                        onClick={() => handleSelect(domain)}
                        onMouseEnter={() => setFocusedIndex(index)}
                      >
                        <img
                          src={branding.logoMark}
                          alt=""
                          className={cn("object-contain", config.logo)}
                        />
                        <span className="text-text-primary flex-1 truncate text-left">
                          {showDomain ? branding.domain : branding.displayName}
                        </span>
                        {isSelected && <CheckIcon className="text-primary-600 flex-shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    );
  }
);

DomainSelector.displayName = "DomainSelector";

// ============================================================
// DOMAIN SELECTOR SKELETON
// ============================================================

export interface DomainSelectorSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export const DomainSelectorSkeleton = forwardRef<HTMLDivElement, DomainSelectorSkeletonProps>(
  ({ size = "md", className, ...props }, ref) => {
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          "animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800",
          config.trigger,
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <div className={cn("rounded bg-neutral-300 dark:bg-neutral-600", config.logo)} />
          <div className="h-4 w-24 rounded bg-neutral-300 dark:bg-neutral-600" />
        </div>
      </div>
    );
  }
);

DomainSelectorSkeleton.displayName = "DomainSelectorSkeleton";

export default DomainSelector;
