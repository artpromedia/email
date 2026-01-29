"use client";

/**
 * Domains List Page
 * Admin page for managing domains with table, filters, search
 */

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  MoreHorizontal,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Star,
  ChevronDown,
  Users,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useDomainsList,
  useBulkVerifyDns,
  useExportDomains,
  type AdminDomain,
  type DomainStatus,
  type DnsRecordStatus,
  type ListDomainsQuery,
} from "@/lib/admin";

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

interface StatusBadgeProps {
  status: DomainStatus;
}

function StatusBadge({ status }: Readonly<StatusBadgeProps>) {
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

// ============================================================
// DNS STATUS ICONS COMPONENT
// ============================================================

interface DnsStatusIconsProps {
  mx: DnsRecordStatus;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
}

function DnsStatusIcons({ mx, spf, dkim, dmarc }: Readonly<DnsStatusIconsProps>) {
  const records = [
    { name: "MX", status: mx },
    { name: "SPF", status: spf },
    { name: "DKIM", status: dkim },
    { name: "DMARC", status: dmarc },
  ];

  const getStatusIcon = (status: DnsRecordStatus) => {
    switch (status) {
      case "verified":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "missing":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "mismatch":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-neutral-400" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {records.map((record) => (
        <div
          key={record.name}
          className="flex items-center gap-0.5"
          title={`${record.name}: ${record.status}`}
        >
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{record.name}</span>
          {getStatusIcon(record.status)}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// STORAGE DISPLAY COMPONENT
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface StorageDisplayProps {
  used: number;
  limit: number;
}

function StorageDisplay({ used, limit }: Readonly<StorageDisplayProps>) {
  const percentage = Math.min((used / limit) * 100, 100);
  const isHigh = percentage > 80;
  const isCritical = percentage > 95;

  const getProgressColor = () => {
    if (isCritical) return "bg-red-500";
    if (isHigh) return "bg-yellow-500";
    return "bg-blue-500";
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{formatBytes(used)}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={cn("h-full rounded-full transition-all", getProgressColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// DOMAIN ROW COMPONENT
// ============================================================

interface DomainRowProps {
  domain: AdminDomain;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

function DomainRow({ domain, isSelected, onSelect }: Readonly<DomainRowProps>) {
  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50">
      {/* Checkbox */}
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(domain.id, e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
        />
      </td>

      {/* Domain */}
      <td className="px-4 py-3">
        <Link
          href={`/admin/domains/${domain.id}`}
          className="flex items-center gap-2 hover:text-blue-600"
        >
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: domain.color }}
          />
          <div className="flex flex-col">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {domain.domain}
            </span>
            <span className="text-xs text-neutral-500">{domain.displayName}</span>
          </div>
          {domain.isPrimary && (
            <Star className="h-4 w-4 flex-shrink-0 fill-yellow-500 text-yellow-500" />
          )}
        </Link>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={domain.status} />
      </td>

      {/* Users */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
          <Users className="h-4 w-4" />
          <span>{domain.usersCount}</span>
        </div>
      </td>

      {/* Storage */}
      <td className="px-4 py-3">
        <StorageDisplay used={domain.storageUsedBytes} limit={domain.storageLimitBytes} />
      </td>

      {/* DNS Status */}
      <td className="px-4 py-3">
        <DnsStatusIcons
          mx={domain.dnsStatus.mx}
          spf={domain.dnsStatus.spf}
          dkim={domain.dnsStatus.dkim}
          dmarc={domain.dnsStatus.dmarc}
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/domains/${domain.id}`}
            className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// TABLE HEADER COMPONENT
// ============================================================

interface TableHeaderProps {
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
}

function TableHeader({ allSelected, onSelectAll }: Readonly<TableHeaderProps>) {
  return (
    <thead className="bg-neutral-50 dark:bg-neutral-800/50">
      <tr>
        <th className="px-4 py-3 text-left">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
          />
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Domain
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Status
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Users
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Storage
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          DNS Status
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Actions
        </th>
      </tr>
    </thead>
  );
}

// ============================================================
// FILTER DROPDOWN COMPONENT
// ============================================================

interface FilterDropdownProps {
  value: DomainStatus | undefined;
  onChange: (value: DomainStatus | undefined) => void;
}

function FilterDropdown({ value, onChange }: Readonly<FilterDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false);

  const options: { value: DomainStatus | undefined; label: string }[] = [
    { value: undefined, label: "All Status" },
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
    { value: "suspended", label: "Suspended" },
  ];

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          "bg-white dark:bg-neutral-800",
          "border-neutral-200 dark:border-neutral-700",
          "hover:bg-neutral-50 dark:hover:bg-neutral-700",
          "focus:outline-none focus:ring-2 focus:ring-blue-500"
        )}
      >
        <Filter className="h-4 w-4 text-neutral-500" />
        <span>{selected.label}</span>
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
          <div className="absolute left-0 z-20 mt-1 w-40 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {options.map((option) => (
              <button
                key={option.label}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  option.value === value && "bg-blue-50 text-blue-600 dark:bg-blue-900/20"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// EMPTY STATE COMPONENT
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Globe className="h-8 w-8 text-neutral-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
        No domains found
      </h3>
      <p className="mb-6 max-w-sm text-center text-neutral-500 dark:text-neutral-400">
        Get started by adding your first domain. You can manage email, DNS records, and users for
        each domain.
      </p>
      <Link
        href="/admin/domains/new"
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2",
          "bg-blue-600 text-white hover:bg-blue-700",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        )}
      >
        <Plus className="h-4 w-4" />
        Add Domain
      </Link>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="mb-4 flex items-center gap-4">
        <div className="h-10 w-64 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div className="h-12 bg-neutral-100 dark:bg-neutral-800" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 border-t border-neutral-200 dark:border-neutral-700" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainsListPage() {
  // Query state
  const [query, setQuery] = useState<ListDomainsQuery>({
    page: 1,
    pageSize: 20,
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Data fetching
  const { data, isLoading, isError, refetch } = useDomainsList(query);
  const bulkVerifyDns = useBulkVerifyDns();
  const exportDomains = useExportDomains();

  // Handlers
  const handleSearch = useCallback(() => {
    setQuery((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
  }, [searchInput]);

  const handleStatusFilter = useCallback((status: DomainStatus | undefined) => {
    setQuery((prev) => ({ ...prev, status, page: 1 }));
  }, []);

  const handleSelectDomain = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected && data?.domains) {
        setSelectedIds(new Set(data.domains.map((d) => d.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [data]
  );

  const handleBulkVerifyDns = useCallback(() => {
    if (selectedIds.size > 0) {
      bulkVerifyDns.mutate(Array.from(selectedIds));
    }
  }, [selectedIds, bulkVerifyDns]);

  const handleExport = useCallback(
    (format: "csv" | "json") => {
      exportDomains.mutate({
        format,
        domainIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
      });
    },
    [selectedIds, exportDomains]
  );

  // Computed values
  const allSelected = useMemo(() => {
    if (!data?.domains || data.domains.length === 0) return false;
    return data.domains.every((d) => selectedIds.has(d.id));
  }, [data, selectedIds]);

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Failed to load domains
        </h3>
        <button onClick={() => refetch()} className="text-blue-600 hover:text-blue-700">
          Try again
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Domains</h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            Manage your organization&apos;s email domains
          </p>
        </div>
        <Link
          href="/admin/domains/new"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2",
            "bg-blue-600 text-white hover:bg-blue-700",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          )}
        >
          <Plus className="h-4 w-4" />
          Add Domain
        </Link>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search domains..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className={cn(
                "w-64 rounded-lg border py-2 pl-10 pr-4 text-sm",
                "bg-white dark:bg-neutral-800",
                "border-neutral-200 dark:border-neutral-700",
                "focus:outline-none focus:ring-2 focus:ring-blue-500",
                "placeholder:text-neutral-400"
              )}
            />
          </div>

          {/* Status Filter */}
          <FilterDropdown value={query.status} onChange={handleStatusFilter} />
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-neutral-500">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkVerifyDns}
                disabled={bulkVerifyDns.isPending}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "border-neutral-200 dark:border-neutral-700",
                  "hover:bg-neutral-50 dark:hover:bg-neutral-700",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <RefreshCw className={cn("h-4 w-4", bulkVerifyDns.isPending && "animate-spin")} />
                Verify DNS
              </button>
            </>
          )}
          <button
            onClick={() => handleExport("csv")}
            disabled={exportDomains.isPending}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              "bg-white dark:bg-neutral-800",
              "border-neutral-200 dark:border-neutral-700",
              "hover:bg-neutral-50 dark:hover:bg-neutral-700",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      {data?.domains && data.domains.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full">
            <TableHeader allSelected={allSelected} onSelectAll={handleSelectAll} />
            <tbody>
              {data.domains.map((domain) => (
                <DomainRow
                  key={domain.id}
                  domain={domain}
                  isSelected={selectedIds.has(domain.id)}
                  onSelect={handleSelectDomain}
                />
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
              <span className="text-sm text-neutral-500">
                Showing {(data.page - 1) * data.pageSize + 1} to{" "}
                {Math.min(data.page * data.pageSize, data.total)} of {data.total} domains
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuery((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
                  disabled={data.page === 1}
                  className={cn(
                    "rounded border px-3 py-1.5 text-sm",
                    "border-neutral-200 dark:border-neutral-700",
                    "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  onClick={() => setQuery((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                  disabled={data.page === data.totalPages}
                  className={cn(
                    "rounded border px-3 py-1.5 text-sm",
                    "border-neutral-200 dark:border-neutral-700",
                    "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
