"use client";

/**
 * Domain Admin - DNS & DKIM Page
 *
 * Consolidated view of DNS records and DKIM keys across all domains.
 * Links to domain-specific detail pages for management.
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@email/ui";
import {
  useDomainsList,
  useBulkVerifyDns,
  type AdminDomain,
  type DnsRecordStatus,
} from "@/lib/admin";

// ============================================================
// DNS STATUS HELPERS
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

function getDnsStatusLabel(status: DnsRecordStatus) {
  const labels: Record<DnsRecordStatus, string> = {
    verified: "Verified",
    missing: "Not Found",
    mismatch: "Mismatch",
    pending: "Pending",
  };
  return labels[status];
}

function getDnsStatusColor(status: DnsRecordStatus) {
  switch (status) {
    case "verified":
      return "text-green-600 dark:text-green-400";
    case "missing":
      return "text-red-600 dark:text-red-400";
    case "mismatch":
      return "text-yellow-600 dark:text-yellow-400";
    case "pending":
      return "text-neutral-500";
  }
}

// ============================================================
// DOMAIN DNS CARD
// ============================================================

interface DomainDnsCardProps {
  domain: AdminDomain;
}

function DomainDnsCard({ domain }: Readonly<DomainDnsCardProps>) {
  const records = [
    { label: "MX Record", status: domain.dnsStatus.mx },
    { label: "SPF Record", status: domain.dnsStatus.spf },
    { label: "DKIM Record", status: domain.dnsStatus.dkim },
    { label: "DMARC Record", status: domain.dnsStatus.dmarc },
  ];

  const verifiedCount = records.filter((r) => r.status === "verified").length;
  const totalCount = records.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      {/* Domain Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${domain.color}20` }}
          >
            <Globe className="h-5 w-5" style={{ color: domain.color }} />
          </div>
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{domain.domain}</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {verifiedCount}/{totalCount} records verified
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {domain.dnsStatus.isFullyVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              All Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              <AlertCircle className="h-3 w-3" />
              Action Needed
            </span>
          )}
        </div>
      </div>

      {/* DNS Records */}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
        {records.map((record) => (
          <div key={record.label} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-neutral-400" />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">{record.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {getDnsStatusIcon(record.status)}
              <span className={cn("text-sm font-medium", getDnsStatusColor(record.status))}>
                {getDnsStatusLabel(record.status)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        <Link
          href={`/admin/domains/${domain.id}`}
          className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          Manage DNS & DKIM
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function DnsSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-8 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
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

export default function AdminDnsPage() {
  const {
    data: domainsData,
    isLoading,
    isError,
    refetch,
  } = useDomainsList({ page: 1, pageSize: 50 });
  const bulkVerify = useBulkVerifyDns();

  const domains = useMemo(() => domainsData?.domains ?? [], [domainsData]);

  const summary = useMemo(() => {
    const total = domains.length;
    const allVerified = domains.filter((d) => d.dnsStatus.isFullyVerified).length;
    const withIssues = total - allVerified;
    return { total, allVerified, withIssues };
  }, [domains]);

  const handleBulkVerify = () => {
    const domainIds = domains.map((d) => d.id);
    bulkVerify.mutate(domainIds, {
      onSuccess: () => {
        void refetch();
      },
    });
  };

  if (isLoading) {
    return <DnsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Failed to load DNS data
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            DNS & DKIM
          </h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            Manage DNS records and DKIM keys for your domains
          </p>
        </div>
        <button
          onClick={handleBulkVerify}
          disabled={bulkVerify.isPending || domains.length === 0}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium",
            "bg-white dark:bg-neutral-800",
            "border-neutral-200 dark:border-neutral-700",
            "hover:bg-neutral-50 dark:hover:bg-neutral-700",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", bulkVerify.isPending && "animate-spin")} />
          Verify All
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Domains</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {summary.total}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Fully Verified</p>
          <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
            {summary.allVerified}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Needs Attention</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              summary.withIssues > 0
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-neutral-900 dark:text-neutral-100"
            )}
          >
            {summary.withIssues}
          </p>
        </div>
      </div>

      {/* Domain DNS Cards */}
      {domains.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-800">
          <Shield className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
          <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            No domains configured
          </h3>
          <p className="mb-6 text-neutral-500 dark:text-neutral-400">
            Add a domain to start configuring DNS records and DKIM keys.
          </p>
          <Link
            href="/admin/domains/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Domain
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {domains.map((domain) => (
            <DomainDnsCard key={domain.id} domain={domain} />
          ))}
        </div>
      )}
    </div>
  );
}
