"use client";

/**
 * From Address Selector Component
 * Dropdown for selecting sending address with domain grouping
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, Star, Users, Check, AlertCircle } from "lucide-react";
import { cn } from "@email/ui";

import type { SendableAddress } from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

interface FromAddressSelectorProps {
  /** Currently selected address */
  selectedAddress: SendableAddress | null;
  /** All available addresses */
  addresses: SendableAddress[];
  /** Callback when address is selected */
  onSelect: (address: SendableAddress) => void;
  /** Current send mode (for shared mailboxes) */
  sendMode?: "send-as" | "send-on-behalf";
  /** Callback when send mode changes */
  onSendModeChange?: (mode: "send-as" | "send-on-behalf") => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Validation error message */
  error?: string;
  /** Class name for the container */
  className?: string;
}

interface AddressGroupProps {
  title: string;
  addresses: SendableAddress[];
  selectedId: string | null;
  onSelect: (address: SendableAddress) => void;
}

// ============================================================
// ADDRESS GROUP COMPONENT
// ============================================================

function AddressGroup({ title, addresses, selectedId, onSelect }: AddressGroupProps) {
  if (addresses.length === 0) return null;

  return (
    <div className="py-1">
      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {title}
      </div>
      {addresses.map((address) => (
        <AddressOption
          key={address.id}
          address={address}
          isSelected={address.id === selectedId}
          onSelect={() => onSelect(address)}
        />
      ))}
    </div>
  );
}

// ============================================================
// ADDRESS OPTION COMPONENT
// ============================================================

interface AddressOptionProps {
  address: SendableAddress;
  isSelected: boolean;
  onSelect: () => void;
}

function AddressOption({ address, isSelected, onSelect }: AddressOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        "transition-colors duration-100",
        isSelected && "bg-blue-50 dark:bg-blue-950/30"
      )}
    >
      {/* Selection indicator */}
      <div className="w-5 flex-shrink-0">
        {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
      </div>

      {/* Domain color indicator */}
      <div
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: address.domainColor }}
      />

      {/* Address info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {address.displayName}
          </span>
          {address.isPrimary && (
            <Star className="h-3.5 w-3.5 flex-shrink-0 fill-amber-500 text-amber-500" />
          )}
          {address.type === "shared" && (
            <Users className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
          )}
        </div>
        <div className="truncate text-sm text-neutral-500 dark:text-neutral-400">
          {address.email}
        </div>
      </div>

      {/* Verification status */}
      {!address.isVerified && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs">Unverified</span>
        </div>
      )}
    </button>
  );
}

// ============================================================
// SEND MODE SELECTOR
// ============================================================

interface SendModeSelectorProps {
  address: SendableAddress;
  mode: "send-as" | "send-on-behalf";
  onChange: (mode: "send-as" | "send-on-behalf") => void;
}

function SendModeSelector({ address, mode, onChange }: SendModeSelectorProps) {
  if (address.type !== "shared" || address.sendAs === "send-as") {
    return null;
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Send mode for shared mailbox:
      </div>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="sendMode"
            value="send-as"
            checked={mode === "send-as"}
            onChange={() => onChange("send-as")}
            className="mt-0.5"
          />
          <div>
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Send as
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              From: {address.email}
            </div>
          </div>
        </label>
        {address.sendAs === "both" && (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="sendMode"
              value="send-on-behalf"
              checked={mode === "send-on-behalf"}
              onChange={() => onChange("send-on-behalf")}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Send on behalf
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                From: You on behalf of {address.email}
              </div>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function FromAddressSelector({
  selectedAddress,
  addresses,
  onSelect,
  sendMode = "send-as",
  onSendModeChange,
  disabled = false,
  error,
  className,
}: FromAddressSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Group addresses by type
  const { personalAddresses, sharedAddresses } = useMemo(() => {
    const personal: SendableAddress[] = [];
    const shared: SendableAddress[] = [];

    addresses.forEach((addr) => {
      if (addr.type === "shared") {
        shared.push(addr);
      } else {
        personal.push(addr);
      }
    });

    // Sort personal addresses: primary first, then alphabetically
    personal.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.email.localeCompare(b.email);
    });

    // Sort shared addresses alphabetically
    shared.sort((a, b) => a.email.localeCompare(b.email));

    return { personalAddresses: personal, sharedAddresses: shared };
  }, [addresses]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handle address selection
  const handleSelect = useCallback(
    (address: SendableAddress) => {
      onSelect(address);
      setIsOpen(false);
    },
    [onSelect]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Selected address button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
          "transition-colors duration-100",
          error
            ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20"
            : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
          !disabled && "hover:border-neutral-300 dark:hover:border-neutral-600",
          disabled && "cursor-not-allowed opacity-60",
          isOpen && "ring-2 ring-blue-500"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {selectedAddress ? (
          <>
            {/* Domain color indicator */}
            <div
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selectedAddress.domainColor }}
            />

            {/* Address info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                  {selectedAddress.displayName}
                </span>
                {selectedAddress.isPrimary && (
                  <Star className="h-3 w-3 flex-shrink-0 fill-amber-500 text-amber-500" />
                )}
                {selectedAddress.type === "shared" && (
                  <Users className="h-3 w-3 flex-shrink-0 text-neutral-500" />
                )}
              </div>
              <div className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                &lt;{selectedAddress.email}&gt;
              </div>
            </div>

            {/* Domain badge */}
            <div
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: selectedAddress.domainColor }}
            >
              {selectedAddress.domainName}
            </div>
          </>
        ) : (
          <span className="text-neutral-500 dark:text-neutral-400">
            Select a sending address...
          </span>
        )}

        {/* Dropdown arrow */}
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-1 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1",
            "rounded-lg bg-white shadow-lg dark:bg-neutral-900",
            "border border-neutral-200 dark:border-neutral-700",
            "max-h-80 overflow-auto"
          )}
          role="listbox"
        >
          {/* Personal addresses */}
          <AddressGroup
            title="Personal Addresses"
            addresses={personalAddresses}
            selectedId={selectedAddress?.id ?? null}
            onSelect={handleSelect}
          />

          {/* Divider */}
          {personalAddresses.length > 0 && sharedAddresses.length > 0 && (
            <div className="mx-3 h-px bg-neutral-200 dark:bg-neutral-700" />
          )}

          {/* Shared mailboxes */}
          <AddressGroup
            title="Shared Mailboxes"
            addresses={sharedAddresses}
            selectedId={selectedAddress?.id ?? null}
            onSelect={handleSelect}
          />

          {/* Empty state */}
          {addresses.length === 0 && (
            <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400">
              No sending addresses available
            </div>
          )}
        </div>
      )}

      {/* Send mode selector for shared mailboxes */}
      {selectedAddress?.type === "shared" &&
        selectedAddress.sendAs === "both" &&
        onSendModeChange && (
          <SendModeSelector address={selectedAddress} mode={sendMode} onChange={onSendModeChange} />
        )}
    </div>
  );
}

// ============================================================
// COMPACT VERSION FOR HEADER
// ============================================================

interface FromAddressBadgeProps {
  address: SendableAddress;
  onClick?: () => void;
  className?: string;
}

export function FromAddressBadge({ address, onClick, className }: FromAddressBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1",
        "text-sm font-medium",
        "border border-neutral-200 dark:border-neutral-700",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        "transition-colors duration-100",
        className
      )}
    >
      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: address.domainColor }} />
      <span className="max-w-[200px] truncate text-neutral-900 dark:text-neutral-100">
        {address.formatted}
      </span>
      {address.type === "shared" && <Users className="h-3 w-3 flex-shrink-0 text-neutral-500" />}
      <ChevronDown className="h-3 w-3 text-neutral-500" />
    </button>
  );
}
