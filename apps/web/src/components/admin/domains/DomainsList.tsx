"use client";

/**
 * Admin Domains List Page
 * Main domains management page with table, filters, and actions
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  MoreHorizontal,
  RefreshCw,
  Star,
} from "lucide-react";
import type { AdminDomain, DomainStatus, DomainListQuery } from "@email/types";
import { cn } from "@email/ui";

import { useAdminDomains, useBulkVerifyDns, useExportDomains } from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DomainsListProps {
  className?: string;
}

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

interface StatusBadgeProps {
  status: DomainStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      label: "Pending",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: Clock,
    },
    active: {
      label: "Active",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      icon: CheckCircle2,
    },
    suspended: {
      label: "Suspended",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: AlertCircle,
    },
    deleted: {
      label: "Deleted",
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
      icon: XCircle,
    },
  };

  const { label, className, icon: Icon } = config[status] || config.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ============================================================
// DNS STATUS COMPONENT
// ============================================================

interface DnsStatusProps {
  type: "MX" | "SPF" | "DKIM" | "DMARC";
  verified: boolean;
}

function DnsStatusIcon({ type, verified }: DnsStatusProps) {
  return (
    <div
      className="flex items-center gap-1"
      title={`${type} ${verified ? "Verified" : "Not Verified"}`}
    >
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{type}</span>
      {verified ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
      )}
    </div>
  );
}

// ============================================================
// DOMAINS TABLE COMPONENT
// ============================================================

interface DomainsTableProps {
  domains: AdminDomain[];
  onDomainClick: (domain: AdminDomain) => void;
}

function DomainsTable({ domains, onDomainClick }: DomainsTableProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (domains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
          <AlertCircle className="h-6 w-6 text-neutral-400" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          No domains found
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Get started by adding your first domain.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Domain
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Users
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Storage
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              DNS Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-700 dark:bg-neutral-900">
          {domains.map((domain) => (
            <tr
              key={domain.id}
              onClick={() => onDomainClick(domain)}
              className="cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {domain.name}
                      </span>
                      {domain.isPrimary && (
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                      )}
                    </div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      {domain.displayName}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={domain.status} />
              </td>
              <td className="px-4 py-4">
                <span className="text-sm text-neutral-900 dark:text-neutral-100">
                  {domain.stats.usersCount}
                </span>
              </td>
              <td className="px-4 py-4">
                <span className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatBytes(domain.stats.storageUsedBytes)}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <DnsStatusIcon type="MX" verified={domain.mxStatus === "verified"} />
                  <DnsStatusIcon type="SPF" verified={domain.spfStatus === "verified"} />
                  <DnsStatusIcon type="DKIM" verified={domain.dkimStatus === "verified"} />
                  <DnsStatusIcon type="DMARC" verified={domain.dmarcStatus === "verified"} />
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open actions menu
                  }}
                  className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <MoreHorizontal className="h-4 w-4 text-neutral-500" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainsList({ className }: DomainsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DomainStatus | "all">("all");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  const query: DomainListQuery = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      page: 1,
      pageSize: 50,
      sortBy: "name",
      sortOrder: "asc",
    }),
    [search, statusFilter]
  );

  const { data, isLoading, refetch } = useAdminDomains(query);
  const bulkVerifyDns = useBulkVerifyDns();
  const exportDomains = useExportDomains();

  const handleDomainClick = (domain: AdminDomain) => {
    router.push(`/admin/domains/${domain.id}`);
  };

  const handleAddDomain = () => {
    router.push("/admin/domains/new");
  };

  const handleBulkVerifyDns = async () => {
    if (selectedDomains.length === 0) return;

    try {
      await bulkVerifyDns.mutateAsync(selectedDomains);
      setSelectedDomains([]);
    } catch (error) {
      console.error("Failed to verify DNS:", error);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportDomains.mutateAsync(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `domains-${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export domains:", error);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Domains</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage your organization's email domains
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddDomain}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            "bg-blue-600 text-white hover:bg-blue-700",
            "transition-colors duration-100"
          )}
        >
          <Plus className="h-4 w-4" />
          Add Domain
        </button>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search domains..."
              className={cn(
                "w-full rounded-lg border border-neutral-200 py-2 pl-10 pr-4 text-sm",
                "bg-white dark:bg-neutral-900",
                "text-neutral-900 dark:text-neutral-100",
                "placeholder-neutral-400 dark:placeholder-neutral-500",
                "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              )}
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-neutral-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DomainStatus | "all")}
            className={cn(
              "rounded-lg border border-neutral-200 px-3 py-2 text-sm",
              "bg-white dark:bg-neutral-900",
              "text-neutral-900 dark:text-neutral-100",
              "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            )}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedDomains.length > 0 && (
          <button
            type="button"
            onClick={handleBulkVerifyDns}
            disabled={bulkVerifyDns.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium",
              "text-neutral-700 dark:text-neutral-300",
              "hover:bg-neutral-50 dark:hover:bg-neutral-800",
              "disabled:opacity-50",
              "transition-colors duration-100"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", bulkVerifyDns.isPending && "animate-spin")} />
            Verify DNS ({selectedDomains.length})
          </button>
        )}

        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exportDomains.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium",
            "text-neutral-700 dark:text-neutral-300",
            "hover:bg-neutral-50 dark:hover:bg-neutral-800",
            "disabled:opacity-50",
            "transition-colors duration-100"
          )}
        >
          <Download className="h-4 w-4" />
          Export
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isLoading}
          className={cn(
            "rounded-lg border border-neutral-200 p-2",
            "text-neutral-700 dark:text-neutral-300",
            "hover:bg-neutral-50 dark:hover:bg-neutral-800",
            "disabled:opacity-50",
            "transition-colors duration-100"
          )}
          title="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Stats Summary */}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {data.total}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">Total Domains</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.domains.filter((d) => d.status === "active").length}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">Active</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {data.domains.filter((d) => d.status === "pending").length}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">Pending</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {data.domains.filter((d) => d.isVerified).length}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">Verified</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <DomainsTable domains={data?.domains ?? []} onDomainClick={handleDomainClick} />
        )}
      </div>

      {/* Pagination */}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {(data.page - 1) * data.pageSize + 1} to{" "}
            {Math.min(data.page * data.pageSize, data.total)} of {data.total} domains
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.page === 1}
              className={cn(
                "rounded-lg border border-neutral-200 px-3 py-1 text-sm font-medium",
                "text-neutral-700 dark:text-neutral-300",
                "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                "disabled:opacity-50"
              )}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              className={cn(
                "rounded-lg border border-neutral-200 px-3 py-1 text-sm font-medium",
                "text-neutral-700 dark:text-neutral-300",
                "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                "disabled:opacity-50"
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
