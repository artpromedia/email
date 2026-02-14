"use client";

/**
 * Domain Admin - Users Page
 *
 * Manage users across all domains the admin has access to.
 * Shows user list with search, filters, and actions.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  Globe,
} from "lucide-react";
import { cn } from "@email/ui";
import { useDomainsList, type AdminDomain } from "@/lib/admin";

// ============================================================
// MAIN COMPONENT
// ============================================================

// ============================================================
// TYPES
// ============================================================

// ============================================================
// STATUS BADGE
// ============================================================

function UserStatusBadge({ status }: Readonly<{ status: "active" | "suspended" | "pending" }>) {
  const config = {
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
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      icon: Clock,
    },
  };

  const { label, className, icon: Icon } = config[status];

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
// ROLE BADGE
// ============================================================

// ============================================================
// DOMAIN FILTER DROPDOWN
// ============================================================

interface DomainFilterProps {
  domains: AdminDomain[];
  selected: string | undefined;
  onChange: (domainId: string | undefined) => void;
}

function DomainFilter({ domains, selected, onChange }: Readonly<DomainFilterProps>) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedDomain = domains.find((d) => d.id === selected);
  const label = selectedDomain ? selectedDomain.domain : "All Domains";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          "bg-white dark:bg-neutral-800",
          "border-neutral-200 dark:border-neutral-700",
          "hover:bg-neutral-50 dark:hover:bg-neutral-700"
        )}
      >
        <Globe className="h-4 w-4 text-neutral-500" />
        <span className="max-w-[150px] truncate">{label}</span>
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
          <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            <button
              onClick={() => {
                onChange(undefined);
                setIsOpen(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
                !selected && "bg-blue-50 text-blue-600 dark:bg-blue-900/20"
              )}
            >
              All Domains
            </button>
            {domains.map((domain) => (
              <button
                key={domain.id}
                onClick={() => {
                  onChange(domain.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  selected === domain.id && "bg-blue-50 text-blue-600 dark:bg-blue-900/20"
                )}
              >
                {domain.domain}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({
  hasFilter,
  onClearFilter,
}: Readonly<{ hasFilter: boolean; onClearFilter: () => void }>) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Users className="h-8 w-8 text-neutral-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
        {hasFilter ? "No users match your filters" : "No users yet"}
      </h3>
      <p className="mb-6 max-w-sm text-center text-neutral-500 dark:text-neutral-400">
        {hasFilter
          ? "Try adjusting your search or filter criteria."
          : "Users will appear here once they join your domains."}
      </p>
      {hasFilter ? (
        <button
          onClick={onClearFilter}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Clear filters
        </button>
      ) : (
        <Link
          href="/admin/domains"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Manage Domains
        </Link>
      )}
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function UsersLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-8 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="flex gap-4">
        <div className="h-10 w-64 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-40 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
        <div className="h-12 bg-neutral-100 dark:bg-neutral-800" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 border-t border-neutral-200 dark:border-neutral-700" />
        ))}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const {
    data: domainsData,
    isLoading,
    isError,
    refetch,
  } = useDomainsList({ page: 1, pageSize: 50 });

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<
    "active" | "suspended" | "pending" | undefined
  >();

  const domains = useMemo(() => domainsData?.domains ?? [], [domainsData]);

  // We show domain-level user counts from the domain list
  // In a full implementation, this would fetch actual users from the domain users API
  const domainUsers = useMemo(() => {
    const filteredDomains = selectedDomain
      ? domains.filter((d) => d.id === selectedDomain)
      : domains;

    return filteredDomains.map((d) => ({
      id: d.id,
      domain: d.domain,
      usersCount: d.usersCount,
      status: d.status,
    }));
  }, [domains, selectedDomain]);

  const totalUsers = domainUsers.reduce((sum, d) => sum + d.usersCount, 0);
  const hasFilter = !!searchQuery || !!selectedDomain || !!statusFilter;

  if (isLoading) {
    return <UsersLoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Failed to load users
        </h3>
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
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Users</h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            Manage users across your domains · <span className="font-medium">{totalUsers}</span>{" "}
            total users
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg border py-2 pl-10 pr-4 text-sm",
              "bg-white dark:bg-neutral-800",
              "border-neutral-200 dark:border-neutral-700",
              "focus:outline-none focus:ring-2 focus:ring-blue-500",
              "placeholder:text-neutral-400"
            )}
          />
        </div>

        {/* Domain Filter */}
        <DomainFilter domains={domains} selected={selectedDomain} onChange={setSelectedDomain} />
      </div>

      {/* Domain Users Table */}
      {domains.length === 0 ? (
        <EmptyState
          hasFilter={hasFilter}
          onClearFilter={() => {
            setSearchQuery("");
            setSelectedDomain(undefined);
            setStatusFilter(undefined);
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50">
              <tr>
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {(selectedDomain ? domains.filter((d) => d.id === selectedDomain) : domains).map(
                (domain) => (
                  <tr
                    key={domain.id}
                    className="border-t border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: `${domain.color}20`,
                          }}
                        >
                          <Globe className="h-4 w-4" style={{ color: domain.color }} />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">
                            {domain.domain}
                          </p>
                          <p className="text-xs text-neutral-500">{domain.displayName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={domain.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                        <Users className="h-4 w-4" />
                        <span className="font-medium">{domain.usersCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatBytes(domain.storageUsedBytes)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/domains/${domain.id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Manage Users →
                      </Link>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* User management info */}
      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/10">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300">Managing Users</h3>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              To manage individual users, click on a domain above to view its user list. You can
              add, edit, suspend, or remove users from the domain detail page. Users can belong to
              multiple domains.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
