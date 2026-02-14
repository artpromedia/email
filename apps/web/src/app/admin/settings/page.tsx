"use client";

/**
 * Domain Admin - Settings Page
 *
 * Domain-level settings management for domain administrators.
 * Covers general settings, security, catch-all, and sending limits.
 */

import { useState, useMemo } from "react";
import {
  Settings,
  Shield,
  Mail,
  Globe,
  Save,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@email/ui";
import { useDomainsList, type AdminDomain } from "@/lib/admin";

// ============================================================
// SECTION WRAPPER
// ============================================================

interface SectionProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

function Section({ title, description, icon: Icon, children }: Readonly<SectionProps>) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="border-b border-neutral-200 p-5 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-700">
            <Icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          </div>
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{title}</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ============================================================
// DOMAIN SELECTOR
// ============================================================

interface DomainSelectorProps {
  domains: AdminDomain[];
  selected: string | undefined;
  onChange: (id: string) => void;
}

function DomainSelector({ domains, selected, onChange }: Readonly<DomainSelectorProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDomain = domains.find((d) => d.id === selected);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-3",
          "bg-white dark:bg-neutral-800",
          "border-neutral-200 dark:border-neutral-700",
          "hover:bg-neutral-50 dark:hover:bg-neutral-700"
        )}
      >
        <div className="flex items-center gap-3">
          {selectedDomain && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${selectedDomain.color}20` }}
            >
              <Globe className="h-4 w-4" style={{ color: selectedDomain.color }} />
            </div>
          )}
          <div className="text-left">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {selectedDomain?.domain ?? "Select a domain"}
            </p>
            {selectedDomain && (
              <p className="text-xs text-neutral-500">{selectedDomain.displayName}</p>
            )}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-neutral-500" />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Close dropdown"
          />
          <div className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {domains.map((domain) => (
              <button
                key={domain.id}
                onClick={() => {
                  onChange(domain.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  selected === domain.id && "bg-blue-50 dark:bg-blue-900/20"
                )}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${domain.color}20` }}
                >
                  <Globe className="h-4 w-4" style={{ color: domain.color }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {domain.domain}
                  </p>
                  <p className="text-xs text-neutral-500">{domain.displayName}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// TOGGLE SWITCH
// ============================================================

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, description, checked, onChange }: Readonly<ToggleProps>) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</p>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <span className="sr-only">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-neutral-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:border-neutral-600 dark:bg-neutral-700 dark:peer-focus:ring-blue-800" />
      </label>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function SettingsSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="h-14 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-48 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AdminSettingsPage() {
  const {
    data: domainsData,
    isLoading,
    isError,
    refetch,
  } = useDomainsList({
    page: 1,
    pageSize: 50,
  });

  const domains = useMemo(() => domainsData?.domains ?? [], [domainsData]);

  // Selected domain - default to first domain
  const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>();

  // Auto-select first domain via derived state
  const effectiveDomainId = selectedDomainId ?? domains[0]?.id;

  // Settings state
  const [catchAllEnabled, setCatchAllEnabled] = useState(false);
  const [catchAllAction, setCatchAllAction] = useState<"deliver" | "forward" | "reject">("reject");
  const [catchAllDestination, setCatchAllDestination] = useState("");
  const [requireTls, setRequireTls] = useState(true);
  const [maxMessagesPerDay, setMaxMessagesPerDay] = useState(1000);
  const [maxRecipientsPerMessage, setMaxRecipientsPerMessage] = useState(50);
  const [maxMessageSizeMb, setMaxMessageSizeMb] = useState(25);
  const [defaultQuotaGb, setDefaultQuotaGb] = useState(5);
  const [saved, setSaved] = useState(false);

  const selectedDomain = domains.find((d) => d.id === effectiveDomainId);

  const handleSave = () => {
    // In a full implementation, this would call useUpdateDomainSettings
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium">Failed to load settings</h3>
        <button onClick={() => refetch()} className="text-blue-600 hover:text-blue-700">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Settings
          </h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            Configure domain settings and policies
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!effectiveDomainId}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700",
            "disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Domain Selector */}
      {domains.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Configure settings for:
          </p>
          <DomainSelector
            domains={domains}
            selected={effectiveDomainId}
            onChange={setSelectedDomainId}
          />
        </div>
      )}

      {domains.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-800">
          <Settings className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
          <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            No domains to configure
          </h3>
          <p className="text-neutral-500 dark:text-neutral-400">
            Add a domain first to configure its settings.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* General Settings */}
          <Section title="General" description="Basic domain configuration" icon={Globe}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="settings-display-name"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Display Name
                </label>
                <input
                  id="settings-display-name"
                  type="text"
                  defaultValue={selectedDomain?.displayName ?? ""}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "bg-white dark:bg-neutral-900",
                    "border-neutral-200 dark:border-neutral-700",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  )}
                />
              </div>
              <div>
                <label
                  htmlFor="settings-quota"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Default User Storage Quota
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="settings-quota"
                    type="range"
                    min="1"
                    max="100"
                    value={defaultQuotaGb}
                    onChange={(e) => setDefaultQuotaGb(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-16 text-right text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {defaultQuotaGb} GB
                  </span>
                </div>
              </div>
            </div>
          </Section>

          {/* Catch-All Settings */}
          <Section
            title="Catch-All Email"
            description="Handle emails sent to non-existent addresses"
            icon={Mail}
          >
            <div className="space-y-4">
              <Toggle
                label="Enable Catch-All"
                description="Receive emails sent to any address on this domain"
                checked={catchAllEnabled}
                onChange={setCatchAllEnabled}
              />
              {catchAllEnabled && (
                <div className="space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                  <div>
                    <label
                      htmlFor="catchall-action"
                      className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                    >
                      Action
                    </label>
                    <select
                      id="catchall-action"
                      value={catchAllAction}
                      onChange={(e) => setCatchAllAction(e.target.value as typeof catchAllAction)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-sm",
                        "bg-white dark:bg-neutral-900",
                        "border-neutral-200 dark:border-neutral-700"
                      )}
                    >
                      <option value="deliver">Deliver to mailbox</option>
                      <option value="forward">Forward to address</option>
                      <option value="reject">Reject with error</option>
                    </select>
                  </div>
                  {catchAllAction === "forward" && (
                    <div>
                      <label
                        htmlFor="catchall-forward"
                        className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                      >
                        Forward to
                      </label>
                      <input
                        id="catchall-forward"
                        type="email"
                        value={catchAllDestination}
                        onChange={(e) => setCatchAllDestination(e.target.value)}
                        placeholder="admin@example.com"
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-sm",
                          "bg-white dark:bg-neutral-900",
                          "border-neutral-200 dark:border-neutral-700",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500"
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Security Settings */}
          <Section
            title="Security"
            description="Email security and encryption settings"
            icon={Shield}
          >
            <div className="space-y-3">
              <Toggle
                label="Require TLS for outbound"
                description="Require TLS encryption for all outgoing emails"
                checked={requireTls}
                onChange={setRequireTls}
              />
            </div>
          </Section>

          {/* Sending Limits */}
          <Section
            title="Sending Limits"
            description="Control email sending rates and limits"
            icon={Mail}
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="max-messages"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Max messages per user per day
                </label>
                <input
                  id="max-messages"
                  type="number"
                  value={maxMessagesPerDay}
                  onChange={(e) => setMaxMessagesPerDay(Number(e.target.value))}
                  min="1"
                  max="10000"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "bg-white dark:bg-neutral-900",
                    "border-neutral-200 dark:border-neutral-700",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  )}
                />
              </div>
              <div>
                <label
                  htmlFor="max-recipients"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Max recipients per message
                </label>
                <input
                  id="max-recipients"
                  type="number"
                  value={maxRecipientsPerMessage}
                  onChange={(e) => setMaxRecipientsPerMessage(Number(e.target.value))}
                  min="1"
                  max="500"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "bg-white dark:bg-neutral-900",
                    "border-neutral-200 dark:border-neutral-700",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  )}
                />
              </div>
              <div>
                <label
                  htmlFor="max-size"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Max message size (MB)
                </label>
                <input
                  id="max-size"
                  type="number"
                  value={maxMessageSizeMb}
                  onChange={(e) => setMaxMessageSizeMb(Number(e.target.value))}
                  min="1"
                  max="100"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "bg-white dark:bg-neutral-900",
                    "border-neutral-200 dark:border-neutral-700",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  )}
                />
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
