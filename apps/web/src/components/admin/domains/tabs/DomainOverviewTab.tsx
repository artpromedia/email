"use client";

/**
 * Domain Overview Tab
 * Shows summary statistics and quick info for a domain
 */

import {
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Calendar,
  Activity,
} from "lucide-react";
import { cn } from "@email/ui";

import type { AdminDomainDetail, DnsRecordStatus } from "@/lib/admin";

// ============================================================
// STAT CARD COMPONENT
// ============================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-blue-500",
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
        </div>
        <div className={cn("rounded-lg bg-neutral-100 p-2 dark:bg-neutral-700", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DNS STATUS COMPONENT
// ============================================================

interface DnsStatusCardProps {
  mx: DnsRecordStatus;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
  lastChecked?: Date;
}

function DnsStatusCard({ mx, spf, dkim, dmarc, lastChecked }: DnsStatusCardProps) {
  const records = [
    { name: "MX Record", status: mx, description: "Receive emails" },
    { name: "SPF Record", status: spf, description: "Prevent spoofing" },
    { name: "DKIM Record", status: dkim, description: "Sign emails" },
    { name: "DMARC Record", status: dmarc, description: "Policy & reporting" },
  ];

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

  const verifiedCount = records.filter((r) => r.status === "verified").length;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">DNS Status</h3>
        <span className="text-sm text-neutral-500">
          {verifiedCount}/{records.length} verified
        </span>
      </div>
      <div className="space-y-3">
        {records.map((record) => (
          <div key={record.name} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {record.name}
              </p>
              <p className="text-xs text-neutral-500">{record.description}</p>
            </div>
            {getStatusIcon(record.status)}
          </div>
        ))}
      </div>
      {lastChecked && (
        <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-700">
          Last checked: {new Date(lastChecked).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ============================================================
// STORAGE PROGRESS COMPONENT
// ============================================================

interface StorageProgressProps {
  used: number;
  limit: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StorageProgress({ used, limit }: StorageProgressProps) {
  const percentage = Math.min((used / limit) * 100, 100);
  const isHigh = percentage > 80;
  const isCritical = percentage > 95;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Storage Usage</h3>
        <span className="text-sm text-neutral-500">{percentage.toFixed(1)}%</span>
      </div>
      <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isCritical ? "bg-red-500" : isHigh ? "bg-yellow-500" : "bg-blue-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(limit)} total</span>
      </div>
    </div>
  );
}

// ============================================================
// QUICK INFO COMPONENT
// ============================================================

interface QuickInfoProps {
  domain: AdminDomainDetail;
}

function QuickInfo({ domain }: QuickInfoProps) {
  const infoItems = [
    {
      label: "Created",
      value: new Date(domain.createdAt).toLocaleDateString(),
      icon: Calendar,
    },
    {
      label: "Verified",
      value: domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : "Not verified",
      icon: Shield,
    },
    {
      label: "Last Updated",
      value: new Date(domain.updatedAt).toLocaleDateString(),
      icon: Activity,
    },
  ];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <h3 className="mb-4 font-medium text-neutral-900 dark:text-neutral-100">Quick Info</h3>
      <div className="space-y-3">
        {infoItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-neutral-400" />
              <div className="flex-1">
                <p className="text-xs text-neutral-500">{item.label}</p>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface DomainOverviewTabProps {
  domain: AdminDomainDetail;
}

export function DomainOverviewTab({ domain }: DomainOverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={domain.usersCount}
          icon={Users}
          iconColor="text-blue-500"
        />
        <StatCard
          title="Active DKIM Keys"
          value={domain.dkimKeys.filter((k) => k.status === "active").length}
          subtitle={`${domain.dkimKeys.length} total keys`}
          icon={Shield}
          iconColor="text-green-500"
        />
        <StatCard
          title="DNS Records"
          value={`${[domain.dnsStatus.mx, domain.dnsStatus.spf, domain.dnsStatus.dkim, domain.dnsStatus.dmarc].filter((s) => s === "verified").length}/4`}
          subtitle="Verified"
          icon={Activity}
          iconColor="text-purple-500"
        />
        <StatCard
          title="Status"
          value={domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
          icon={CheckCircle2}
          iconColor={
            domain.status === "active"
              ? "text-green-500"
              : domain.status === "pending"
                ? "text-yellow-500"
                : "text-red-500"
          }
        />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DnsStatusCard
          mx={domain.dnsStatus.mx}
          spf={domain.dnsStatus.spf}
          dkim={domain.dnsStatus.dkim}
          dmarc={domain.dnsStatus.dmarc}
          lastChecked={domain.dnsStatus.lastChecked}
        />
        <StorageProgress used={domain.storageUsedBytes} limit={domain.storageLimitBytes} />
        <QuickInfo domain={domain} />
      </div>
    </div>
  );
}
