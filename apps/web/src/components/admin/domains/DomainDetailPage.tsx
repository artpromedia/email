"use client";

/**
 * Domain Detail Page
 * Main page for viewing and managing a single domain
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Star,
  Pause,
  Play,
  Trash2,
  Globe,
  Shield,
  Key,
  Users,
  Settings,
  Palette,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useDomainDetail,
  useUpdateDomainStatus,
  useMakeDomainPrimary,
  useDeleteDomain,
  type DomainStatus,
} from "@/lib/admin";

// Import tab components
import { DkimKeysTab } from "./tabs/DkimKeysTab";
import { DnsRecordsTab } from "./tabs/DnsRecordsTab";
import { DomainBrandingTab } from "./tabs/DomainBrandingTab";
import { DomainOverviewTab } from "./tabs/DomainOverviewTab";
import { DomainPoliciesTab } from "./tabs/DomainPoliciesTab";
import { DomainSettingsTab } from "./tabs/DomainSettingsTab";
import { DomainUsersTab } from "./tabs/DomainUsersTab";

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

interface StatusBadgeProps {
  status: DomainStatus;
  size?: "sm" | "md";
}

function StatusBadge({ status, size = "md" }: Readonly<StatusBadgeProps>) {
  const config = {
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      icon: Clock,
    },
    active: {
      label: "Active",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      icon: CheckCircle2,
    },
    suspended: {
      label: "Suspended",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      icon: XCircle,
    },
  };

  const { label, className, icon: Icon } = config[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      {label}
    </span>
  );
}

// ============================================================
// CONFIRMATION DIALOG COMPONENT
// ============================================================

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel,
  isLoading,
}: Readonly<ConfirmDialogProps>) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onCancel}
        aria-label="Close dialog"
      />
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
        <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        <p className="mb-6 text-neutral-600 dark:text-neutral-400">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
              confirmVariant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB TYPES
// ============================================================

type TabId = "overview" | "dns" | "dkim" | "users" | "settings" | "branding" | "policies";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", icon: Globe },
  { id: "dns", label: "DNS Records", icon: Shield },
  { id: "dkim", label: "DKIM Keys", icon: Key },
  { id: "users", label: "Users", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "policies", label: "Policies", icon: FileText },
];

// ============================================================
// LOADING SKELETON
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="animate-pulse p-6">
      <div className="mb-4 h-8 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="mb-8 h-4 w-96 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="mb-6 flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
      <div className="h-64 rounded bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface DomainDetailPageProps {
  domainId: string;
  initialTab?: TabId;
}

export function DomainDetailPage({
  domainId,
  initialTab = "overview",
}: Readonly<DomainDetailPageProps>) {
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showMakePrimaryDialog, setShowMakePrimaryDialog] = useState(false);

  // Data fetching
  const { data: domain, isLoading, isError, refetch } = useDomainDetail(domainId);

  // Mutations
  const updateStatus = useUpdateDomainStatus();
  const makePrimary = useMakeDomainPrimary();
  const deleteDomain = useDeleteDomain();

  // Handlers
  const handleSuspendToggle = useCallback(() => {
    if (!domain) return;

    const newStatus = domain.status === "suspended" ? "active" : "suspended";
    updateStatus.mutate(
      { domainId: domain.id, status: newStatus },
      {
        onSuccess: () => {
          setShowSuspendDialog(false);
          void refetch();
        },
      }
    );
  }, [domain, updateStatus, refetch]);

  const handleMakePrimary = useCallback(() => {
    if (!domain) return;

    makePrimary.mutate(domain.id, {
      onSuccess: () => {
        setShowMakePrimaryDialog(false);
        void refetch();
      },
    });
  }, [domain, makePrimary, refetch]);

  const handleDelete = useCallback(() => {
    if (!domain) return;

    deleteDomain.mutate(domain.id, {
      onSuccess: () => {
        router.push("/admin/domains");
      },
    });
  }, [domain, deleteDomain, router]);

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Failed to load domain
        </h3>
        <button onClick={() => refetch()} className="text-blue-600 hover:text-blue-700">
          Try again
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading || !domain) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <div className="mx-auto max-w-7xl px-6 py-4">
          {/* Back link */}
          <Link
            href="/admin/domains"
            className="mb-4 inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Domains
          </Link>

          {/* Domain Info */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${domain.color}20` }}
              >
                <Globe className="h-6 w-6" style={{ color: domain.color }} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {domain.domain}
                  </h1>
                  <StatusBadge status={domain.status} />
                  {domain.isPrimary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <Star className="h-3 w-3 fill-current" />
                      Primary
                    </span>
                  )}
                </div>
                <p className="mt-1 text-neutral-500 dark:text-neutral-400">{domain.displayName}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!domain.isPrimary && (
                <button
                  onClick={() => setShowMakePrimaryDialog(true)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    "bg-white dark:bg-neutral-800",
                    "border-neutral-200 dark:border-neutral-700",
                    "hover:bg-neutral-50 dark:hover:bg-neutral-700"
                  )}
                >
                  <Star className="h-4 w-4" />
                  Make Primary
                </button>
              )}
              <button
                onClick={() => setShowSuspendDialog(true)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  domain.status === "suspended"
                    ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                    : "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                )}
              >
                {domain.status === "suspended" ? (
                  <>
                    <Play className="h-4 w-4" />
                    Activate
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" />
                    Suspend
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  "border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
                  "text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
                )}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-7xl px-6">
          <div className="-mb-px flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {activeTab === "overview" && <DomainOverviewTab domain={domain} />}
        {activeTab === "dns" && <DnsRecordsTab domainId={domain.id} domain={domain.domain} />}
        {activeTab === "dkim" && <DkimKeysTab domainId={domain.id} />}
        {activeTab === "users" && <DomainUsersTab domainId={domain.id} />}
        {activeTab === "settings" && <DomainSettingsTab domainId={domain.id} />}
        {activeTab === "branding" && <DomainBrandingTab domainId={domain.id} />}
        {activeTab === "policies" && <DomainPoliciesTab domainId={domain.id} />}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Domain"
        message={`Are you sure you want to delete ${domain.domain}? This action cannot be undone and will remove all associated users, emails, and settings.`}
        confirmLabel="Delete Domain"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        isLoading={deleteDomain.isPending}
      />

      <ConfirmDialog
        isOpen={showSuspendDialog}
        title={domain.status === "suspended" ? "Activate Domain" : "Suspend Domain"}
        message={
          domain.status === "suspended"
            ? `Are you sure you want to activate ${domain.domain}? Users will be able to send and receive emails again.`
            : `Are you sure you want to suspend ${domain.domain}? Users will not be able to send or receive emails while suspended.`
        }
        confirmLabel={domain.status === "suspended" ? "Activate" : "Suspend"}
        confirmVariant={domain.status === "suspended" ? "primary" : "danger"}
        onConfirm={handleSuspendToggle}
        onCancel={() => setShowSuspendDialog(false)}
        isLoading={updateStatus.isPending}
      />

      <ConfirmDialog
        isOpen={showMakePrimaryDialog}
        title="Make Primary Domain"
        message={`Are you sure you want to make ${domain.domain} the primary domain? This will be the default domain for new users.`}
        confirmLabel="Make Primary"
        confirmVariant="primary"
        onConfirm={handleMakePrimary}
        onCancel={() => setShowMakePrimaryDialog(false)}
        isLoading={makePrimary.isPending}
      />
    </div>
  );
}
