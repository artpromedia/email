"use client";

/**
 * DKIM Keys Tab
 * Manage DKIM keys for domain authentication
 */

import { useState } from "react";
import { Plus, Key, Check, MoreHorizontal, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
import type { DkimKey } from "@email/types";
import { cn } from "@email/ui";

import {
  useDkimKeys,
  useGenerateDkimKey,
  useActivateDkimKey,
  useDeleteDkimKey,
} from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DkimKeysTabProps {
  readonly domainId: string;
}

// ============================================================
// COPY BUTTON
// ============================================================

interface CopyButtonProps {
  readonly text: string;
}

function CopyButton({ text }: Readonly<CopyButtonProps>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "rounded p-1 transition-colors",
        copied
          ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

// ============================================================
// DKIM KEY CARD
// ============================================================

interface DkimKeyCardProps {
  readonly dkimKey: DkimKey;
  readonly onActivate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

function DkimKeyCard({ dkimKey, onActivate, onDelete }: Readonly<DkimKeyCardProps>) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-lg p-2",
              dkimKey.isActive
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
            )}
          >
            <Key className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                {dkimKey.selector}
              </h3>
              {dkimKey.isActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {dkimKey.bits}-bit {dkimKey.algorithm.toUpperCase()}
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Created {new Date(dkimKey.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!dkimKey.isActive && (
            <button
              type="button"
              onClick={() => onActivate(dkimKey.id)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium",
                "bg-blue-600 text-white hover:bg-blue-700",
                "transition-colors duration-100"
              )}
            >
              Activate
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(dkimKey.id)}
            className={cn("rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Public Key */}
      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          DNS Record
        </div>
        <div className="rounded bg-neutral-50 p-3 dark:bg-neutral-800/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 overflow-x-auto">
              <div className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Host / Name:
              </div>
              <code className="text-xs text-neutral-900 dark:text-neutral-100">
                {dkimKey.selector}._domainkey.{dkimKey.domainName}
              </code>
            </div>
            <CopyButton text={`${dkimKey.selector}._domainkey.${dkimKey.domainName}`} />
          </div>
          <div className="mt-2 flex items-start justify-between gap-2">
            <div className="flex-1 overflow-x-auto">
              <div className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">Value:</div>
              <code className="break-all text-xs text-neutral-900 dark:text-neutral-100">
                v=DKIM1; k={dkimKey.algorithm}; p={dkimKey.publicKey}
              </code>
            </div>
            <CopyButton text={`v=DKIM1; k=${dkimKey.algorithm}; p=${dkimKey.publicKey}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DkimKeysTab({ domainId }: DkimKeysTabProps) {
  const { data: dkimKeys, isLoading } = useDkimKeys(domainId);
  const generateKey = useGenerateDkimKey();
  const activateKey = useActivateDkimKey();
  const deleteKey = useDeleteDkimKey();

  const handleGenerateKey = async () => {
    try {
      await generateKey.mutateAsync({
        domainId,
        selector: `dkim-${Date.now()}`,
        algorithm: "rsa",
        bits: 2048,
      });
    } catch (error) {
      console.error("Failed to generate DKIM key:", error);
    }
  };

  const handleActivateKey = async (keyId: string) => {
    try {
      await activateKey.mutateAsync({ domainId, keyId });
    } catch (error) {
      console.error("Failed to activate DKIM key:", error);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this DKIM key?")) return;

    try {
      await deleteKey.mutateAsync({ domainId, keyId });
    } catch (error) {
      console.error("Failed to delete DKIM key:", error);
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
            DKIM Keys
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage cryptographic keys for email authentication
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateKey}
          disabled={generateKey.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            "bg-blue-600 text-white hover:bg-blue-700",
            "disabled:opacity-50",
            "transition-colors duration-100"
          )}
        >
          <Plus className="h-4 w-4" />
          Generate Key
        </button>
      </div>

      {/* Info Alert */}
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-sm text-blue-900 dark:text-blue-100">
          <p className="font-medium">About DKIM Keys</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            DKIM (DomainKeys Identified Mail) adds a digital signature to your emails to verify
            they're genuinely from your domain. Add the DNS record for each key, then activate it.
            Only one key can be active at a time.
          </p>
        </div>
      </div>

      {/* Keys List */}
      {dkimKeys && dkimKeys.length > 0 ? (
        <div className="space-y-4">
          {dkimKeys.map((key) => (
            <DkimKeyCard
              key={key.id}
              dkimKey={key}
              onActivate={handleActivateKey}
              onDelete={handleDeleteKey}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white py-12 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
            <Key className="h-6 w-6 text-neutral-400" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
            No DKIM keys yet
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Generate your first DKIM key to start signing emails
          </p>
        </div>
      )}

      {/* Key Rotation Reminder */}
      {dkimKeys && dkimKeys.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Key Rotation Best Practice</p>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              It's recommended to rotate DKIM keys every 6-12 months. Generate a new key, add the
              DNS record, activate it, then delete the old key after a few weeks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
