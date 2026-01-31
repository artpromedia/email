"use client";

/**
 * Domain Policies Tab
 * Configure email policies, retention, and compliance settings
 */

import { useState } from "react";
import { Save, AlertCircle, CheckCircle2, Shield } from "lucide-react";
import type { DomainPolicies } from "@email/types";
import { cn } from "@email/ui";

import { useDomainPolicies, useUpdateDomainPolicies } from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DomainPoliciesTabProps {
  domainId: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainPoliciesTab({ domainId }: DomainPoliciesTabProps) {
  const { data: currentPolicies, isLoading } = useDomainPolicies(domainId);
  const updatePolicies = useUpdateDomainPolicies();

  const [policies, setPolicies] = useState<DomainPolicies>(
    currentPolicies ?? {
      retentionDays: 0,
      archiveAfterDays: 0,
      deleteAfterDays: 0,
      requireEncryption: false,
      allowForwarding: true,
      allowExternalSharing: true,
      dlpEnabled: false,
      dlpRules: [],
      complianceMode: "none",
    }
  );

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      await updatePolicies.mutateAsync({ domainId, policies });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update policies:", error);
    }
  };

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
            Domain Policies
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configure retention, compliance, and security policies
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={updatePolicies.isPending}
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

      {/* Policies Form */}
      <div className="space-y-8">
        {/* Retention Policy */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Retention Policy
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Control how long emails are retained in the system
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="retention-days"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Retention Period (days)
              </label>
              <input
                id="retention-days"
                type="number"
                min="0"
                value={policies.retentionDays}
                onChange={(e) =>
                  setPolicies({ ...policies, retentionDays: parseInt(e.target.value) })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Set to 0 for unlimited retention
              </p>
            </div>

            <div>
              <label
                htmlFor="archive-days"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Archive After (days)
              </label>
              <input
                id="archive-days"
                type="number"
                min="0"
                value={policies.archiveAfterDays}
                onChange={(e) =>
                  setPolicies({ ...policies, archiveAfterDays: parseInt(e.target.value) })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Move emails to archive storage after this many days (0 to disable)
              </p>
            </div>

            <div>
              <label
                htmlFor="delete-days"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Delete After (days)
              </label>
              <input
                id="delete-days"
                type="number"
                min="0"
                value={policies.deleteAfterDays}
                onChange={(e) =>
                  setPolicies({ ...policies, deleteAfterDays: parseInt(e.target.value) })
                }
                className={cn(
                  "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "text-neutral-900 dark:text-neutral-100",
                  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                )}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Permanently delete emails after this many days (0 to disable)
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-900 dark:text-amber-100">
              <p className="font-medium">Data Loss Warning</p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                Deleted emails cannot be recovered. Ensure your retention policy complies with legal
                and business requirements.
              </p>
            </div>
          </div>
        </div>

        {/* Security Policies */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Security Policies
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Control email security and access permissions
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={policies.requireEncryption}
                onChange={(e) => setPolicies({ ...policies, requireEncryption: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Require email encryption
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  All emails must be encrypted in transit and at rest
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={policies.allowForwarding}
                onChange={(e) => setPolicies({ ...policies, allowForwarding: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Allow email forwarding
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Users can forward emails to external addresses
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={policies.allowExternalSharing}
                onChange={(e) =>
                  setPolicies({ ...policies, allowExternalSharing: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Allow external sharing
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Users can share emails and attachments with external recipients
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Data Loss Prevention */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Data Loss Prevention (DLP)
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Prevent sensitive information from being sent via email
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={policies.dlpEnabled}
                onChange={(e) => setPolicies({ ...policies, dlpEnabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Enable DLP scanning
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Scan outgoing emails for sensitive content
                </p>
              </div>
            </label>

            {policies.dlpEnabled && (
              <div>
                <label
                  htmlFor="dlp-rules"
                  className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  DLP Rules
                </label>
                <textarea
                  id="dlp-rules"
                  value={(policies.dlpRules ?? []).join("\n")}
                  onChange={(e) =>
                    setPolicies({
                      ...policies,
                      dlpRules: e.target.value
                        .split("\n")
                        .map((r) => r.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="SSN: \d{3}-\d{2}-\d{4}&#10;Credit Card: \d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}"
                  rows={5}
                  className={cn(
                    "mt-1 w-full rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
                    "bg-white dark:bg-neutral-800",
                    "text-neutral-900 dark:text-neutral-100",
                    "placeholder-neutral-400 dark:placeholder-neutral-500",
                    "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  )}
                />
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  One regex pattern per line. Format: Label: Pattern
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Compliance Mode */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Compliance Mode
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Enable industry-specific compliance features
          </p>

          <div className="mt-4">
            <select
              id="compliance-mode"
              value={policies.complianceMode}
              onChange={(e) =>
                setPolicies({
                  ...policies,
                  complianceMode: e.target.value as "none" | "hipaa" | "gdpr" | "sox" | "finra",
                })
              }
              className={cn(
                "w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm",
                "bg-white dark:bg-neutral-800",
                "text-neutral-900 dark:text-neutral-100",
                "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              )}
            >
              <option value="none">None</option>
              <option value="hipaa">HIPAA (Healthcare)</option>
              <option value="gdpr">GDPR (European Union)</option>
              <option value="sox">SOX (Financial)</option>
              <option value="finra">FINRA (Securities)</option>
            </select>

            {policies.complianceMode && policies.complianceMode !== "none" && (
              <div className="mt-4 flex items-start gap-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium">
                    {policies.complianceMode.toUpperCase()} Compliance Enabled
                  </p>
                  <p className="mt-1 text-blue-800 dark:text-blue-200">
                    Additional security and audit features are enabled to help meet compliance
                    requirements. Consult with your compliance officer to ensure proper
                    configuration.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Alert */}
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium">Policy Enforcement</p>
            <p className="mt-1 text-blue-800 dark:text-blue-200">
              Policy changes take effect immediately for new emails. Existing emails are processed
              according to the policies in effect when they were received.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
