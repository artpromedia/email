/**
 * UI Providers - Main Export
 */

export {
  ThemeProvider,
  useTheme,
  useThemeMode,
  useDomainBranding,
  useTokens,
  ThemeScript,
  themeScript,
} from "./ThemeProvider";
export type { ThemeProviderProps, ThemeContextValue } from "./ThemeProvider";

export {
  DomainBrandingProvider,
  useDomain,
  useActiveDomain,
  useDomainBrandingFor,
  sampleBrandingConfig,
} from "./DomainBrandingProvider";
export type {
  DomainBrandingProviderProps,
  DomainBrandingContextValue,
} from "./DomainBrandingProvider";
