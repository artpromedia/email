"use client";

/**
 * DNS Records Tab
 * Visual DNS status display with verification
 */

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useDnsRecords,
  useVerifyDns,
  type DnsRecord,
  type DnsRecordStatus,
} from "@/lib/admin";

// ============================================================
// COPY BUTTON COMPONENT
// ============================================================

interface CopyButtonProps {
  value: string;
  label?: string;
}

function CopyButton({ value, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors",
        copied
          ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
          : "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700"
      )}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}

// ============================================================
// DNS RECORD CARD COMPONENT
// ============================================================

interface DnsRecordCardProps {
  record: DnsRecord;
}

function DnsRecordCard({ record }: DnsRecordCardProps) {
  const getStatusConfig = (status: DnsRecordStatus) => {
    switch (status) {
      case "verified":
        return {
          icon: CheckCircle2,
          label: "Verified",
          bgColor: "bg-green-50 dark:bg-green-900/10",
          borderColor: "border-green-200 dark:border-green-800",
          iconColor: "text-green-500",
          textColor: "text-green-700 dark:text-green-400",
        };
      case "missing":
        return {
          icon: XCircle,
          label: "Not Found",
          bgColor: "bg-red-50 dark:bg-red-900/10",
          borderColor: "border-red-200 dark:border-red-800",
          iconColor: "text-red-500",
          textColor: "text-red-700 dark:text-red-400",
        };
      case "mismatch":
        return {
          icon: AlertCircle,
          label: "Mismatch",
          bgColor: "bg-yellow-50 dark:bg-yellow-900/10",
          borderColor: "border-yellow-200 dark:border-yellow-800",
          iconColor: "text-yellow-500",
          textColor: "text-yellow-700 dark:text-yellow-400",
        };
      case "pending":
        return {
          icon: Clock,
          label: "Pending",
          bgColor: "bg-neutral-50 dark:bg-neutral-800",
          borderColor: "border-neutral-200 dark:border-neutral-700",
          iconColor: "text-neutral-400",
          textColor: "text-neutral-600 dark:text-neutral-400",
        };
    }
  };

  const config = getStatusConfig(record.status);
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        config.borderColor,
        config.bgColor
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">
            {record.type}
          </span>
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {record.description}
          </h3>
          {record.isRequired && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
              Required
            </span>
          )}
        </div>
        <div className={cn("flex items-center gap-2", config.textColor)}>
          <StatusIcon className={cn("h-5 w-5", config.iconColor)} />
          <span className="text-sm font-medium">{config.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Name */}
        <div>
          <p className="text-xs text-neutral-500 uppercase mb-1">
            Host / Name
          </p>
          <code className="block text-sm font-mono bg-white dark:bg-neutral-900 px-3 py-2 rounded border border-neutral-200 dark:border-neutral-700">
            {record.name}
          </code>
        </div>

        {/* Expected Value */}
        <div>
          <p className="text-xs text-neutral-500 uppercase mb-1">
            Expected Value
          </p>
          <div className="flex items-start gap-2">
            <code className="flex-1 block text-sm font-mono bg-white dark:bg-neutral-900 px-3 py-2 rounded border border-neutral-200 dark:border-neutral-700 break-all">
              {record.priority ? `${record.priority} ` : ""}
              {record.expectedValue}
            </code>
          </div>
        </div>

        {/* Found Value */}
        {record.foundValue && (
          <div>
            <p className="text-xs text-neutral-500 uppercase mb-1">
              Found Value
            </p>
            <code
              className={cn(
                "block text-sm font-mono px-3 py-2 rounded border break-all",
                record.status === "verified"
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
                  : record.status === "mismatch"
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300"
                    : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
              )}
            >
              {record.foundValue}
            </code>
          </div>
        )}

        {/* Copy Button for non-verified records */}
        {record.status !== "verified" && (
          <div className="pt-2">
            <CopyButton value={record.expectedValue} label="Copy Record Value" />
          </div>
        )}
      </div>

      {/* Last Checked */}
      {record.lastChecked && (
        <div className="px-4 py-2 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-neutral-500">
            Last checked: {new Date(record.lastChecked).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-48 bg-neutral-200 dark:bg-neutral-700 rounded-lg"
        />
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface DnsRecordsTabProps {
  domainId: string;
  domain: string;
}

export function DnsRecordsTab({ domainId, domain }: DnsRecordsTabProps) {
  const { data: records, isLoading, refetch } = useDnsRecords(domainId);
  const verifyDns = useVerifyDns();

  const handleVerifyAll = useCallback(() => {
    verifyDns.mutate(domainId, {
      onSuccess: () => {
        void refetch();
      },
    });
  }, [domainId, verifyDns, refetch]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const verifiedCount = records?.filter((r) => r.status === "verified").length ?? 0;
  const totalCount = records?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            DNS Records
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Configure these DNS records for <strong>{domain}</strong> to enable email functionality
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            {verifiedCount}/{totalCount} verified
          </span>
          <button
            onClick={handleVerifyAll}
            disabled={verifyDns.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg",
              "bg-blue-600 text-white hover:bg-blue-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", verifyDns.isPending && "animate-spin")} />
            Check DNS Now
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <ExternalLink className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              DNS changes can take up to 48 hours to propagate globally.
              You can check the status anytime by clicking "Check DNS Now".
            </p>
          </div>
        </div>
      </div>

      {/* DNS Records */}
      <div className="space-y-4">
        {records?.map((record) => (
          <DnsRecordCard key={record.id} record={record} />
        ))}
      </div>

      {/* Auto-check info */}
      <div className="text-center text-sm text-neutral-500 dark:text-neutral-400 py-4">
        DNS records are automatically checked every 6 hours
      </div>
    </div>
  );
}
