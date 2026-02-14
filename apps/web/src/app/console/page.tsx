"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Mail,
  Globe,
  KeyRound,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
} from "lucide-react";

interface DashboardStats {
  emails_sent_today: number;
  emails_sent_month: number;
  daily_limit: number;
  monthly_limit: number;
  delivery_rate: number;
  domains_count: number;
  domains_verified: number;
  api_keys_count: number;
  plan_name: string;
  plan_slug: string;
}

function UsageMeter({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = pct >= 80;
  const isCritical = pct >= 95;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10">
        <div
          className={`h-2 rounded-full transition-all ${
            isCritical ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isCritical && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="h-3 w-3" />
          Approaching limit — consider upgrading
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const content = (
    <div className="group rounded-xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/[0.07]">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-gray-500" />
        {href && (
          <ArrowUpRight className="h-4 w-4 text-gray-600 transition group-hover:text-gray-400" />
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="mt-0.5 text-sm text-gray-400">{label}</div>
        {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function ConsoleDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, this would fetch from /api/v1/console/dashboard
    // For now, use placeholder data that matches the free plan defaults
    const timer = setTimeout(() => {
      const mockStats: DashboardStats = {
        emails_sent_today: 0,
        emails_sent_month: 0,
        daily_limit: 100,
        monthly_limit: 3000,
        delivery_rate: 0,
        domains_count: 0,
        domains_verified: 0,
        api_keys_count: 0,
        plan_name: "Free",
        plan_slug: "free",
      };
      setStats(mockStats);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">
            {stats.plan_name} plan — overview of your email sending
          </p>
        </div>
        {stats.plan_slug === "free" && (
          <Link
            href="/console/billing"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
          >
            <Zap className="h-4 w-4" />
            Upgrade
          </Link>
        )}
      </div>

      {/* Usage meters */}
      <div className="mt-8 space-y-5 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-sm font-semibold text-gray-300">Usage</h2>
        <UsageMeter
          label="Today"
          used={stats.emails_sent_today}
          limit={stats.daily_limit}
          unit="emails"
        />
        <UsageMeter
          label="This month"
          used={stats.emails_sent_month}
          limit={stats.monthly_limit}
          unit="emails"
        />
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Mail}
          label="Emails sent today"
          value={stats.emails_sent_today}
          sub={`of ${stats.daily_limit} daily limit`}
          href="/console/analytics"
        />
        <StatCard
          icon={TrendingUp}
          label="Delivery rate"
          value={stats.delivery_rate > 0 ? `${stats.delivery_rate.toFixed(1)}%` : "—"}
          sub="Last 30 days"
          href="/console/analytics"
        />
        <StatCard
          icon={Globe}
          label="Verified domains"
          value={`${stats.domains_verified}/${stats.domains_count}`}
          sub={`of ${stats.domains_count} total`}
          href="/console/domains"
        />
        <StatCard
          icon={KeyRound}
          label="Active API keys"
          value={stats.api_keys_count}
          href="/console/api-keys"
        />
      </div>

      {/* Getting started checklist */}
      {stats.domains_count === 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">Getting Started</h2>
          <p className="mt-1 text-sm text-gray-400">Complete these steps to start sending emails</p>
          <div className="mt-5 space-y-4">
            {[
              {
                done: true,
                label: "Create your account",
                href: null,
              },
              {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- checked at runtime with real API data
                done: stats.domains_count > 0,
                label: "Add a sending domain",
                href: "/console/domains",
              },
              {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- checked at runtime with real API data
                done: stats.domains_verified > 0 && stats.domains_count > 0,
                label: "Verify DNS records",
                href: "/console/domains",
              },
              {
                done: stats.api_keys_count > 0,
                label: "Create an API key",
                href: "/console/api-keys",
              },
              {
                done: stats.emails_sent_month > 0,
                label: "Send your first email",
                href: null,
              },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 shrink-0 text-gray-600" />
                )}
                {step.href && !step.done ? (
                  <Link href={step.href} className="text-sm text-blue-400 hover:text-blue-300">
                    {step.label}
                  </Link>
                ) : (
                  <span
                    className={`text-sm ${step.done ? "text-gray-400 line-through" : "text-gray-300"}`}
                  >
                    {step.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick code snippet */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold">Quick Start</h2>
        <p className="mt-1 text-sm text-gray-400">Install the SDK and send your first email</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-gray-950 p-4 font-mono text-sm">
          <pre className="text-gray-300">npm install @oonrumail/sdk</pre>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-gray-950 p-4 font-mono text-sm">
          <pre className="text-gray-300">{`import { OonruMail } from "@oonrumail/sdk";

const mail = new OonruMail({ apiKey: "YOUR_API_KEY" });

await mail.send({
  from: "you@yourdomain.com",
  to: ["recipient@example.com"],
  subject: "Hello from OonruMail",
  html: "<h1>It works!</h1>",
});`}</pre>
        </div>
      </div>
    </div>
  );
}
