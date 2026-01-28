/**
 * Enterprise Email Design System - TypeScript Design Tokens
 * Complete token system for programmatic access
 */

// ============================================================
// COLOR TOKENS
// ============================================================

export const colors = {
  // Primary (Gmail Blue)
  primary: {
    50: "#e8f0fe",
    100: "#d2e3fc",
    200: "#aecbfa",
    300: "#8ab4f8",
    400: "#669df6",
    500: "#4285f4",
    600: "#1a73e8",
    700: "#1967d2",
    800: "#185abc",
    900: "#174ea6",
  },

  // Secondary (Outlook Blue)
  secondary: {
    50: "#e6f2ff",
    100: "#cce5ff",
    200: "#99caff",
    300: "#66b0ff",
    400: "#3395ff",
    500: "#0078d4",
    600: "#006cbe",
    700: "#005a9e",
    800: "#004c87",
    900: "#003d6d",
  },

  // Neutral Grays
  neutral: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#eeeeee",
    300: "#e0e0e0",
    400: "#bdbdbd",
    500: "#9e9e9e",
    600: "#757575",
    700: "#616161",
    800: "#424242",
    900: "#212121",
  },

  // Semantic Colors
  success: {
    50: "#e6f4ea",
    100: "#ceead6",
    200: "#a8dab5",
    300: "#81c995",
    400: "#5bb974",
    500: "#34a853",
    600: "#1e8e3e",
    700: "#188038",
    800: "#137333",
    900: "#0d652d",
  },

  warning: {
    50: "#fef7e0",
    100: "#feefc3",
    200: "#fde293",
    300: "#fdd663",
    400: "#fcc934",
    500: "#fbbc04",
    600: "#f9ab00",
    700: "#e69500",
    800: "#c77700",
    900: "#a85d00",
  },

  error: {
    50: "#fce8e6",
    100: "#fad2cf",
    200: "#f5a7a0",
    300: "#f07b72",
    400: "#eb5043",
    500: "#ea4335",
    600: "#d93025",
    700: "#c5221f",
    800: "#a50e0e",
    900: "#850d0d",
  },

  info: {
    50: "#e8f0fe",
    100: "#d2e3fc",
    200: "#aecbfa",
    300: "#8ab4f8",
    400: "#669df6",
    500: "#4285f4",
    600: "#1a73e8",
    700: "#1967d2",
    800: "#185abc",
    900: "#174ea6",
  },

  // Base Colors
  white: "#ffffff",
  black: "#000000",
  transparent: "transparent",
  current: "currentColor",
} as const;

// ============================================================
// SEMANTIC COLOR TOKENS
// ============================================================

export const semanticColors = {
  light: {
    background: {
      default: colors.white,
      subtle: colors.neutral[50],
      muted: colors.neutral[100],
    },
    surface: {
      default: colors.white,
      variant: "#f1f3f4",
      elevated: colors.white,
    },
    overlay: {
      default: "rgba(0, 0, 0, 0.5)",
      light: "rgba(0, 0, 0, 0.1)",
    },
    text: {
      primary: "#202124",
      secondary: "#5f6368",
      tertiary: "#80868b",
      disabled: "#9aa0a6",
      inverse: colors.white,
      link: colors.primary[600],
      linkHover: colors.primary[900],
    },
    border: {
      default: "#dadce0",
      subtle: "#e8eaed",
      strong: "#bdc1c6",
      focus: colors.primary[600],
    },
  },
  dark: {
    background: {
      default: "#1f1f1f",
      subtle: "#171717",
      muted: "#292929",
    },
    surface: {
      default: "#292929",
      variant: "#333333",
      elevated: "#3c3c3c",
    },
    overlay: {
      default: "rgba(0, 0, 0, 0.7)",
      light: "rgba(255, 255, 255, 0.1)",
    },
    text: {
      primary: "#e8eaed",
      secondary: "#9aa0a6",
      tertiary: "#80868b",
      disabled: "#5f6368",
      inverse: "#202124",
      link: colors.primary[300],
      linkHover: colors.primary[200],
    },
    border: {
      default: "#3c4043",
      subtle: "#5f6368",
      strong: "#80868b",
      focus: colors.primary[300],
    },
  },
} as const;

// ============================================================
// TYPOGRAPHY TOKENS
// ============================================================

export const fontFamily = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  mono: '"JetBrains Mono", "Fira Code", Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
} as const;

export const fontSize = {
  // Display
  "display-lg": "3.5625rem", // 57px
  "display-md": "2.8125rem", // 45px
  "display-sm": "2.25rem", // 36px

  // Headline
  "headline-lg": "2rem", // 32px
  "headline-md": "1.75rem", // 28px
  "headline-sm": "1.5rem", // 24px

  // Title
  "title-lg": "1.375rem", // 22px
  "title-md": "1rem", // 16px
  "title-sm": "0.875rem", // 14px

  // Body
  "body-lg": "1rem", // 16px
  "body-md": "0.875rem", // 14px
  "body-sm": "0.75rem", // 12px

  // Label
  "label-lg": "0.875rem", // 14px
  "label-md": "0.75rem", // 12px
  "label-sm": "0.6875rem", // 11px
} as const;

export const lineHeight = {
  // Display
  "display-lg": "4rem", // 64px
  "display-md": "3.25rem", // 52px
  "display-sm": "2.75rem", // 44px

  // Headline
  "headline-lg": "2.5rem", // 40px
  "headline-md": "2.25rem", // 36px
  "headline-sm": "2rem", // 32px

  // Title
  "title-lg": "1.75rem", // 28px
  "title-md": "1.5rem", // 24px
  "title-sm": "1.25rem", // 20px

  // Body
  "body-lg": "1.5rem", // 24px
  "body-md": "1.25rem", // 20px
  "body-sm": "1rem", // 16px

  // Label
  "label-lg": "1.25rem", // 20px
  "label-md": "1rem", // 16px
  "label-sm": "1rem", // 16px
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const letterSpacing = {
  tight: "-0.025em",
  normal: "0",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em",
} as const;

// Typography presets for easy usage
export const typography = {
  "display-lg": {
    fontSize: fontSize["display-lg"],
    lineHeight: lineHeight["display-lg"],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  "display-md": {
    fontSize: fontSize["display-md"],
    lineHeight: lineHeight["display-md"],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  "display-sm": {
    fontSize: fontSize["display-sm"],
    lineHeight: lineHeight["display-sm"],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  "headline-lg": {
    fontSize: fontSize["headline-lg"],
    lineHeight: lineHeight["headline-lg"],
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },
  "headline-md": {
    fontSize: fontSize["headline-md"],
    lineHeight: lineHeight["headline-md"],
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },
  "headline-sm": {
    fontSize: fontSize["headline-sm"],
    lineHeight: lineHeight["headline-sm"],
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },
  "title-lg": {
    fontSize: fontSize["title-lg"],
    lineHeight: lineHeight["title-lg"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  "title-md": {
    fontSize: fontSize["title-md"],
    lineHeight: lineHeight["title-md"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  "title-sm": {
    fontSize: fontSize["title-sm"],
    lineHeight: lineHeight["title-sm"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  "body-lg": {
    fontSize: fontSize["body-lg"],
    lineHeight: lineHeight["body-lg"],
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  "body-md": {
    fontSize: fontSize["body-md"],
    lineHeight: lineHeight["body-md"],
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  "body-sm": {
    fontSize: fontSize["body-sm"],
    lineHeight: lineHeight["body-sm"],
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  "label-lg": {
    fontSize: fontSize["label-lg"],
    lineHeight: lineHeight["label-lg"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  "label-md": {
    fontSize: fontSize["label-md"],
    lineHeight: lineHeight["label-md"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },
  "label-sm": {
    fontSize: fontSize["label-sm"],
    lineHeight: lineHeight["label-sm"],
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.wider,
    textTransform: "uppercase" as const,
  },
} as const;

// ============================================================
// SPACING TOKENS (4px base unit)
// ============================================================

export const spacing = {
  0: "0",
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  8: "2rem", // 32px
  10: "2.5rem", // 40px
  12: "3rem", // 48px
  16: "4rem", // 64px
  20: "5rem", // 80px
  24: "6rem", // 96px
} as const;

// Pixel values for calculations
export const spacingPx = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

// ============================================================
// BORDER RADIUS TOKENS
// ============================================================

export const borderRadius = {
  none: "0",
  sm: "0.125rem", // 2px
  md: "0.25rem", // 4px
  lg: "0.5rem", // 8px
  xl: "0.75rem", // 12px
  "2xl": "1rem", // 16px
  "3xl": "1.5rem", // 24px
  full: "9999px",
} as const;

// ============================================================
// SHADOW TOKENS
// ============================================================

export const shadows = {
  light: {
    none: "none",
    xs: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    // Gmail/Material elevation shadows
    elevation1: "0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)",
    elevation2: "0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 2px 6px 2px rgba(60, 64, 67, 0.15)",
    elevation3: "0 1px 3px 0 rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15)",
    elevation4: "0 2px 3px 0 rgba(60, 64, 67, 0.3), 0 6px 10px 4px rgba(60, 64, 67, 0.15)",
    elevation5: "0 4px 4px 0 rgba(60, 64, 67, 0.3), 0 8px 12px 6px rgba(60, 64, 67, 0.15)",
  },
  dark: {
    none: "none",
    xs: "0 1px 2px 0 rgba(0, 0, 0, 0.3)",
    sm: "0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
    "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
    elevation1: "0 1px 2px 0 rgba(0, 0, 0, 0.5), 0 1px 3px 1px rgba(0, 0, 0, 0.3)",
    elevation2: "0 1px 2px 0 rgba(0, 0, 0, 0.5), 0 2px 6px 2px rgba(0, 0, 0, 0.3)",
    elevation3: "0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 4px 8px 3px rgba(0, 0, 0, 0.3)",
    elevation4: "0 2px 3px 0 rgba(0, 0, 0, 0.5), 0 6px 10px 4px rgba(0, 0, 0, 0.3)",
    elevation5: "0 4px 4px 0 rgba(0, 0, 0, 0.5), 0 8px 12px 6px rgba(0, 0, 0, 0.3)",
  },
} as const;

// ============================================================
// BORDER TOKENS
// ============================================================

export const borderWidth = {
  none: "0",
  thin: "1px",
  medium: "2px",
  thick: "4px",
} as const;

// ============================================================
// TRANSITION TOKENS
// ============================================================

export const duration = {
  instant: "0ms",
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export const easing = {
  linear: "linear",
  ease: "ease",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

export const transitions = {
  colors: `color ${duration.normal} ${easing.easeInOut}, background-color ${duration.normal} ${easing.easeInOut}, border-color ${duration.normal} ${easing.easeInOut}`,
  opacity: `opacity ${duration.normal} ${easing.easeInOut}`,
  transform: `transform ${duration.normal} ${easing.easeInOut}`,
  shadow: `box-shadow ${duration.normal} ${easing.easeInOut}`,
  all: `all ${duration.normal} ${easing.easeInOut}`,
} as const;

// ============================================================
// Z-INDEX TOKENS
// ============================================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
} as const;

// ============================================================
// LAYOUT TOKENS
// ============================================================

export const layout = {
  sidebarWidth: "256px",
  sidebarCollapsedWidth: "72px",
  headerHeight: "64px",
  emailListWidth: "360px",
  composeWidth: "600px",
  maxContentWidth: "1200px",
} as const;

// ============================================================
// BREAKPOINTS
// ============================================================

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const breakpointsPx = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

// ============================================================
// DOMAIN BRANDING TYPES
// ============================================================

export interface DomainBranding {
  /** The domain this branding applies to (e.g., "example.com") */
  domain: string;
  /** Display name for the domain/organization */
  displayName: string;
  /** Full logo URL or path */
  logo: string;
  /** Small logo mark/icon for compact spaces */
  logoMark: string;
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary brand color (hex) */
  secondaryColor: string;
  /** Accent color for highlights (hex) */
  accentColor: string;
  /** Favicon URL or path */
  favicon: string;
  /** Optional login page background image */
  loginBackground?: string;
  /** Optional email signature HTML template */
  emailSignatureTemplate?: string;
  /** Optional custom CSS for additional styling */
  customCss?: string;
  /** Whether to use dark logo variant when in dark mode */
  hasDarkLogo?: boolean;
  /** Dark mode logo variant */
  logoDark?: string;
  /** Dark mode logo mark variant */
  logoMarkDark?: string;
}

export interface DomainBrandingConfig {
  /** Default branding when no domain-specific branding is found */
  default: DomainBranding;
  /** Domain-specific branding overrides */
  domains: Record<string, Partial<DomainBranding>>;
}

// ============================================================
// DEFAULT DOMAIN BRANDING
// ============================================================

export const defaultDomainBranding: DomainBranding = {
  domain: "default",
  displayName: "Enterprise Email",
  logo: "/logos/default-logo.svg",
  logoMark: "/logos/default-logo-mark.svg",
  primaryColor: colors.primary[600],
  secondaryColor: colors.secondary[500],
  accentColor: colors.primary[400],
  favicon: "/favicon.ico",
  hasDarkLogo: true,
  logoDark: "/logos/default-logo-dark.svg",
  logoMarkDark: "/logos/default-logo-mark-dark.svg",
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get spacing value by key
 */
export function getSpacing(key: keyof typeof spacing): string {
  return spacing[key];
}

/**
 * Get color value by path (e.g., "primary.500" or "success.600")
 */
export function getColor(path: string): string {
  const [colorName, shade] = path.split(".") as [keyof typeof colors, string];
  const colorGroup = colors[colorName];
  if (typeof colorGroup === "string") {
    return colorGroup;
  }
  return (colorGroup as Record<string, string>)[shade] ?? colors.neutral[500];
}

/**
 * Generate CSS custom property name
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/**
 * Apply domain branding as CSS custom properties
 */
export function getDomainBrandingCssVars(branding: DomainBranding): Record<string, string> {
  return {
    "--domain-primary": branding.primaryColor,
    "--domain-secondary": branding.secondaryColor,
    "--domain-accent": branding.accentColor,
  };
}

// ============================================================
// EXPORT ALL TOKENS
// ============================================================

export const tokens = {
  colors,
  semanticColors,
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  typography,
  spacing,
  spacingPx,
  borderRadius,
  shadows,
  borderWidth,
  duration,
  easing,
  transitions,
  zIndex,
  layout,
  breakpoints,
  breakpointsPx,
} as const;

export default tokens;
