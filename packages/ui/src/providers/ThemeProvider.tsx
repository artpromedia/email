"use client";

/**
 * OonruMail Design System - Theme Provider
 * React context for theme and domain branding management
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Theme,
  type ThemeMode,
  type DomainBranding,
  lightTheme,
  darkTheme,
  getTheme,
  resolveThemeMode,
  applyDomainBranding,
  mergeBranding,
  getThemeCssVars,
  saveThemePreference,
  loadThemePreference,
  defaultDomainBranding,
} from "../tokens/theme";

// ============================================================
// CONTEXT TYPES
// ============================================================

export interface ThemeContextValue {
  /** Current theme object with all tokens */
  theme: Theme;
  /** Current theme mode preference (light/dark/system) */
  themeMode: ThemeMode;
  /** Resolved theme mode (light/dark only) */
  resolvedMode: "light" | "dark";
  /** Whether the theme is dark */
  isDark: boolean;
  /** Current domain branding */
  domainBranding: DomainBranding;
  /** Set theme mode preference */
  setThemeMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark themes */
  toggleTheme: () => void;
  /** Set domain branding */
  setDomainBranding: (branding: Partial<DomainBranding>) => void;
  /** Reset domain branding to default */
  resetDomainBranding: () => void;
}

// ============================================================
// CONTEXT
// ============================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================
// PROVIDER PROPS
// ============================================================

export interface ThemeProviderProps {
  /** Child components */
  children: ReactNode;
  /** Initial theme mode (defaults to "system") */
  defaultTheme?: ThemeMode;
  /** Initial domain branding */
  defaultBranding?: Partial<DomainBranding>;
  /** Storage key for theme preference */
  storageKey?: string;
  /** Whether to persist theme preference */
  persistTheme?: boolean;
  /** Attribute to set on document element for theme */
  attribute?: "class" | "data-theme";
  /** Disable transitions when changing theme */
  disableTransitionOnChange?: boolean;
}

// ============================================================
// PROVIDER COMPONENT
// ============================================================

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultBranding,
  persistTheme = true,
  attribute = "data-theme",
  disableTransitionOnChange = false,
}: ThemeProviderProps): React.JSX.Element {
  // Initialize state
  const [themeMode, setThemeModeState] = useState<ThemeMode>(defaultTheme);
  const [domainBranding, setDomainBrandingState] = useState<DomainBranding>(
    defaultBranding ? mergeBranding(defaultBranding) : defaultDomainBranding
  );
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">(() =>
    resolveThemeMode(defaultTheme)
  );

  // Load persisted theme on mount
  useEffect(() => {
    if (persistTheme) {
      const stored = loadThemePreference();
      setThemeModeState(stored);
      setResolvedMode(resolveThemeMode(stored));
    }
  }, [persistTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      if (themeMode === "system") {
        setResolvedMode(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themeMode]);

  // Update resolved mode when theme mode changes
  useEffect(() => {
    setResolvedMode(resolveThemeMode(themeMode));
  }, [themeMode]);

  // Apply theme to document
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    // Optionally disable transitions
    if (disableTransitionOnChange) {
      root.style.setProperty("--transition-duration", "0ms");
    }

    // Set theme attribute
    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedMode);
    } else {
      root.setAttribute("data-theme", resolvedMode);
    }

    // Apply CSS custom properties
    const theme = applyDomainBranding(getTheme(resolvedMode), domainBranding);
    const vars = getThemeCssVars(theme);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    // Re-enable transitions
    if (disableTransitionOnChange) {
      requestAnimationFrame(() => {
        root.style.removeProperty("--transition-duration");
      });
    }
  }, [resolvedMode, domainBranding, attribute, disableTransitionOnChange]);

  // Set theme mode with persistence
  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      if (persistTheme) {
        saveThemePreference(mode);
      }
    },
    [persistTheme]
  );

  // Toggle theme
  const toggleTheme = useCallback(() => {
    const newMode = resolvedMode === "dark" ? "light" : "dark";
    setThemeMode(newMode);
  }, [resolvedMode, setThemeMode]);

  // Set domain branding
  const setDomainBranding = useCallback((branding: Partial<DomainBranding>) => {
    setDomainBrandingState((prev: DomainBranding) => mergeBranding(branding, prev));
  }, []);

  // Reset domain branding
  const resetDomainBranding = useCallback(() => {
    setDomainBrandingState(defaultDomainBranding);
  }, []);

  // Build theme object
  const theme = useMemo(() => {
    const baseTheme = resolvedMode === "dark" ? darkTheme : lightTheme;
    return applyDomainBranding(baseTheme, domainBranding);
  }, [resolvedMode, domainBranding]);

  // Build context value
  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeMode,
      resolvedMode,
      isDark: resolvedMode === "dark",
      domainBranding,
      setThemeMode,
      toggleTheme,
      setDomainBranding,
      resetDomainBranding,
    }),
    [
      theme,
      themeMode,
      resolvedMode,
      domainBranding,
      setThemeMode,
      toggleTheme,
      setDomainBranding,
      resetDomainBranding,
    ]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

// ============================================================
// HOOKS
// ============================================================

/**
 * Use theme context
 * @throws Error if used outside ThemeProvider
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Use theme mode only (lighter than full useTheme)
 */
export function useThemeMode(): {
  themeMode: ThemeMode;
  resolvedMode: "light" | "dark";
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const { themeMode, resolvedMode, isDark, setThemeMode, toggleTheme } = useTheme();
  return { themeMode, resolvedMode, isDark, setThemeMode, toggleTheme };
}

/**
 * Use domain branding only
 */
export function useDomainBranding(): {
  domainBranding: DomainBranding;
  setDomainBranding: (branding: Partial<DomainBranding>) => void;
  resetDomainBranding: () => void;
} {
  const { domainBranding, setDomainBranding, resetDomainBranding } = useTheme();
  return { domainBranding, setDomainBranding, resetDomainBranding };
}

/**
 * Use design tokens from current theme
 */
export function useTokens(): Theme {
  const { theme } = useTheme();
  return theme;
}

// ============================================================
// SSR SCRIPT
// ============================================================

/**
 * Script to prevent flash of incorrect theme
 * Include this in your document head
 */
export const themeScript = `
(function() {
  var storageKey = "oonrumail-theme";
  var attribute = "data-theme";

  function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (e) {
      return null;
    }
  }

  var stored = getStoredTheme();
  var theme = stored === "dark" || stored === "light"
    ? stored
    : stored === "system"
      ? getSystemTheme()
      : getSystemTheme();

  document.documentElement.setAttribute(attribute, theme);
})();
`;

/**
 * Component to inject theme script
 */
export function ThemeScript(): React.JSX.Element {
  return React.createElement("script", {
    dangerouslySetInnerHTML: { __html: themeScript },
    suppressHydrationWarning: true,
  });
}

// ============================================================
// EXPORTS
// ============================================================

export { ThemeContext };
export type { Theme, ThemeMode, DomainBranding };
