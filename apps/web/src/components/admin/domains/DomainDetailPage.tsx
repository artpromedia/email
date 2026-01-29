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
  MoreHorizontal,
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
  type AdminDomainDetail,
  type DomainStatus,
} from "@/lib/admin";

// Import tab components
import { DnsRecordsTab } from "./tabs/DnsRecordsTab";
import { DkimKeysTab } from "./tabs/DkimKeysTab";
import { DomainUsersTab } from "./tabs/DomainUsersTab";
import { DomainSettingsTab } from "./tabs/DomainSettingsTab";
import { DomainBrandingTab } from "./tabs/DomainBrandingTab";
import { DomainOverviewTab } from "./tabs/DomainOverviewTab";
import { DomainPoliciesTab } from "./tabs/DomainPoliciesTab";

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

interface StatusBadgeProps {
  status: DomainStatus;
  size?: "sm" | "md";
}

function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
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
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      <div className="relative bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          {title}
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2",
              confirmVariant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-700 rounded mb-4" />
      <div className="h-4 w-96 bg-neutral-200 dark:bg-neutral-700 rounded mb-8" />
      <div className="flex gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-24 bg-neutral-200 dark:bg-neutral-700 rounded" />
        ))}
      </div>
      <div className="h-64 bg-neutral-200 dark:bg-neutral-700 rounded" />
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

export function DomainDetailPage({ domainId, initialTab = "overview" }: DomainDetailPageProps) {
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
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Failed to load domain
        </h3>
        <button
          onClick={() => refetch()}
          className="text-blue-600 hover:text-blue-700"
        >
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
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Back link */}
          <Link
            href="/admin/domains"
            className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Domains
          </Link>

          {/* Domain Info */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: domain.color + "20" }}
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-xs font-medium rounded-full">
                      <Star className="h-3 w-3 fill-current" />
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                  {domain.displayName}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!domain.isPrimary && (
                <button
                  onClick={() => setShowMakePrimaryDialog(true)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border",
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
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border",
                  domain.status === "suspended"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-100"
                    : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100"
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
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-lg",
                  "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
                  "text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
                )}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    isActive
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300"
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
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "overview" && <DomainOverviewTab domain={domain} />}
        {activeTab === "dns" && <DnsRecordsTab domainId={domain.id} domain={domain.domain} />}
        {activeTab === "dkim" && <DkimKeysTab domainId={domain.id} domain={domain.domain} />}
        {activeTab === "users" && <DomainUsersTab domainId={domain.id} domain={domain.domain} />}
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
