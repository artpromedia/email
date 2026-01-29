"use client";

/**
 * Domain Users Tab
 * Shows and manages users associated with a domain
 */

import { useState } from "react";
import { Users, Search, Mail, HardDrive, MoreHorizontal, UserPlus, Download } from "lucide-react";
import type { DomainUser } from "@email/types";
import { cn } from "@email/ui";

import { useDomainUsers, useExportDomainUsers } from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DomainUsersTabProps {
  domainId: string;
}

// ============================================================
// USER ROW COMPONENT
// ============================================================

interface UserRowProps {
  user: DomainUser;
}

function UserRow({ user }: UserRowProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getUsagePercentage = () => {
    if (user.quotaBytes === 0) return 0;
    return Math.round((user.storageUsedBytes / user.quotaBytes) * 100);
  };

  const usagePercentage = getUsagePercentage();

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <span className="text-sm font-medium">
              {user.displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <div>
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {user.displayName}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">
        {user.emailCount}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-900 dark:text-neutral-100">
              {formatBytes(user.storageUsedBytes)}
            </span>
            <span className="text-neutral-500 dark:text-neutral-400">
              / {formatBytes(user.quotaBytes)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usagePercentage >= 90
                  ? "bg-red-500"
                  : usagePercentage >= 75
                    ? "bg-amber-500"
                    : "bg-blue-500"
              )}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
        {user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleDateString() : "Never"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <MoreHorizontal className="h-4 w-4 text-neutral-500" />
        </button>
      </td>
    </tr>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainUsersTab({ domainId }: DomainUsersTabProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useDomainUsers(domainId, {
    search: search || undefined,
    page,
    pageSize,
  });

  const exportUsers = useExportDomainUsers();

  const handleExport = async () => {
    try {
      const blob = await exportUsers.mutateAsync({ domainId, search });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `domain-users-${domainId}-${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export users:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Domain Users
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Users with email addresses on this domain
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportUsers.isPending}
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
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
              "bg-blue-600 text-white hover:bg-blue-700",
              "transition-colors duration-100"
            )}
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {data.total}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Total Users</div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {data.users
                    .reduce(
                      (sum: number, u) =>
                        sum +
                        (typeof (u as { emailCount?: number }).emailCount === "number"
                          ? (u as { emailCount: number }).emailCount
                          : 0),
                      0
                    )
                    .toLocaleString()}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Total Emails</div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {(
                    data.users.reduce(
                      (sum: number, u) =>
                        sum +
                        (typeof (u as { storageUsedBytes?: number }).storageUsedBytes === "number"
                          ? (u as { storageUsedBytes: number }).storageUsedBytes
                          : 0),
                      0
                    ) /
                    1024 /
                    1024 /
                    1024
                  ).toFixed(1)}{" "}
                  GB
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Storage Used</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search users..."
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
      </div>

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600" />
          </div>
        ) : data && data.users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Emails
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Storage
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Last Activity
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
              <Users className="h-6 w-6 text-neutral-400" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              No users found
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {search ? "Try adjusting your search" : "Add your first user to get started"}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of{" "}
            {data.total} users
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                "rounded-lg border border-neutral-200 px-3 py-1 text-sm font-medium",
                "text-neutral-700 dark:text-neutral-300",
                "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                "disabled:opacity-50"
              )}
            >
              Previous
            </button>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Page {page} of {Math.ceil(data.total / pageSize)}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * pageSize >= data.total}
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
