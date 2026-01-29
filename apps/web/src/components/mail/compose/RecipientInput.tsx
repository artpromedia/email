"use client";

/**
 * Recipient Input Component
 * Email recipient input with autocomplete and cross-domain hints
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { X, Building2, Globe, Clock, User, AlertCircle } from "lucide-react";
import { cn } from "@email/ui";

import { useRecipientHints, useCheckRecipientInternal } from "@/lib/mail/compose-api";
import type { EmailRecipient, RecipientHint } from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

interface RecipientInputProps {
  /** Field label */
  label: string;
  /** Current recipients */
  recipients: EmailRecipient[];
  /** Callback when recipients change */
  onRecipientsChange: (recipients: EmailRecipient[]) => void;
  /** Current domain ID (for internal detection) */
  fromDomainId?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Validation error */
  error?: string;
  /** Whether to show the field */
  visible?: boolean;
  /** Class name for the container */
  className?: string;
}

// ============================================================
// EMAIL VALIDATION
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.toLowerCase().trim());
}

function parseEmailInput(input: string): { email: string; name?: string } {
  // Handle "Name <email>" format
  const match = /^(.+?)\s*<([^>]+)>$/.exec(input);
  if (match) {
    return { name: match[1]?.trim(), email: match[2]?.trim().toLowerCase() ?? "" };
  }
  return { email: input.trim().toLowerCase() };
}

// ============================================================
// RECIPIENT CHIP COMPONENT
// ============================================================

interface RecipientChipProps {
  recipient: EmailRecipient;
  onRemove: () => void;
  fromDomainId?: string;
}

function RecipientChip({ recipient, onRemove, fromDomainId }: RecipientChipProps) {
  const displayName = recipient.name ?? recipient.email;
  const isInvalid = !recipient.isValid;
  const isSameDomain = recipient.internalDomainId === fromDomainId;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm",
        "border transition-colors duration-100",
        isInvalid
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
          : recipient.isInternal
            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
            : "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
      )}
      title={isInvalid ? recipient.error : recipient.email}
    >
      {/* Status icon */}
      {isInvalid ? (
        <AlertCircle className="h-3 w-3" />
      ) : recipient.isInternal ? (
        <Building2 className="h-3 w-3" />
      ) : null}

      {/* Name/email */}
      <span className="max-w-[150px] truncate">{displayName}</span>

      {/* Internal badge */}
      {recipient.isInternal && !isSameDomain && (
        <span className="text-xs opacity-75">({recipient.internalDomainId?.split(".")[0]})</span>
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10",
          "transition-colors duration-100"
        )}
        aria-label={`Remove ${displayName}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================
// SUGGESTION ITEM COMPONENT
// ============================================================

interface SuggestionItemProps {
  hint: RecipientHint;
  contact?: { email: string; name?: string };
  isHighlighted: boolean;
  onClick: () => void;
}

function SuggestionItem({ hint, contact, isHighlighted, onClick }: SuggestionItemProps) {
  const Icon = useMemo(() => {
    switch (hint.type) {
      case "internal":
      case "same-domain":
        return Building2;
      case "recent":
        return Clock;
      case "contact":
        return User;
      default:
        return Globe;
    }
  }, [hint.type]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left",
        "transition-colors duration-100",
        isHighlighted
          ? "bg-blue-50 dark:bg-blue-950/30"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      )}
    >
      {/* Type icon with color */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
          hint.type === "internal" || hint.type === "same-domain"
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            : hint.type === "recent"
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Contact info */}
      <div className="min-w-0 flex-1">
        {contact?.name && (
          <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {contact.name}
          </div>
        )}
        <div className="truncate text-sm text-neutral-600 dark:text-neutral-400">{hint.email}</div>
      </div>

      {/* Hint message / badge */}
      <div className="flex-shrink-0">
        {(hint.type === "internal" || hint.type === "same-domain") && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Building2 className="h-3 w-3" />
            Internal
          </span>
        )}
        {hint.domainInfo && (
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: hint.domainInfo.color }}
          >
            {hint.domainInfo.name}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function RecipientInput({
  label,
  recipients,
  onRecipientsChange,
  fromDomainId,
  placeholder = "Add recipients...",
  required = false,
  error,
  visible = true,
  className,
}: RecipientInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions
  const { data: suggestionsData } = useRecipientHints(inputValue, fromDomainId);
  const checkInternal = useCheckRecipientInternal();

  const suggestions = useMemo(() => {
    if (!suggestionsData) return [];
    return suggestionsData.hints.map((hint) => ({
      hint,
      contact: suggestionsData.contacts.find((c) => c.email === hint.email),
    }));
  }, [suggestionsData]);

  const showSuggestions = isFocused && inputValue.length >= 2 && suggestions.length > 0;

  // Add recipient
  const addRecipient = useCallback(
    async (input: string) => {
      const { email, name } = parseEmailInput(input);
      if (!email) return;

      // Check if already exists
      if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
        return;
      }

      const isValid = validateEmail(email);
      let isInternal = false;
      let internalDomainId: string | undefined;

      // Check if internal
      if (isValid) {
        try {
          const hint = await checkInternal.mutateAsync(email);
          isInternal = hint.type === "internal" || hint.type === "same-domain";
          internalDomainId = hint.domainInfo?.id;
        } catch {
          // Ignore errors, assume external
        }
      }

      const newRecipient: EmailRecipient = {
        email,
        name,
        isInternal,
        internalDomainId,
        isValid,
        error: isValid ? undefined : "Invalid email address",
      };

      onRecipientsChange([...recipients, newRecipient]);
      setInputValue("");
      setHighlightedIndex(-1);
    },
    [recipients, onRecipientsChange, checkInternal]
  );

  // Remove recipient
  const removeRecipient = useCallback(
    (email: string) => {
      onRecipientsChange(recipients.filter((r) => r.email !== email));
    },
    [recipients, onRecipientsChange]
  );

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setHighlightedIndex(-1);
  }, []);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter or comma to add
      if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          void addRecipient(suggestions[highlightedIndex].hint.email);
        } else {
          void addRecipient(inputValue);
        }
        return;
      }

      // Tab with text to add
      if (e.key === "Tab" && inputValue.trim()) {
        e.preventDefault();
        void addRecipient(inputValue);
        return;
      }

      // Backspace to remove last recipient when input is empty
      if (e.key === "Backspace" && !inputValue && recipients.length > 0) {
        const lastRecipient = recipients[recipients.length - 1];
        if (lastRecipient) {
          removeRecipient(lastRecipient.email);
        }
        return;
      }

      // Arrow navigation for suggestions
      if (showSuggestions) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (e.key === "Escape") {
          setHighlightedIndex(-1);
        }
      }
    },
    [
      inputValue,
      recipients,
      showSuggestions,
      suggestions,
      highlightedIndex,
      addRecipient,
      removeRecipient,
    ]
  );

  // Handle blur with delay for click handling
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsFocused(false);
      // Add any remaining input as recipient
      if (inputValue.trim()) {
        void addRecipient(inputValue);
      }
    }, 200);
  }, [inputValue, addRecipient]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (email: string) => {
      void addRecipient(email);
      inputRef.current?.focus();
    },
    [addRecipient]
  );

  // Focus input when clicking container
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  if (!visible) return null;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      {/* Label */}
      <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {/* Input container - clicking anywhere focuses the input */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={handleContainerClick}
        className={cn(
          "flex cursor-text flex-wrap items-center gap-1.5 rounded-lg border p-2",
          "min-h-[42px] transition-colors duration-100",
          error
            ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20"
            : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
          isFocused && !error && "border-blue-500 ring-2 ring-blue-500"
        )}
      >
        {/* Recipient chips */}
        {recipients.map((recipient) => (
          <RecipientChip
            key={recipient.email}
            recipient={recipient}
            fromDomainId={fromDomainId}
            onRemove={() => removeRecipient(recipient.email)}
          />
        ))}

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          placeholder={recipients.length === 0 ? placeholder : ""}
          className={cn(
            "min-w-[120px] flex-1 bg-transparent outline-none",
            "text-neutral-900 dark:text-neutral-100",
            "placeholder-neutral-400 dark:placeholder-neutral-500"
          )}
          aria-label={label}
          autoComplete="off"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-1 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1",
            "rounded-lg bg-white shadow-lg dark:bg-neutral-900",
            "border border-neutral-200 dark:border-neutral-700",
            "max-h-60 overflow-auto"
          )}
        >
          {suggestions.map((item, index) => (
            <SuggestionItem
              key={item.hint.email}
              hint={item.hint}
              contact={item.contact}
              isHighlighted={index === highlightedIndex}
              onClick={() => handleSuggestionClick(item.hint.email)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// INTERNAL BADGE COMPONENT (for standalone use)
// ============================================================

interface InternalBadgeProps {
  domainName?: string;
  domainColor?: string;
  className?: string;
}

export function InternalBadge({ domainName, domainColor, className }: InternalBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        className
      )}
    >
      <Building2 className="h-3 w-3" />
      <span>Internal</span>
      {domainName && (
        <>
          <span className="opacity-50">-</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ backgroundColor: domainColor }}
          >
            {domainName}
          </span>
        </>
      )}
    </span>
  );
}
