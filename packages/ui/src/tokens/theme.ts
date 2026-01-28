/**
 * Enterprise Email Design System - Theme Configuration
 * Light/Dark themes with domain branding support
 */

import {
  colors,
  semanticColors,
  shadows,
  fontFamily,
  typography,
  spacing,
  borderRadius,
  zIndex,
  layout,
  duration,
  easing,
  type DomainBranding,
  defaultDomainBranding,
} from "./tokens";

// ============================================================
// THEME TYPES
// ============================================================

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  // Brand colors
  primary: typeof colors.primary;
  secondary: typeof colors.secondary;
  neutral: typeof colors.neutral;

  // Semantic colors
  success: typeof colors.success;
  warning: typeof colors.warning;
  error: typeof colors.error;
  info: typeof colors.info;

  // Base
  white: string;
  black: string;
  transparent: string;

  // Contextual colors (change with theme)
  background: {
    default: string;
    subtle: string;
    muted: string;
  };
  surface: {
    default: string;
    variant: string;
    elevated: string;
  };
  overlay: {
    default: string;
    light: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
    link: string;
    linkHover: string;
  };
  border: {
    default: string;
    subtle: string;
    strong: string;
    focus: string;
  };
}

export interface Theme {
  mode: "light" | "dark";
  colors: ThemeColors;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: (typeof shadows)["light"] | (typeof shadows)["dark"];
  zIndex: typeof zIndex;
  layout: typeof layout;
  duration: typeof duration;
  easing: typeof easing;
  domainBranding: DomainBranding;
}

// ============================================================
// LIGHT THEME
// ============================================================

export const lightTheme: Theme = {
  mode: "light",
  colors: {
    primary: colors.primary,
    secondary: colors.secondary,
    neutral: colors.neutral,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
    white: colors.white,
    black: colors.black,
    transparent: colors.transparent,
    background: semanticColors.light.background,
    surface: semanticColors.light.surface,
    overlay: semanticColors.light.overlay,
    text: semanticColors.light.text,
    border: semanticColors.light.border,
  },
  typography,
  fontFamily,
  spacing,
  borderRadius,
  shadows: shadows.light,
  zIndex,
  layout,
  duration,
  easing,
  domainBranding: defaultDomainBranding,
};

// ============================================================
// DARK THEME
// ============================================================

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    primary: colors.primary,
    secondary: colors.secondary,
    neutral: colors.neutral,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
    white: colors.white,
    black: colors.black,
    transparent: colors.transparent,
    background: semanticColors.dark.background,
    surface: semanticColors.dark.surface,
    overlay: semanticColors.dark.overlay,
    text: semanticColors.dark.text,
    border: semanticColors.dark.border,
  },
  typography,
  fontFamily,
  spacing,
  borderRadius,
  shadows: shadows.dark,
  zIndex,
  layout,
  duration,
  easing,
  domainBranding: defaultDomainBranding,
};

// ============================================================
// THEME UTILITIES
// ============================================================

/**
 * Get theme by mode
 */
export function getTheme(mode: "light" | "dark"): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}

/**
 * Apply domain branding to a theme
 */
export function applyDomainBranding(theme: Theme, branding: DomainBranding): Theme {
  return {
    ...theme,
    domainBranding: branding,
  };
}

/**
 * Merge partial branding with default branding
 */
export function mergeBranding(
  partial: Partial<DomainBranding>,
  base: DomainBranding = defaultDomainBranding
): DomainBranding {
  return {
    ...base,
    ...partial,
    domain: partial.domain ?? base.domain,
    displayName: partial.displayName ?? base.displayName,
    logo: partial.logo ?? base.logo,
    logoMark: partial.logoMark ?? base.logoMark,
    primaryColor: partial.primaryColor ?? base.primaryColor,
    secondaryColor: partial.secondaryColor ?? base.secondaryColor,
    accentColor: partial.accentColor ?? base.accentColor,
    favicon: partial.favicon ?? base.favicon,
  };
}

/**
 * Get system theme preference
 */
export function getSystemThemePreference(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve theme mode (handles "system" preference)
 */
export function resolveThemeMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemThemePreference();
  }
  return mode;
}

/**
 * Get CSS custom properties for a theme
 */
export function getThemeCssVars(theme: Theme): Record<string, string> {
  return {
    // Background
    "--color-background-default": theme.colors.background.default,
    "--color-background-subtle": theme.colors.background.subtle,
    "--color-background-muted": theme.colors.background.muted,

    // Surface
    "--color-surface-default": theme.colors.surface.default,
    "--color-surface-variant": theme.colors.surface.variant,
    "--color-surface-elevated": theme.colors.surface.elevated,

    // Text
    "--color-text-primary": theme.colors.text.primary,
    "--color-text-secondary": theme.colors.text.secondary,
    "--color-text-tertiary": theme.colors.text.tertiary,
    "--color-text-disabled": theme.colors.text.disabled,
    "--color-text-inverse": theme.colors.text.inverse,
    "--color-text-link": theme.colors.text.link,
    "--color-text-link-hover": theme.colors.text.linkHover,

    // Border
    "--color-border-default": theme.colors.border.default,
    "--color-border-subtle": theme.colors.border.subtle,
    "--color-border-strong": theme.colors.border.strong,
    "--color-border-focus": theme.colors.border.focus,

    // Shadows
    "--shadow-xs": theme.shadows.xs,
    "--shadow-sm": theme.shadows.sm,
    "--shadow-md": theme.shadows.md,
    "--shadow-lg": theme.shadows.lg,
    "--shadow-xl": theme.shadows.xl,
    "--shadow-2xl": theme.shadows["2xl"],
    "--shadow-elevation-1": theme.shadows.elevation1,
    "--shadow-elevation-2": theme.shadows.elevation2,
    "--shadow-elevation-3": theme.shadows.elevation3,
    "--shadow-elevation-4": theme.shadows.elevation4,
    "--shadow-elevation-5": theme.shadows.elevation5,

    // Domain branding
    "--domain-primary": theme.domainBranding.primaryColor,
    "--domain-secondary": theme.domainBranding.secondaryColor,
    "--domain-accent": theme.domainBranding.accentColor,
  };
}

/**
 * Apply theme CSS variables to an element
 */
export function applyThemeCssVars(element: HTMLElement, theme: Theme): void {
  const vars = getThemeCssVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    element.style.setProperty(key, value);
  }
}

/**
 * Create a complete theme with domain branding
 */
export function createTheme(mode: "light" | "dark", branding?: Partial<DomainBranding>): Theme {
  const baseTheme = getTheme(mode);
  if (branding) {
    return applyDomainBranding(baseTheme, mergeBranding(branding));
  }
  return baseTheme;
}

// ============================================================
// THEME STORAGE
// ============================================================

const THEME_STORAGE_KEY = "enterprise-email-theme";
const DOMAIN_STORAGE_KEY = "enterprise-email-domain";

/**
 * Save theme preference to localStorage
 */
export function saveThemePreference(mode: ThemeMode): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }
}

/**
 * Load theme preference from localStorage
 */
export function loadThemePreference(): ThemeMode {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  }
  return "system";
}

/**
 * Save selected domain to localStorage
 */
export function saveSelectedDomain(domain: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DOMAIN_STORAGE_KEY, domain);
  }
}

/**
 * Load selected domain from localStorage
 */
export function loadSelectedDomain(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(DOMAIN_STORAGE_KEY);
  }
  return null;
}

// ============================================================
// EXPORTS
// ============================================================

export {
  colors,
  semanticColors,
  shadows,
  fontFamily,
  typography,
  spacing,
  borderRadius,
  zIndex,
  layout,
  duration,
  easing,
};
export { defaultDomainBranding };
export type { DomainBranding };
