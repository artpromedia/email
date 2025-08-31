// Feature flags configuration for admin app
import { useState, useEffect } from "react";

export interface FeatureFlags {
  ADMIN_QUARANTINE_ENABLED: boolean;
  ADMIN_POLICIES_ENABLED: boolean;
  ADMIN_DELIVERABILITY_ENABLED: boolean;
  ADMIN_AUDITLOG_ENABLED: boolean;
}

// Default feature flags - fallback to true for development
const defaultFlags: FeatureFlags = {
  ADMIN_QUARANTINE_ENABLED: true,
  ADMIN_POLICIES_ENABLED: true,
  ADMIN_DELIVERABILITY_ENABLED: true,
  ADMIN_AUDITLOG_ENABLED: true,
};

// Allow localStorage overrides for development
function getFeatureFlag(key: keyof FeatureFlags): boolean {
  const localOverride = localStorage.getItem(`feature_flag_${key}`);
  if (localOverride !== null) {
    return localOverride === "true";
  }
  return defaultFlags[key];
}

export function getFeatureFlags(): FeatureFlags {
  return {
    ADMIN_QUARANTINE_ENABLED: getFeatureFlag("ADMIN_QUARANTINE_ENABLED"),
    ADMIN_POLICIES_ENABLED: getFeatureFlag("ADMIN_POLICIES_ENABLED"),
    ADMIN_DELIVERABILITY_ENABLED: getFeatureFlag(
      "ADMIN_DELIVERABILITY_ENABLED",
    ),
    ADMIN_AUDITLOG_ENABLED: getFeatureFlag("ADMIN_AUDITLOG_ENABLED"),
  };
}

export function setFeatureFlag(key: keyof FeatureFlags, value: boolean): void {
  localStorage.setItem(`feature_flag_${key}`, value.toString());
}

export function clearFeatureFlag(key: keyof FeatureFlags): void {
  localStorage.removeItem(`feature_flag_${key}`);
}

// Hook for accessing feature flags in components
export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(getFeatureFlags);

  useEffect(() => {
    const handleStorageChange = () => {
      setFlags(getFeatureFlags());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return flags;
}

export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  const flags = useFeatureFlags();
  return flags[flag];
}
