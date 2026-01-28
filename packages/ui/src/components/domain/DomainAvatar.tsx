"use client";

/**
 * Enterprise Email - Domain Avatar Component
 * Avatar component with domain-aware branding colors
 */

import { forwardRef, useMemo, type HTMLAttributes } from "react";
import { useDomain, useDomainBrandingFor } from "../../providers/DomainBrandingProvider";
import { cn } from "../../utils/cn";

// ============================================================
// TYPES
// ============================================================

export interface DomainAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Name to extract initials from */
  name: string;
  /** Optional image URL */
  src?: string;
  /** Domain to use for branding colors (uses active domain if not provided) */
  domain?: string;
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  /** Shape variant */
  shape?: "circle" | "rounded" | "square";
  /** Show presence indicator */
  showPresence?: boolean;
  /** Presence status */
  presence?: "online" | "away" | "busy" | "offline";
  /** Use domain primary color for background */
  useDomainColor?: boolean;
  /** Custom fallback element */
  fallback?: React.ReactNode;
}

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================

const sizeConfig = {
  xs: {
    container: "h-6 w-6",
    text: "text-[10px]",
    presence: "h-2 w-2 border",
  },
  sm: {
    container: "h-8 w-8",
    text: "text-xs",
    presence: "h-2.5 w-2.5 border-[1.5px]",
  },
  md: {
    container: "h-10 w-10",
    text: "text-sm",
    presence: "h-3 w-3 border-2",
  },
  lg: {
    container: "h-12 w-12",
    text: "text-base",
    presence: "h-3.5 w-3.5 border-2",
  },
  xl: {
    container: "h-16 w-16",
    text: "text-lg",
    presence: "h-4 w-4 border-2",
  },
  "2xl": {
    container: "h-20 w-20",
    text: "text-xl",
    presence: "h-5 w-5 border-2",
  },
} as const;

const shapeConfig = {
  circle: "rounded-full",
  rounded: "rounded-lg",
  square: "rounded-none",
} as const;

const presenceColors = {
  online: "bg-success-500",
  away: "bg-warning-500",
  busy: "bg-error-500",
  offline: "bg-neutral-400",
} as const;

// ============================================================
// UTILITIES
// ============================================================

/**
 * Extract initials from a name
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const firstWord = words[0];
    return firstWord ? firstWord.slice(0, 2).toUpperCase() : "?";
  }
  const firstInitial = words[0]?.[0] ?? "";
  const lastInitial = words[words.length - 1]?.[0] ?? "";
  return (firstInitial + lastInitial).toUpperCase();
}

/**
 * Generate a consistent color based on a string
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#84cc16", // lime
    "#22c55e", // green
    "#14b8a6", // teal
    "#06b6d4", // cyan
    "#0ea5e9", // sky
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#a855f7", // purple
    "#d946ef", // fuchsia
    "#ec4899", // pink
    "#f43f5e", // rose
  ];

  const index = Math.abs(hash) % colors.length;
  return colors[index] ?? colors[0] ?? "#3b82f6";
}

/**
 * Determine if color is light (needs dark text)
 */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// ============================================================
// COMPONENT
// ============================================================

export const DomainAvatar = forwardRef<HTMLDivElement, DomainAvatarProps>(
  (
    {
      name,
      src,
      domain,
      size = "md",
      shape = "circle",
      showPresence = false,
      presence = "offline",
      useDomainColor = false,
      fallback,
      className,
      style,
      ...props
    },
    ref
  ) => {
    // Get branding - either for specific domain or active domain
    const { activeDomain, branding: activeBranding } = useDomain();
    const specificBranding = useDomainBrandingFor(domain ?? activeDomain);
    const branding = domain ? specificBranding : activeBranding;

    const config = sizeConfig[size];
    const initials = getInitials(name);

    // Calculate background color
    const backgroundColor = useMemo(() => {
      if (useDomainColor) {
        return branding.primaryColor;
      }
      return stringToColor(name);
    }, [useDomainColor, branding.primaryColor, name]);

    const textColor = useMemo(() => {
      return isLightColor(backgroundColor) ? "#1f2937" : "#ffffff";
    }, [backgroundColor]);

    return (
      <div ref={ref} className={cn("relative inline-flex flex-shrink-0", className)} {...props}>
        {/* Avatar Container */}
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden",
            config.container,
            shapeConfig[shape]
          )}
          style={{
            backgroundColor: src ? undefined : backgroundColor,
            ...style,
          }}
        >
          {src ? (
            <img
              src={src}
              alt={name}
              className="h-full w-full object-cover"
              onError={(e) => {
                // Hide image on error to show fallback
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            (fallback ?? (
              <span
                className={cn("select-none font-medium", config.text)}
                style={{ color: textColor }}
              >
                {initials}
              </span>
            ))
          )}
        </div>

        {/* Presence Indicator */}
        {showPresence && (
          <span
            className={cn(
              "absolute bottom-0 right-0 block border-white dark:border-neutral-800",
              config.presence,
              presenceColors[presence],
              shape === "circle" ? "rounded-full" : "rounded-sm"
            )}
            aria-label={`Status: ${presence}`}
          />
        )}
      </div>
    );
  }
);

DomainAvatar.displayName = "DomainAvatar";

// ============================================================
// AVATAR GROUP
// ============================================================

export interface DomainAvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Maximum avatars to show before "+N" indicator */
  max?: number;
  /** Size of avatars */
  size?: DomainAvatarProps["size"];
  /** Shape of avatars */
  shape?: DomainAvatarProps["shape"];
  /** Spacing between avatars (negative for overlap) */
  spacing?: "none" | "tight" | "normal";
  /** Children (DomainAvatar components) */
  children: React.ReactNode;
}

const spacingConfig = {
  none: "space-x-0",
  tight: "-space-x-2",
  normal: "space-x-1",
} as const;

export const DomainAvatarGroup = forwardRef<HTMLDivElement, DomainAvatarGroupProps>(
  (
    { max = 5, size = "md", shape = "circle", spacing = "tight", children, className, ...props },
    ref
  ) => {
    const childArray = Array.isArray(children) ? children : [children];
    const visibleChildren = childArray.slice(0, max);
    const remainingCount = childArray.length - max;

    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn("flex items-center", spacingConfig[spacing], className)}
        {...props}
      >
        {visibleChildren}
        {remainingCount > 0 && (
          <div
            className={cn(
              "flex items-center justify-center bg-neutral-200 text-neutral-600 ring-2 ring-white dark:bg-neutral-700 dark:text-neutral-300 dark:ring-neutral-800",
              config.container,
              config.text,
              shapeConfig[shape]
            )}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    );
  }
);

DomainAvatarGroup.displayName = "DomainAvatarGroup";

// ============================================================
// AVATAR SKELETON
// ============================================================

export interface DomainAvatarSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  size?: DomainAvatarProps["size"];
  shape?: DomainAvatarProps["shape"];
}

export const DomainAvatarSkeleton = forwardRef<HTMLDivElement, DomainAvatarSkeletonProps>(
  ({ size = "md", shape = "circle", className, ...props }, ref) => {
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          "animate-pulse bg-neutral-200 dark:bg-neutral-700",
          config.container,
          shapeConfig[shape],
          className
        )}
        {...props}
      />
    );
  }
);

DomainAvatarSkeleton.displayName = "DomainAvatarSkeleton";

export default DomainAvatar;
