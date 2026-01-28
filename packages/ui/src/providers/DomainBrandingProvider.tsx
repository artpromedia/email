"use client";

/**
 * Enterprise Email - Domain Branding Provider
 * Manages domain-specific branding for multi-tenant email system
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
import { useDomainBranding } from "./ThemeProvider";
import { mergeBranding } from "../tokens/theme";
import {
  type DomainBranding,
  type DomainBrandingConfig,
  defaultDomainBranding,
} from "../tokens/tokens";

// ============================================================
// CONTEXT TYPES
// ============================================================

export interface DomainBrandingContextValue {
  /** Current active domain */
  activeDomain: string;
  /** Current domain branding */
  branding: DomainBranding;
  /** All available domains */
  availableDomains: string[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Switch to a different domain */
  switchDomain: (domain: string) => void;
  /** Refresh branding from server */
  refreshBranding: () => Promise<void>;
  /** Get branding for a specific domain */
  getBrandingForDomain: (domain: string) => DomainBranding;
}

// ============================================================
// CONTEXT
// ============================================================

const DomainBrandingContext = createContext<DomainBrandingContextValue | null>(null);

// ============================================================
// PROVIDER PROPS
// ============================================================

export interface DomainBrandingProviderProps {
  /** Child components */
  children: ReactNode;
  /** Initial domain to use */
  initialDomain?: string;
  /** Static branding configuration (for SSR or initial load) */
  brandingConfig?: DomainBrandingConfig;
  /** API endpoint to fetch branding (optional) */
  brandingApiEndpoint?: string;
  /** Callback when domain changes */
  onDomainChange?: (domain: string, branding: DomainBranding) => void;
}

// ============================================================
// STORAGE KEYS
// ============================================================

const DOMAIN_STORAGE_KEY = "enterprise-email-active-domain";

// ============================================================
// PROVIDER COMPONENT
// ============================================================

export function DomainBrandingProvider({
  children,
  initialDomain,
  brandingConfig,
  brandingApiEndpoint,
  onDomainChange,
}: DomainBrandingProviderProps): React.JSX.Element {
  // Get theme context to sync branding
  const { setDomainBranding } = useDomainBranding();

  // State
  const [activeDomain, setActiveDomain] = useState<string>(
    initialDomain ?? brandingConfig?.default.domain ?? "default"
  );
  const [brandingConfigState, setBrandingConfigState] = useState<DomainBrandingConfig>(
    brandingConfig ?? {
      default: defaultDomainBranding,
      domains: {},
    }
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load stored domain on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(DOMAIN_STORAGE_KEY);
    if (stored && !initialDomain) {
      setActiveDomain(stored);
    }
  }, [initialDomain]);

  // Fetch branding from API if endpoint provided
  const fetchBranding = useCallback(async (): Promise<void> => {
    if (!brandingApiEndpoint) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(brandingApiEndpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch branding: ${response.statusText}`);
      }
      const config: DomainBrandingConfig = (await response.json()) as DomainBrandingConfig;
      setBrandingConfigState(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load branding";
      setError(message);
      console.error("Failed to fetch domain branding:", err);
    } finally {
      setIsLoading(false);
    }
  }, [brandingApiEndpoint]);

  // Initial fetch
  useEffect(() => {
    if (brandingApiEndpoint) {
      void fetchBranding();
    }
  }, [brandingApiEndpoint, fetchBranding]);

  // Get branding for a specific domain
  const getBrandingForDomain = useCallback(
    (domain: string): DomainBranding => {
      const domainConfig = brandingConfigState.domains[domain];
      if (domainConfig) {
        return mergeBranding(domainConfig, brandingConfigState.default);
      }
      return brandingConfigState.default;
    },
    [brandingConfigState]
  );

  // Current branding based on active domain
  const branding = useMemo(
    () => getBrandingForDomain(activeDomain),
    [activeDomain, getBrandingForDomain]
  );

  // Sync branding with theme context
  useEffect(() => {
    setDomainBranding(branding);
  }, [branding, setDomainBranding]);

  // Switch domain
  const switchDomain = useCallback(
    (domain: string) => {
      setActiveDomain(domain);

      // Persist to storage
      if (typeof window !== "undefined") {
        localStorage.setItem(DOMAIN_STORAGE_KEY, domain);
      }

      // Get branding for new domain
      const newBranding = getBrandingForDomain(domain);

      // Notify callback
      onDomainChange?.(domain, newBranding);
    },
    [getBrandingForDomain, onDomainChange]
  );

  // Available domains
  const availableDomains = useMemo(() => {
    const domains = new Set<string>([brandingConfigState.default.domain]);
    for (const domain of Object.keys(brandingConfigState.domains)) {
      domains.add(domain);
    }
    return Array.from(domains);
  }, [brandingConfigState]);

  // Build context value
  const contextValue = useMemo<DomainBrandingContextValue>(
    () => ({
      activeDomain,
      branding,
      availableDomains,
      isLoading,
      error,
      switchDomain,
      refreshBranding: fetchBranding,
      getBrandingForDomain,
    }),
    [
      activeDomain,
      branding,
      availableDomains,
      isLoading,
      error,
      switchDomain,
      fetchBranding,
      getBrandingForDomain,
    ]
  );

  return (
    <DomainBrandingContext.Provider value={contextValue}>{children}</DomainBrandingContext.Provider>
  );
}

// ============================================================
// HOOKS
// ============================================================

/**
 * Use domain branding context
 * @throws Error if used outside DomainBrandingProvider
 */
export function useDomain(): DomainBrandingContextValue {
  const context = useContext(DomainBrandingContext);
  if (!context) {
    throw new Error("useDomain must be used within a DomainBrandingProvider");
  }
  return context;
}

/**
 * Use active domain only
 */
export function useActiveDomain(): {
  activeDomain: string;
  switchDomain: (domain: string) => void;
  availableDomains: string[];
} {
  const { activeDomain, switchDomain, availableDomains } = useDomain();
  return { activeDomain, switchDomain, availableDomains };
}

/**
 * Use domain branding for a specific domain
 */
export function useDomainBrandingFor(domain: string): DomainBranding {
  const { getBrandingForDomain } = useDomain();
  return useMemo(() => getBrandingForDomain(domain), [domain, getBrandingForDomain]);
}

// ============================================================
// SAMPLE BRANDING CONFIGURATIONS
// ============================================================

/**
 * Example multi-domain branding configuration
 * Use this as a reference for setting up domain branding
 */
export const sampleBrandingConfig: DomainBrandingConfig = {
  default: defaultDomainBranding,
  domains: {
    "acme.com": {
      domain: "acme.com",
      displayName: "ACME Corporation",
      logo: "/brands/acme/logo.svg",
      logoMark: "/brands/acme/logo-mark.svg",
      primaryColor: "#e11d48", // Rose
      secondaryColor: "#be123c",
      accentColor: "#fb7185",
      favicon: "/brands/acme/favicon.ico",
      hasDarkLogo: true,
      logoDark: "/brands/acme/logo-dark.svg",
      logoMarkDark: "/brands/acme/logo-mark-dark.svg",
    },
    "techstart.io": {
      domain: "techstart.io",
      displayName: "TechStart",
      logo: "/brands/techstart/logo.svg",
      logoMark: "/brands/techstart/logo-mark.svg",
      primaryColor: "#7c3aed", // Violet
      secondaryColor: "#6d28d9",
      accentColor: "#a78bfa",
      favicon: "/brands/techstart/favicon.ico",
    },
    "globalcorp.net": {
      domain: "globalcorp.net",
      displayName: "GlobalCorp International",
      logo: "/brands/globalcorp/logo.svg",
      logoMark: "/brands/globalcorp/logo-mark.svg",
      primaryColor: "#0891b2", // Cyan
      secondaryColor: "#0e7490",
      accentColor: "#22d3ee",
      favicon: "/brands/globalcorp/favicon.ico",
      loginBackground: "/brands/globalcorp/login-bg.jpg",
    },
    "financeplus.com": {
      domain: "financeplus.com",
      displayName: "Finance+",
      logo: "/brands/financeplus/logo.svg",
      logoMark: "/brands/financeplus/logo-mark.svg",
      primaryColor: "#059669", // Emerald
      secondaryColor: "#047857",
      accentColor: "#34d399",
      favicon: "/brands/financeplus/favicon.ico",
      emailSignatureTemplate: `
        <div style="font-family: Arial, sans-serif; border-top: 2px solid #059669; padding-top: 12px; margin-top: 20px;">
          <p style="margin: 0; color: #059669; font-weight: bold;">{{name}}</p>
          <p style="margin: 4px 0; color: #666;">{{title}} | Finance+</p>
          <p style="margin: 4px 0; color: #666;">{{email}} | {{phone}}</p>
        </div>
      `,
    },
  },
};

// ============================================================
// EXPORTS
// ============================================================

export { DomainBrandingContext };
export type { DomainBranding, DomainBrandingConfig };
