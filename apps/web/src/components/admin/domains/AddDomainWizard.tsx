"use client";

/**
 * Add Domain Wizard
 * 4-step wizard for adding and verifying a new domain
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  RefreshCw,
  Globe,
  Shield,
  Mail,
  Palette,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useCreateDomain,
  useCheckDomainAvailability,
  useVerifyDomain,
  useVerifyDns,
  type AddDomainWizardStep,
  type AddDomainWizardState,
  type VerificationMethod,
  type VerificationRecord,
  type DnsRecord,
  type DnsRecordStatus,
} from "@/lib/admin";

// ============================================================
// STEP INDICATOR COMPONENT
// ============================================================

interface StepIndicatorProps {
  currentStep: AddDomainWizardStep;
  steps: {
    number: AddDomainWizardStep;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

function StepIndicator({ currentStep, steps }: Readonly<StepIndicatorProps>) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isCompleted = step.number < currentStep;
        const isCurrent = step.number === currentStep;
        const Icon = step.icon;

        const getStepClasses = () => {
          if (isCompleted) return "border-green-500 bg-green-500 text-white";
          if (isCurrent) return "border-blue-500 bg-blue-500 text-white";
          return "border-neutral-300 bg-white text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
        };

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                  getStepClasses()
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-xs font-medium",
                  isCurrent ? "text-blue-600 dark:text-blue-400" : "text-neutral-500"
                )}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-0.5 w-16",
                  step.number < currentStep ? "bg-green-500" : "bg-neutral-200 dark:bg-neutral-700"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// COPY BUTTON COMPONENT
// ============================================================

interface CopyButtonProps {
  readonly value: string;
}

function CopyButton({ value }: Readonly<CopyButtonProps>) {
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
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
        copied
          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
          : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
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
          Copy
        </>
      )}
    </button>
  );
}

// ============================================================
// STEP 1: ENTER DOMAIN
// ============================================================

interface Step1Props {
  domain: string;
  displayName: string;
  onDomainChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onNext: () => void;
  isLoading: boolean;
  error?: string;
}

function Step1EnterDomain({
  domain,
  displayName,
  onDomainChange,
  onDisplayNameChange,
  onNext,
  isLoading,
  error,
}: Readonly<Step1Props>) {
  const [domainError, setDomainError] = useState<string | undefined>();
  const checkAvailability = useCheckDomainAvailability();

  const validateDomain = useCallback((value: string) => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
    if (!value) return "Domain is required";
    if (!domainRegex.test(value)) return "Invalid domain format";
    return undefined;
  }, []);

  const handleDomainBlur = useCallback(() => {
    const validationError = validateDomain(domain);
    if (validationError) {
      setDomainError(validationError);
      return;
    }
    setDomainError(undefined);

    // Check availability
    checkAvailability.mutate(domain, {
      onSuccess: (result) => {
        if (!result.available) {
          setDomainError(result.reason ?? "Domain is not available");
        }
      },
    });
  }, [domain, validateDomain, checkAvailability]);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationError = validateDomain(domain);
    if (validationError) {
      setDomainError(validationError);
      return;
    }
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Enter Domain Information
        </h2>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Add the domain you want to manage with this email system
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        {/* Domain Input */}
        <div>
          <label
            htmlFor="domain-input"
            className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Domain Name <span className="text-red-500">*</span>
          </label>
          <input
            id="domain-input"
            type="text"
            value={domain}
            onChange={(e) => onDomainChange(e.target.value.toLowerCase())}
            onBlur={handleDomainBlur}
            placeholder="example.com"
            className={cn(
              "w-full rounded-lg border px-4 py-2.5 text-base",
              "bg-white dark:bg-neutral-800",
              domainError
                ? "border-red-500 focus:ring-red-500"
                : "border-neutral-200 focus:ring-blue-500 dark:border-neutral-700",
              "focus:outline-none focus:ring-2"
            )}
          />
          {domainError && (
            <p className="mt-1.5 flex items-center gap-1 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {domainError}
            </p>
          )}
          {checkAvailability.isPending && (
            <p className="mt-1.5 flex items-center gap-1 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking availability...
            </p>
          )}
        </div>

        {/* Display Name Input */}
        <div>
          <label
            htmlFor="display-name-input"
            className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Display Name
          </label>
          <input
            id="display-name-input"
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="My Company"
            className={cn(
              "w-full rounded-lg border px-4 py-2.5 text-base",
              "bg-white dark:bg-neutral-800",
              "border-neutral-200 dark:border-neutral-700",
              "focus:outline-none focus:ring-2 focus:ring-blue-500"
            )}
          />
          <p className="mt-1.5 text-sm text-neutral-500">
            A friendly name for this domain (optional)
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !!domainError || !domain}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5",
            "bg-blue-600 font-medium text-white",
            "hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              Continue
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// STEP 2: VERIFY OWNERSHIP
// ============================================================

interface Step2Props {
  readonly domain: string;
  readonly verificationRecords: VerificationRecord[];
  readonly selectedMethod: VerificationMethod | undefined;
  readonly onMethodSelect: (method: VerificationMethod) => void;
  readonly onVerify: () => void;
  onBack: () => void;
  isVerifying: boolean;
  isVerified: boolean;
  verificationError?: string;
}

function Step2VerifyOwnership({
  domain,
  verificationRecords,
  selectedMethod,
  onMethodSelect,
  onVerify,
  onBack,
  isVerifying,
  isVerified,
  verificationError,
}: Readonly<Step2Props>) {
  const selectedRecord = verificationRecords.find((r) => r.method === selectedMethod);

  const methodLabels: Record<VerificationMethod, { title: string; description: string }> = {
    txt: {
      title: "TXT Record (Recommended)",
      description: "Add a TXT record to your DNS settings",
    },
    cname: {
      title: "CNAME Record",
      description: "Add a CNAME record to your DNS settings",
    },
    meta: {
      title: "Meta Tag",
      description: "Add a meta tag to your website (if applicable)",
    },
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Verify Domain Ownership
        </h2>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Prove you own <strong>{domain}</strong> by adding a verification record
        </p>
      </div>

      {/* Method Selection */}
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Choose a verification method:
        </p>
        <div className="space-y-2">
          {verificationRecords.map((record) => {
            const { title, description } = methodLabels[record.method];
            return (
              <button
                key={record.method}
                onClick={() => onMethodSelect(record.method)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selectedMethod === record.method
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border-2",
                      selectedMethod === record.method
                        ? "border-blue-500 bg-blue-500"
                        : "border-neutral-300 dark:border-neutral-600"
                    )}
                  >
                    {selectedMethod === record.method && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
                    <p className="text-sm text-neutral-500">{description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Verification Record Details */}
        {selectedRecord && (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
            <h4 className="mb-3 font-medium text-neutral-900 dark:text-neutral-100">
              Add this record to your DNS:
            </h4>
            <div className="space-y-3">
              <div>
                <label htmlFor="dns-type" className="text-xs uppercase text-neutral-500">
                  Type
                </label>
                <p
                  id="dns-type"
                  className="rounded border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {selectedRecord.recordType}
                </p>
              </div>
              <div>
                <label htmlFor="dns-host" className="text-xs uppercase text-neutral-500">
                  Name / Host
                </label>
                <div className="flex items-center gap-2">
                  <p
                    id="dns-host"
                    className="flex-1 truncate rounded border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    {selectedRecord.recordName}
                  </p>
                  <CopyButton value={selectedRecord.recordName} />
                </div>
              </div>
              <div>
                <label htmlFor="dns-value" className="text-xs uppercase text-neutral-500">
                  Value
                </label>
                <div className="flex items-center gap-2">
                  <p
                    id="dns-value"
                    className="flex-1 break-all rounded border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    {selectedRecord.recordValue}
                  </p>
                  <CopyButton value={selectedRecord.recordValue} />
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-neutral-500">{selectedRecord.instructions}</p>
          </div>
        )}

        {/* Verification Status */}
        {isVerified && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Domain ownership verified!
            </span>
          </div>
        )}

        {verificationError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm text-red-700 dark:text-red-400">{verificationError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {isVerified ? (
            <button
              onClick={onVerify}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5",
                "bg-blue-600 font-medium text-white",
                "hover:bg-blue-700"
              )}
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={onVerify}
              disabled={!selectedMethod || isVerifying}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5",
                "bg-blue-600 font-medium text-white",
                "hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5" />
                  Verify Now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 3: CONFIGURE DNS
// ============================================================

interface Step3Props {
  readonly domain: string;
  readonly dnsRecords: DnsRecord[];
  readonly onVerifyDns: () => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
  isVerifying: boolean;
  allVerified: boolean;
}

function Step3ConfigureDns({
  domain,
  dnsRecords,
  onVerifyDns,
  onNext,
  onBack,
  isVerifying,
  allVerified,
}: Readonly<Step3Props>) {
  const getStatusIcon = (status: DnsRecordStatus) => {
    switch (status) {
      case "verified":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "missing":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "mismatch":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-neutral-400" />;
    }
  };

  const getStatusText = (status: DnsRecordStatus) => {
    switch (status) {
      case "verified":
        return "Verified";
      case "missing":
        return "Not Found";
      case "mismatch":
        return "Mismatch";
      case "pending":
        return "Pending";
    }
  };

  const requiredRecords = dnsRecords.filter((r) => r.isRequired);
  const optionalRecords = dnsRecords.filter((r) => !r.isRequired);
  const requiredVerified = requiredRecords.every((r) => r.status === "verified");

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Configure DNS Records
        </h2>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Add these DNS records to enable email for <strong>{domain}</strong>
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-4">
        {/* Required Records */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Required Records
          </h3>
          <div className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
            {requiredRecords.map((record) => (
              <div key={record.id} className="bg-white p-4 dark:bg-neutral-800">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {record.description}
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-700">
                      {record.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(record.status)}
                    <span
                      className={cn(
                        "text-sm",
                        (() => {
                          if (record.status === "verified") return "text-green-600";
                          if (record.status === "missing") return "text-red-600";
                          if (record.status === "mismatch") return "text-yellow-600";
                          return "text-neutral-500";
                        })()
                      )}
                    >
                      {getStatusText(record.status)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-neutral-500">Expected:</span>
                    <code className="ml-2 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs dark:bg-neutral-900">
                      {record.expectedValue}
                    </code>
                  </div>
                  {record.foundValue && (
                    <div>
                      <span className="text-neutral-500">Found:</span>
                      <code className="ml-2 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs dark:bg-neutral-900">
                        {record.foundValue}
                      </code>
                    </div>
                  )}
                </div>
                {record.status !== "verified" && (
                  <div className="mt-3 flex items-center gap-2">
                    <CopyButton value={record.expectedValue} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Optional Records */}
        {optionalRecords.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Optional Records
            </h3>
            <div className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
              {optionalRecords.map((record) => (
                <div key={record.id} className="bg-white p-4 dark:bg-neutral-800">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {record.description}
                      </span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-700">
                        {record.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {getStatusIcon(record.status)}
                      <span className="text-sm text-neutral-500">
                        {getStatusText(record.status)}
                      </span>
                    </div>
                  </div>
                  {record.status !== "verified" && (
                    <div className="mt-2">
                      <CopyButton value={record.expectedValue} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Summary */}
        {(() => {
          if (allVerified) {
            return (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  All DNS records verified!
                </span>
              </div>
            );
          }
          if (requiredVerified) {
            return (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm text-yellow-700 dark:text-yellow-400">
                  Required records verified. Optional records pending.
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400">
                Some DNS records need to be configured.
              </span>
            </div>
          );
        })()}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onVerifyDns}
              disabled={isVerifying}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2",
                "bg-white dark:bg-neutral-800",
                "border-neutral-200 dark:border-neutral-700",
                "hover:bg-neutral-50 dark:hover:bg-neutral-700",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", isVerifying && "animate-spin")} />
              Verify All
            </button>
            <button
              onClick={onNext}
              disabled={!requiredVerified}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5",
                "bg-blue-600 font-medium text-white",
                "hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 4: CONFIGURE SETTINGS
// ============================================================

interface Step4Props {
  onFinish: () => void;
  onBack: () => void;
  isLoading: boolean;
}

function Step4ConfigureSettings({ onFinish, onBack, isLoading }: Readonly<Step4Props>) {
  const [catchAllEnabled, setCatchAllEnabled] = useState(false);
  const [catchAllAction, setCatchAllAction] = useState<"deliver" | "forward" | "reject">("reject");
  const [catchAllDestination, setCatchAllDestination] = useState("");
  const [defaultQuota, setDefaultQuota] = useState(5);
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Configure Domain Settings
        </h2>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Set up initial configuration for your domain
        </p>
      </div>

      <div className="mx-auto max-w-lg space-y-6">
        {/* Catch-All Configuration */}
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                Catch-All Emails
              </h3>
              <p className="text-sm text-neutral-500">
                Handle emails sent to non-existent addresses
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <span className="sr-only">Enable catch-all email forwarding</span>
              <input
                type="checkbox"
                checked={catchAllEnabled}
                onChange={(e) => setCatchAllEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-neutral-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-neutral-600 dark:bg-neutral-700 dark:peer-focus:ring-blue-800" />
            </label>
          </div>

          {catchAllEnabled && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="catchall-action"
                  className="mb-1 block text-sm text-neutral-700 dark:text-neutral-300"
                >
                  Action
                </label>
                <select
                  id="catchall-action"
                  value={catchAllAction}
                  onChange={(e) => setCatchAllAction(e.target.value as typeof catchAllAction)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
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
                    className="mb-1 block text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    Forward to
                  </label>
                  <input
                    id="catchall-forward"
                    type="email"
                    value={catchAllDestination}
                    onChange={(e) => setCatchAllDestination(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Default User Quota */}
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="mb-2 font-medium text-neutral-900 dark:text-neutral-100">
            Default User Quota
          </h3>
          <p className="mb-3 text-sm text-neutral-500">
            Storage limit for new users on this domain
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="100"
              value={defaultQuota}
              onChange={(e) => setDefaultQuota(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-16 text-right text-sm font-medium">{defaultQuota} GB</span>
          </div>
        </div>

        {/* Branding */}
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="mb-2 font-medium text-neutral-900 dark:text-neutral-100">Branding</h3>
          <p className="mb-3 text-sm text-neutral-500">
            Set your domain&apos;s primary color (can be changed later)
          </p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-neutral-200 dark:border-neutral-700"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={onFinish}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 rounded-lg px-6 py-2.5",
              "bg-green-600 font-medium text-white",
              "hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5" />
                Finish Setup
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN WIZARD COMPONENT
// ============================================================

export function AddDomainWizard() {
  const router = useRouter();

  // Wizard state
  const [state, setState] = useState<AddDomainWizardState>({
    currentStep: 1,
    domain: "",
    displayName: "",
    isVerified: false,
    dnsRecords: [],
    dnsVerified: false,
    settings: {},
    branding: {},
  });

  // Mutations
  const createDomain = useCreateDomain();
  const verifyDomain = useVerifyDomain();
  const verifyDns = useVerifyDns();

  // Steps configuration
  const steps: {
    number: AddDomainWizardStep;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { number: 1, title: "Domain", icon: Globe },
    { number: 2, title: "Verify", icon: Shield },
    { number: 3, title: "DNS", icon: Mail },
    { number: 4, title: "Settings", icon: Palette },
  ];

  // Step 1 handlers
  const handleStep1Next = useCallback(() => {
    createDomain.mutate(
      { domain: state.domain, displayName: state.displayName || state.domain },
      {
        onSuccess: (data) => {
          setState((prev) => ({
            ...prev,
            currentStep: 2,
            domainId: data.domain.id,
            verificationRecords: data.verificationRecords,
          }));
        },
      }
    );
  }, [state.domain, state.displayName, createDomain]);

  // Step 2 handlers
  const handleMethodSelect = useCallback((method: VerificationMethod) => {
    setState((prev) => ({
      ...prev,
      verificationMethod: method,
      verificationRecord: prev.verificationRecords?.find((r) => r.method === method),
    }));
  }, []);

  const handleVerifyOwnership = useCallback(() => {
    if (state.isVerified) {
      // Already verified, move to next step
      if (state.domainId) {
        verifyDns.mutate(state.domainId, {
          onSuccess: (result) => {
            setState((prev) => ({
              ...prev,
              currentStep: 3,
              dnsRecords: result.records,
              dnsVerified: result.allVerified,
            }));
          },
        });
      }
      return;
    }

    if (!state.domainId || !state.verificationMethod) return;

    verifyDomain.mutate(
      { domainId: state.domainId, method: state.verificationMethod },
      {
        onSuccess: (result) => {
          if (result.verified) {
            setState((prev) => ({ ...prev, isVerified: true }));
          }
        },
      }
    );
  }, [state.domainId, state.verificationMethod, state.isVerified, verifyDomain, verifyDns]);

  // Step 3 handlers
  const handleVerifyDns = useCallback(() => {
    if (!state.domainId) return;
    verifyDns.mutate(state.domainId, {
      onSuccess: (result) => {
        setState((prev) => ({
          ...prev,
          dnsRecords: result.records,
          dnsVerified: result.allVerified,
        }));
      },
    });
  }, [state.domainId, verifyDns]);

  const handleStep3Next = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: 4 }));
  }, []);

  // Step 4 handlers
  const handleFinish = useCallback(() => {
    router.push(`/admin/domains/${state.domainId}`);
  }, [router, state.domainId]);

  // Back handlers
  const handleBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(1, prev.currentStep - 1) as AddDomainWizardStep,
    }));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 py-8 dark:bg-neutral-900">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/admin/domains")}
            className="mb-4 flex items-center gap-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Domains
          </button>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Add New Domain
          </h1>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={state.currentStep} steps={steps} />

        {/* Step Content */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800 md:p-8">
          {state.currentStep === 1 && (
            <Step1EnterDomain
              domain={state.domain}
              displayName={state.displayName}
              onDomainChange={(domain) => setState((prev) => ({ ...prev, domain }))}
              onDisplayNameChange={(displayName) => setState((prev) => ({ ...prev, displayName }))}
              onNext={handleStep1Next}
              isLoading={createDomain.isPending}
              error={createDomain.error?.message}
            />
          )}

          {state.currentStep === 2 && state.domainId && (
            <Step2VerifyOwnership
              domainId={state.domainId}
              domain={state.domain}
              verificationRecords={state.verificationRecords ?? []}
              selectedMethod={state.verificationMethod}
              onMethodSelect={handleMethodSelect}
              onVerify={handleVerifyOwnership}
              onBack={handleBack}
              isVerifying={verifyDomain.isPending}
              isVerified={state.isVerified}
              verificationError={
                verifyDomain.data && !verifyDomain.data.verified
                  ? verifyDomain.data.error
                  : undefined
              }
            />
          )}

          {state.currentStep === 3 && state.domainId && (
            <Step3ConfigureDns
              domainId={state.domainId}
              domain={state.domain}
              dnsRecords={state.dnsRecords}
              onVerifyDns={handleVerifyDns}
              onNext={handleStep3Next}
              onBack={handleBack}
              isVerifying={verifyDns.isPending}
              allVerified={state.dnsVerified}
            />
          )}

          {state.currentStep === 4 && (
            <Step4ConfigureSettings onFinish={handleFinish} onBack={handleBack} isLoading={false} />
          )}
        </div>
      </div>
    </div>
  );
}
