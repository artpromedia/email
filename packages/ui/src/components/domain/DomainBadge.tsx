"use client";

/**
 * OonruMail - Domain Badge Component
 * Displays domain branding badge with logo and name
 */

import { forwardRef, type HTMLAttributes } from "react";
import { useDomain, useDomainBrandingFor } from "../../providers/DomainBrandingProvider";
import { cn } from "../../utils/cn";

// ============================================================
// TYPES
// ============================================================

export interface DomainBadgeProps extends HTMLAttributes<HTMLDivElement> {
  /** Domain to display (uses active domain if not provided) */
  domain?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Show logo only (no text) */
  logoOnly?: boolean;
  /** Show text only (no logo) */
  textOnly?: boolean;
  /** Use logo mark instead of full logo */
  useLogoMark?: boolean;
  /** Show domain text instead of display name */
  showDomain?: boolean;
  /** Interactive (clickable appearance) */
  interactive?: boolean;
}

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================

const sizeConfig = {
  sm: {
    container: "h-6 gap-1.5 px-2 text-xs",
    logo: "h-4 w-4",
    logoMark: "h-4 w-4",
  },
  md: {
    container: "h-8 gap-2 px-3 text-sm",
    logo: "h-5 w-5",
    logoMark: "h-5 w-5",
  },
  lg: {
    container: "h-10 gap-2.5 px-4 text-base",
    logo: "h-6 w-6",
    logoMark: "h-6 w-6",
  },
} as const;

// ============================================================
// COMPONENT
// ============================================================

export const DomainBadge = forwardRef<HTMLDivElement, DomainBadgeProps>(
  (
    {
      domain,
      size = "md",
      logoOnly = false,
      textOnly = false,
      useLogoMark = false,
      showDomain = false,
      interactive = false,
      className,
      ...props
    },
    ref
  ) => {
    // Get branding - either for specific domain or active domain
    const { activeDomain, branding: activeBranding } = useDomain();
    const specificBranding = useDomainBrandingFor(domain ?? activeDomain);
    const branding = domain ? specificBranding : activeBranding;

    const config = sizeConfig[size];
    const logoSrc = useLogoMark ? branding.logoMark : branding.logo;
    const displayText = showDomain ? branding.domain : branding.displayName;

    return (
      <div
        ref={ref}
        className={cn(
          "border-border-subtle bg-surface-variant inline-flex items-center rounded-md border font-medium",
          config.container,
          interactive &&
            "hover:bg-surface-elevated hover:border-border-default cursor-pointer transition-colors",
          className
        )}
        style={
          {
            "--domain-badge-primary": branding.primaryColor,
          } as React.CSSProperties
        }
        {...props}
      >
        {!textOnly && (
          <img
            src={logoSrc}
            alt={`${branding.displayName} logo`}
            className={cn("object-contain", useLogoMark ? config.logoMark : config.logo)}
          />
        )}
        {!logoOnly && <span className="text-text-primary truncate">{displayText}</span>}
      </div>
    );
  }
);

DomainBadge.displayName = "DomainBadge";

// ============================================================
// DOMAIN BADGE SKELETON
// ============================================================

export interface DomainBadgeSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export const DomainBadgeSkeleton = forwardRef<HTMLDivElement, DomainBadgeSkeletonProps>(
  ({ size = "md", className, ...props }, ref) => {
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex animate-pulse items-center rounded-md bg-neutral-200 dark:bg-neutral-700",
          config.container,
          className
        )}
        {...props}
      >
        <div className={cn("rounded bg-neutral-300 dark:bg-neutral-600", config.logoMark)} />
        <div className="h-3 w-20 rounded bg-neutral-300 dark:bg-neutral-600" />
      </div>
    );
  }
);

DomainBadgeSkeleton.displayName = "DomainBadgeSkeleton";

export default DomainBadge;
