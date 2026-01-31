"use client";

/**
 * Domain Settings Tab
 * Configure domain-level email settings and policies
 */

import { useState } from "react";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import type { DomainSettings } from "@email/types";
import { cn } from "@email/ui";

import { useDomainSettings, useUpdateDomainSettings } from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DomainSettingsTabProps {
  domainId: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainSettingsTab({ domainId }: Readonly<DomainSettingsTabProps>) {
  const { data: currentSettings, isLoading } = useDomainSettings(domainId);
  const updateSettings = useUpdateDomainSettings();

  const [settings, setSettings] = useState<DomainSettings>(
    currentSettings ?? {
      catchAllEnabled: false,
      catchAllAddress: "",
      defaultStorageQuotaBytes: 10737418240, // 10 GB
      maxMessageSizeBytes: 26214400, // 25 MB
      maxRecipientsPerMessage: 100,
      maxMessagesPerDay: 10000,
      spfPolicy: "softfail",
      dmarcPolicy: "quarantine",
      requireTls: true,
      allowedIpRanges: [],
      blockedCountries: [],
    }
  );

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ domainId, settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const formatGB = (bytes: number) => Math.round(bytes / 1073741824);
  const formatMB = (bytes: number) => Math.round(bytes / 1048576);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Domain Settings
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configure email settings and policies for this domain
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700",
            "disabled:opacity-50",
            "transition-colors duration-100"
          )}
        >
          {saved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Settings Form */}
      <div className="space-y-8">
        {/* Catch-All Email */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Catch-All Email
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Receive emails sent to any address at this domain, even if the address doesn't exist
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.catchAllEnabled}
                onChange={(e) => setSettings({ ...settings, catchAllEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">
                Enable catch-all email
              </span>
            </label>

            {settings.catchAllEnabled && (
              <div>
                <label
                  htmlFor="catch-all-address"
                  className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Catch-All Address
                </label>
                <input
                  id="catch-all-address"
                  type="email"
                  value={settings.catchAllAddress}
                  onChange={(e) => setSettings({ ...settings, catchAllAddress: e.target.value })}
                  placeholder="admin@example.com"
                  className={cn(
                    "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                    "bg-white dark:bg-neutral-800",
                    "text-neutral-900 dark:text-neutral-100",
                    "placeholder-neutral-400 dark:placeholder-neutral-500",
                    "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  )}
                />
              </div>
            )}
          </div>
        </div>

        {/* Storage & Limits */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Storage & Limits
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Set default quotas and limits for users on this domain
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="storage-quota"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Default Storage Quota (GB)
              </label>
              <input
                id="storage-quota"
                type="number"
                min="1"
                max="1000"
                value={formatGB(settings.defaultStorageQuotaBytes ?? 0)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultStorageQuotaBytes: Number.parseInt(e.target.value) * 1073741824,
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
            </div>

            <div>
              <label
                htmlFor="max-message-size"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Max Message Size (MB)
              </label>
              <input
                id="max-message-size"
                type="number"
                min="1"
                max="100"
                value={formatMB(settings.maxMessageSizeBytes)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxMessageSizeBytes: Number.parseInt(e.target.value) * 1048576,
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
            </div>

            <div>
              <label
                htmlFor="max-recipients"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Max Recipients Per Message
              </label>
              <input
                id="max-recipients"
                type="number"
                min="1"
                max="1000"
                value={settings.maxRecipientsPerMessage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxRecipientsPerMessage: Number.parseInt(e.target.value),
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
            </div>

            <div>
              <label
                htmlFor="max-messages"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Max Messages Per Day
              </label>
              <input
                id="max-messages"
                type="number"
                min="100"
                max="100000"
                step="100"
                value={settings.maxMessagesPerDay}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxMessagesPerDay: Number.parseInt(e.target.value),
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
            </div>
          </div>
        </div>

        {/* Email Authentication */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Email Authentication
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configure SPF, DKIM, and DMARC policies
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="spf-policy"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                SPF Policy
              </label>
              <select
                id="spf-policy"
                value={settings.spfPolicy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    spfPolicy: e.target.value as "none" | "softfail" | "fail",
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              >
                <option value="none">None (~all)</option>
                <option value="softfail">Soft Fail (~all)</option>
                <option value="fail">Hard Fail (-all)</option>
              </select>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Controls how strictly SPF failures are treated
              </p>
            </div>

            <div>
              <label
                htmlFor="dmarc-policy"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                DMARC Policy
              </label>
              <select
                id="dmarc-policy"
                value={settings.dmarcPolicy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dmarcPolicy: e.target.value as "none" | "quarantine" | "reject",
                  })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              >
                <option value="none">None (monitor only)</option>
                <option value="quarantine">Quarantine</option>
                <option value="reject">Reject</option>
              </select>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Start with "quarantine" and move to "reject" after monitoring
              </p>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">Security</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configure security and access controls
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-2" aria-label="Require TLS encryption">
              <input
                type="checkbox"
                checked={settings.requireTls}
                onChange={(e) => setSettings({ ...settings, requireTls: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Require TLS encryption
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Reject unencrypted connections (recommended)
                </p>
              </div>
            </label>

            <div>
              <label
                htmlFor="allowed-ip-ranges"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Allowed IP Ranges (optional)
              </label>
              <textarea
                id="allowed-ip-ranges"
                value={(settings.allowedIpRanges ?? []).join("\n")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    allowedIpRanges: e.target.value
                      .split("\n")
                      .map((ip) => ip.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="192.168.1.0/24&#10;10.0.0.0/8"
                rows={3}
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "placeholder-neutral-400 dark:placeholder-neutral-500",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                One IP range per line. Leave empty to allow all IPs.
              </p>
            </div>

            <div>
              <label
                htmlFor="blocked-countries"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Blocked Countries (optional)
              </label>
              <textarea
                id="blocked-countries"
                value={(settings.blockedCountries ?? []).join("\n")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    blockedCountries: e.target.value
                      .split("\n")
                      .map((c) => c.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
                placeholder="CN&#10;RU&#10;KP"
                rows={3}
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "placeholder-neutral-400 dark:placeholder-neutral-500",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Two-letter country codes (ISO 3166-1 alpha-2), one per line
              </p>
            </div>
          </div>
        </div>

        {/* Info Alert */}
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium">Settings Apply Domain-Wide</p>
            <p className="mt-1 text-blue-800 dark:text-blue-200">
              These settings apply to all users on this domain. Individual user settings can
              override these defaults.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
