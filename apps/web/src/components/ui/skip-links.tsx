"use client";

/**
 * Skip Links Component
 * Allows keyboard users to bypass navigation and jump to main content
 * WCAG 2.1 Criterion 2.4.1: Bypass Blocks
 */

import { cn } from "@email/ui";

export interface SkipLinkProps {
  /** ID of the target element to skip to */
  targetId: string;
  /** Text to display for the skip link */
  label: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Single skip link that appears on keyboard focus
 */
export function SkipLink({ targetId, label, className }: Readonly<SkipLinkProps>) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={cn(
        // Position absolutely off-screen
        "absolute left-0 top-0 z-50",
        "-translate-y-full",
        // Styling when focused
        "focus:translate-y-0",
        "focus:px-4 focus:py-2",
        "focus:bg-blue-600 focus:text-white",
        "focus:shadow-lg",
        // Transition
        "transition-transform duration-200",
        // Skip default anchor styling
        "rounded-sm",
        "text-sm font-medium",
        "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
        className
      )}
    >
      {label}
    </a>
  );
}

/**
 * Container for multiple skip links
 * Place this at the top of your layout/page
 */
export interface SkipLinksProps {
  links: {
    targetId: string;
    label: string;
  }[];
}

export function SkipLinks({ links }: Readonly<SkipLinksProps>) {
  return (
    <div className="relative">
      {links.map((link) => (
        <SkipLink key={link.targetId} targetId={link.targetId} label={link.label} />
      ))}
    </div>
  );
}

/**
 * Predefined skip links for common email client layout
 */
export function EmailSkipLinks() {
  return (
    <SkipLinks
      links={[
        { targetId: "main-content", label: "Skip to main content" },
        { targetId: "email-list", label: "Skip to email list" },
        { targetId: "compose-button", label: "Skip to compose" },
        { targetId: "search", label: "Skip to search" },
      ]}
    />
  );
}
