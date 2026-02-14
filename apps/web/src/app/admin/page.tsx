"use client";

/**
 * Domain Admin Dashboard
 *
 * Overview page showing domain statistics, health, recent activity,
 * and quick actions for the domain administrator.
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  Globe,
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Plus,
  Settings,
  HardDrive,
  TrendingUp,
} from "lucide-react";
import { cn } from "@email/ui";
import { useDomainsList, type AdminDomain, type DnsRecordStatus } from "@/lib/admin";
import { useCurrentUser } from "@/lib/auth";

// ============================================================
// STAT CARD
// ============================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  trend?: { value: number; label: string };
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
}: Readonly<StatCardProps>) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
          <p className="mt-1.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <TrendingUp
                className={cn("h-3.5 w-3.5", trend.value >= 0 ? "text-green-500" : "text-red-500")}
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.value >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-xs text-neutral-500">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DNS STATUS CARD
// ============================================================

function getDnsStatusIcon(status: DnsRecordStatus) {
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
}

// ============================================================
// DOMAIN CARD
// ============================================================

interface DomainCardProps {
  domain: AdminDomain;
}

function DomainCard({ domain }: Readonly<DomainCardProps>) {
  const statusConfig = {
    active: {
      label: "Active",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    suspended: {
      label: "Suspended",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  const { label, className } = statusConfig[domain.status];

  return (
    <Link
      href={`/admin/domains/${domain.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${domain.color}20` }}
          >
            <Globe className="h-5 w-5" style={{ color: domain.color }} />
          </div>
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{domain.domain}</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{domain.displayName}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            className
          )}
        >
          {label}
        </span>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Users</p>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {domain.usersCount}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Storage</p>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {formatBytes(domain.storageUsedBytes)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">DNS</p>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {domain.dnsStatus.isFullyVerified ? (
              <span className="text-green-600 dark:text-green-400">✓ OK</span>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">Issues</span>
            )}
          </p>
        </div>
      </div>

      {/* DNS Status Row */}
      <div className="mt-3 flex items-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-700">
        <div className="flex items-center gap-1" title={`MX: ${domain.dnsStatus.mx}`}>
          <span className="text-xs text-neutral-400">MX</span>
          {getDnsStatusIcon(domain.dnsStatus.mx)}
        </div>
        <div className="flex items-center gap-1" title={`SPF: ${domain.dnsStatus.spf}`}>
          <span className="text-xs text-neutral-400">SPF</span>
          {getDnsStatusIcon(domain.dnsStatus.spf)}
        </div>
        <div className="flex items-center gap-1" title={`DKIM: ${domain.dnsStatus.dkim}`}>
          <span className="text-xs text-neutral-400">DKIM</span>
          {getDnsStatusIcon(domain.dnsStatus.dkim)}
        </div>
        <div className="flex items-center gap-1" title={`DMARC: ${domain.dnsStatus.dmarc}`}>
          <span className="text-xs text-neutral-400">DMARC</span>
          {getDnsStatusIcon(domain.dnsStatus.dmarc)}
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// QUICK ACTIONS
// ============================================================

const quickActions = [
  {
    label: "Add Domain",
    href: "/admin/domains/new",
    icon: Plus,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    label: "Manage Users",
    href: "/admin/users",
    icon: Users,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
  },
  {
    label: "DNS & DKIM",
    href: "/admin/dns",
    icon: Shield,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
];

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

// ============================================================
// LOADING SKELETON
// ============================================================

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 w-64 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AdminDashboardPage() {
  const { data: user, isLoading: isLoadingUser } = useCurrentUser();
  const { data: domainsData, isLoading: isLoadingDomains } = useDomainsList({
    page: 1,
    pageSize: 50,
  });

  // Aggregate stats
  const stats = useMemo(() => {
    if (!domainsData?.domains)
      return {
        totalDomains: 0,
        totalUsers: 0,
        totalStorage: 0,
        activeCount: 0,
        pendingCount: 0,
        dnsIssues: 0,
      };

    const domains = domainsData.domains;
    return {
      totalDomains: domains.length,
      totalUsers: domains.reduce((sum, d) => sum + d.usersCount, 0),
      totalStorage: domains.reduce((sum, d) => sum + d.storageUsedBytes, 0),
      activeCount: domains.filter((d) => d.status === "active").length,
      pendingCount: domains.filter((d) => d.status === "pending").length,
      dnsIssues: domains.filter((d) => !d.dnsStatus.isFullyVerified).length,
    };
  }, [domainsData]);

  if (isLoadingUser || isLoadingDomains) {
    return <DashboardSkeleton />;
  }

  const domains = domainsData?.domains ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Welcome back
          {user?.profile.firstName ? `, ${user.profile.firstName}` : ""}
        </h1>
        <p className="mt-1 text-neutral-500 dark:text-neutral-400">
          Here&apos;s an overview of your domain administration
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Domains"
          value={stats.totalDomains}
          subtitle={`${stats.activeCount} active`}
          icon={Globe}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          subtitle="Across all domains"
          icon={Users}
          iconColor="text-purple-600 dark:text-purple-400"
          iconBg="bg-purple-50 dark:bg-purple-900/20"
        />
        <StatCard
          title="Storage Used"
          value={formatBytes(stats.totalStorage)}
          subtitle="Total usage"
          icon={HardDrive}
          iconColor="text-orange-600 dark:text-orange-400"
          iconBg="bg-orange-50 dark:bg-orange-900/20"
        />
        <StatCard
          title="DNS Health"
          value={
            stats.dnsIssues === 0
              ? "All Good"
              : `${stats.dnsIssues} Issue${stats.dnsIssues > 1 ? "s" : ""}`
          }
          subtitle={stats.dnsIssues === 0 ? "All records verified" : "Needs attention"}
          icon={stats.dnsIssues === 0 ? CheckCircle2 : AlertCircle}
          iconColor={
            stats.dnsIssues === 0
              ? "text-green-600 dark:text-green-400"
              : "text-yellow-600 dark:text-yellow-400"
          }
          iconBg={
            stats.dnsIssues === 0
              ? "bg-green-50 dark:bg-green-900/20"
              : "bg-yellow-50 dark:bg-yellow-900/20"
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div
                  className={cn("flex h-10 w-10 items-center justify-center rounded-lg", action.bg)}
                >
                  <Icon className={cn("h-5 w-5", action.color)} />
                </div>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Domains */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Your Domains
          </h2>
          <Link
            href="/admin/domains"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {domains.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-800">
            <Globe className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
              No domains yet
            </h3>
            <p className="mb-6 text-neutral-500 dark:text-neutral-400">
              Add your first domain to start managing email.
            </p>
            <Link
              href="/admin/domains/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Domain
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {domains.slice(0, 4).map((domain) => (
              <DomainCard key={domain.id} domain={domain} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
