"use client";

/**
 * Compose Header Component
 * Email compose header with From, To, Cc, Bcc, Subject fields
 */

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@email/ui";

import { FromAddressSelector } from "./FromAddressSelector";
import { RecipientInput } from "./RecipientInput";
import type { SendableAddress, EmailRecipient } from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

interface ComposeHeaderProps {
  /** Selected from address */
  fromAddress: SendableAddress | null;
  /** All available from addresses */
  fromAddresses: SendableAddress[];
  /** Send mode for shared mailboxes */
  sendMode: "send-as" | "send-on-behalf";
  /** To recipients */
  toRecipients: EmailRecipient[];
  /** CC recipients */
  ccRecipients: EmailRecipient[];
  /** BCC recipients */
  bccRecipients: EmailRecipient[];
  /** Email subject */
  subject: string;
  /** Validation errors */
  errors?: {
    from?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
  };
  /** Callback when from address changes */
  onFromChange: (address: SendableAddress) => void;
  /** Callback when send mode changes */
  onSendModeChange: (mode: "send-as" | "send-on-behalf") => void;
  /** Callback when To recipients change */
  onToChange: (recipients: EmailRecipient[]) => void;
  /** Callback when CC recipients change */
  onCcChange: (recipients: EmailRecipient[]) => void;
  /** Callback when BCC recipients change */
  onBccChange: (recipients: EmailRecipient[]) => void;
  /** Callback when subject changes */
  onSubjectChange: (subject: string) => void;
  /** Whether fields are disabled */
  disabled?: boolean;
  /** Class name */
  className?: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ComposeHeader({
  fromAddress,
  fromAddresses,
  sendMode,
  toRecipients,
  ccRecipients,
  bccRecipients,
  subject,
  errors = {},
  onFromChange,
  onSendModeChange,
  onToChange,
  onCcChange,
  onBccChange,
  onSubjectChange,
  disabled = false,
  className,
}: ComposeHeaderProps) {
  const [showCcBcc, setShowCcBcc] = useState(ccRecipients.length > 0 || bccRecipients.length > 0);

  const toggleCcBcc = useCallback(() => {
    setShowCcBcc((prev) => !prev);
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      {/* From Field */}
      <div className="flex items-start gap-3">
        <span className="w-16 flex-shrink-0 pt-2.5 text-right text-sm font-medium text-neutral-500 dark:text-neutral-400">
          From
        </span>
        <div className="flex-1">
          <FromAddressSelector
            selectedAddress={fromAddress}
            addresses={fromAddresses}
            onSelect={onFromChange}
            sendMode={sendMode}
            onSendModeChange={onSendModeChange}
            disabled={disabled}
            error={errors.from}
          />
        </div>
      </div>

      {/* To Field */}
      <div className="flex items-start gap-3">
        <span className="w-16 flex-shrink-0 pt-2.5 text-right text-sm font-medium text-neutral-500 dark:text-neutral-400">
          To
        </span>
        <div className="flex flex-1 items-start gap-2">
          <div className="flex-1">
            <RecipientInput
              label=""
              recipients={toRecipients}
              onRecipientsChange={onToChange}
              fromDomainId={fromAddress?.domainId}
              placeholder="Add recipients..."
              required
              error={errors.to}
            />
          </div>
          {/* Cc/Bcc toggle */}
          <button
            type="button"
            onClick={toggleCcBcc}
            className={cn(
              "mt-2 rounded px-2 py-1 text-sm font-medium",
              "text-neutral-500 dark:text-neutral-400",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              "transition-colors duration-100"
            )}
          >
            {showCcBcc ? (
              <span className="flex items-center gap-1">
                <ChevronUp className="h-4 w-4" />
                Hide
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Cc/Bcc
                <ChevronDown className="h-4 w-4" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* CC Field */}
      {showCcBcc && (
        <div className="flex items-start gap-3">
          <span className="w-16 flex-shrink-0 pt-2.5 text-right text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Cc
          </span>
          <div className="flex-1">
            <RecipientInput
              label=""
              recipients={ccRecipients}
              onRecipientsChange={onCcChange}
              fromDomainId={fromAddress?.domainId}
              placeholder="Add Cc recipients..."
              error={errors.cc}
            />
          </div>
        </div>
      )}

      {/* BCC Field */}
      {showCcBcc && (
        <div className="flex items-start gap-3">
          <span className="w-16 flex-shrink-0 pt-2.5 text-right text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Bcc
          </span>
          <div className="flex-1">
            <RecipientInput
              label=""
              recipients={bccRecipients}
              onRecipientsChange={onBccChange}
              fromDomainId={fromAddress?.domainId}
              placeholder="Add Bcc recipients..."
              error={errors.bcc}
            />
          </div>
        </div>
      )}

      {/* Subject Field */}
      <div className="flex items-start gap-3">
        <label
          htmlFor="compose-subject"
          className="w-16 flex-shrink-0 pt-2.5 text-right text-sm font-medium text-neutral-500 dark:text-neutral-400"
        >
          Subject
        </label>
        <div className="flex-1">
          <input
            id="compose-subject"
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            disabled={disabled}
            placeholder="Enter subject..."
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-neutral-900 dark:text-neutral-100",
              "placeholder-neutral-400 dark:placeholder-neutral-500",
              "focus:outline-none focus:ring-2 focus:ring-blue-500",
              "transition-colors duration-100",
              "disabled:cursor-not-allowed disabled:opacity-60",
              errors.subject
                ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20"
                : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            )}
          />
          {errors.subject && (
            <div className="mt-1 text-sm text-amber-600 dark:text-amber-400">{errors.subject}</div>
          )}
        </div>
      </div>

      {/* Domain indicator bar */}
      {fromAddress && (
        <div className="flex items-center gap-3 border-t border-neutral-200 pt-2 dark:border-neutral-700">
          <span className="w-16 flex-shrink-0 text-right" />
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: fromAddress.domainColor }}
            />
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Sending from{" "}
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {fromAddress.domainName}
              </span>
            </span>
            {fromAddress.type === "shared" && sendMode === "send-on-behalf" && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                (on behalf of {fromAddress.email})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPACT HEADER FOR MINIMIZED VIEW
// ============================================================

interface ComposeHeaderCompactProps {
  fromAddress: SendableAddress | null;
  toRecipients: EmailRecipient[];
  subject: string;
  onClick: () => void;
}

export function ComposeHeaderCompact({
  fromAddress,
  toRecipients,
  subject,
  onClick,
}: ComposeHeaderCompactProps) {
  const toText =
    toRecipients.length > 0
      ? toRecipients.map((r) => r.name ?? r.email).join(", ")
      : "No recipients";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 p-3 text-left",
        "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
        "transition-colors duration-100"
      )}
    >
      {/* Domain color indicator */}
      {fromAddress && (
        <div
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: fromAddress.domainColor }}
        />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">To:</span>
          <span className="truncate text-sm text-neutral-900 dark:text-neutral-100">{toText}</span>
        </div>
        <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {subject || "(No subject)"}
        </div>
      </div>

      {/* Expand icon */}
      <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-400" />
    </button>
  );
}
