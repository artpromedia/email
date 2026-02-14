"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  CheckCircle2,
  ArrowUpRight,
  Zap,
  Download,
  ExternalLink,
  Clock,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import type { Plan, Subscription, Invoice } from "@/types/billing";

const PLANS: Plan[] = [
  {
    id: "plan_free",
    slug: "free",
    name: "Free",
    description: "For testing and small projects",
    price_monthly: 0,
    price_yearly: 0,
    stripe_price_monthly: null,
    stripe_price_yearly: null,
    limits: {
      emails_per_month: 3000,
      emails_per_day: 100,
      max_domains: 1,
      max_api_keys: 2,
      max_webhooks: 1,
      max_templates: 5,
      max_team_members: 1,
      max_contacts: 500,
    },
    features: {
      custom_tracking_domain: false,
      dedicated_ip: false,
      priority_support: false,
      sso: false,
      audit_log: false,
      sla: false,
    },
    overage_enabled: false,
    overage_price_per_1000: 0,
    is_active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  },
  {
    id: "plan_pro",
    slug: "pro",
    name: "Pro",
    description: "For growing businesses",
    price_monthly: 2000,
    price_yearly: 19200,
    stripe_price_monthly: "price_pro_monthly",
    stripe_price_yearly: "price_pro_yearly",
    limits: {
      emails_per_month: 50000,
      emails_per_day: 2000,
      max_domains: 5,
      max_api_keys: 10,
      max_webhooks: 5,
      max_templates: 50,
      max_team_members: 5,
      max_contacts: 10000,
    },
    features: {
      custom_tracking_domain: true,
      dedicated_ip: false,
      priority_support: false,
      sso: false,
      audit_log: true,
      sla: false,
    },
    overage_enabled: true,
    overage_price_per_1000: 100,
    is_active: true,
    sort_order: 1,
    created_at: "",
    updated_at: "",
  },
  {
    id: "plan_business",
    slug: "business",
    name: "Business",
    description: "For high-volume senders",
    price_monthly: 7500,
    price_yearly: 72000,
    stripe_price_monthly: "price_business_monthly",
    stripe_price_yearly: "price_business_yearly",
    limits: {
      emails_per_month: 200000,
      emails_per_day: 10000,
      max_domains: 25,
      max_api_keys: 50,
      max_webhooks: 25,
      max_templates: 500,
      max_team_members: 20,
      max_contacts: 100000,
    },
    features: {
      custom_tracking_domain: true,
      dedicated_ip: true,
      priority_support: true,
      sso: false,
      audit_log: true,
      sla: false,
    },
    overage_enabled: true,
    overage_price_per_1000: 75,
    is_active: true,
    sort_order: 2,
    created_at: "",
    updated_at: "",
  },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-blue-500";

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- PLANS is a non-empty const array
const DEFAULT_PLAN = PLANS[0] as Plan;

export default function ConsoleBillingPage() {
  const [currentPlan] = useState<Plan>(DEFAULT_PLAN);
  const [subscription] = useState<Subscription | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [invoices] = useState<Invoice[]>([]);
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  // Usage data — in production fetch from /api/v1/console/usage
  const usage = {
    emails_this_month: 1247,
    emails_today: 42,
    domains: 1,
    api_keys: 1,
    webhooks: 0,
    templates: 2,
  };

  const handleUpgrade = async (planSlug: string) => {
    setUpgrading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: planSlug,
          interval: billingInterval,
          success_url: `${window.location.origin}/console/billing?success=true`,
          cancel_url: `${window.location.origin}/console/billing`,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { url: string };
        window.location.href = data.url;
      }
    } catch {
      // handle error
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    setManagingBilling(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          return_url: `${window.location.origin}/console/billing`,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { url: string };
        window.location.href = data.url;
      }
    } catch {
      // handle error
    } finally {
      setManagingBilling(false);
    }
  };

  // Check for success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      // Refresh subscription data
      window.history.replaceState({}, "", "/console/billing");
    }
  }, []);

  return (
    <div className="max-w-5xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="mt-1 text-sm text-gray-400">Manage your subscription and usage</p>
        </div>
        {subscription && (
          <button
            onClick={handleManageBilling}
            disabled={managingBilling}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
          >
            <ExternalLink className="h-4 w-4" />
            {managingBilling ? "Loading..." : "Manage Billing"}
          </button>
        )}
      </div>

      {/* Current plan */}
      <div className="mt-6 rounded-xl border border-white/10 bg-gradient-to-r from-blue-500/5 to-purple-500/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-blue-500/10 p-3">
              <CreditCard className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Current plan</p>
              <h2 className="text-xl font-bold">{currentPlan.name}</h2>
              {subscription && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {subscription.billing_interval === "yearly" ? "Annual" : "Monthly"} billing •{" "}
                  {subscription.status === "active" ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    <span className="text-yellow-400">{subscription.status}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          {currentPlan.price_monthly > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold">
                {formatCents(
                  billingInterval === "yearly"
                    ? currentPlan.price_yearly / 12
                    : currentPlan.price_monthly
                )}
                <span className="text-sm font-normal text-gray-400">/month</span>
              </p>
              {billingInterval === "yearly" && (
                <p className="text-xs text-green-400">
                  Save {formatCents(currentPlan.price_monthly * 12 - currentPlan.price_yearly)}/year
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Usage */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 font-semibold">Current usage</h3>
        <div className="space-y-4">
          <UsageMeter
            label="Emails this month"
            used={usage.emails_this_month}
            limit={currentPlan.limits.emails_per_month}
          />
          <UsageMeter
            label="Emails today"
            used={usage.emails_today}
            limit={currentPlan.limits.emails_per_day}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-500">Domains</p>
              <p className="text-lg font-semibold">
                {usage.domains}{" "}
                <span className="text-xs text-gray-500">/ {currentPlan.limits.max_domains}</span>
              </p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-500">API Keys</p>
              <p className="text-lg font-semibold">
                {usage.api_keys}{" "}
                <span className="text-xs text-gray-500">/ {currentPlan.limits.max_api_keys}</span>
              </p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-500">Webhooks</p>
              <p className="text-lg font-semibold">
                {usage.webhooks}{" "}
                <span className="text-xs text-gray-500">/ {currentPlan.limits.max_webhooks}</span>
              </p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-500">Templates</p>
              <p className="text-lg font-semibold">
                {usage.templates}{" "}
                <span className="text-xs text-gray-500">/ {currentPlan.limits.max_templates}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade plans */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">
            {currentPlan.slug === "free" ? "Upgrade your plan" : "Change plan"}
          </h3>
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-3 py-1.5 text-sm transition ${
                billingInterval === "monthly"
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("yearly")}
              className={`px-3 py-1.5 text-sm transition ${
                billingInterval === "yearly"
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              Yearly <span className="ml-1 text-xs text-green-400">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.slug === currentPlan.slug;
            const price =
              billingInterval === "yearly" ? plan.price_yearly / 12 : plan.price_monthly;

            return (
              <div
                key={plan.slug}
                className={`rounded-xl border p-5 transition ${
                  isCurrent
                    ? "border-blue-500/50 bg-blue-500/5"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{plan.name}</h4>
                  {isCurrent && (
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {price === 0 ? (
                    "Free"
                  ) : (
                    <>
                      {formatCents(price)}
                      <span className="text-sm font-normal text-gray-400">/mo</span>
                    </>
                  )}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-gray-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    {plan.limits.emails_per_month.toLocaleString()} emails/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    {plan.limits.max_domains} domain
                    {plan.limits.max_domains !== 1 ? "s" : ""}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    {plan.limits.max_api_keys} API key
                    {plan.limits.max_api_keys !== 1 ? "s" : ""}
                  </li>
                  {plan.features.custom_tracking_domain && (
                    <li className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      Custom tracking domain
                    </li>
                  )}
                  {plan.features.dedicated_ip && (
                    <li className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      Dedicated IP
                    </li>
                  )}
                  {plan.features.priority_support && (
                    <li className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      Priority support
                    </li>
                  )}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.slug)}
                  disabled={isCurrent || upgrading}
                  className={`mt-4 w-full rounded-lg py-2 text-sm font-medium transition ${
                    isCurrent
                      ? "cursor-not-allowed bg-white/10 text-gray-500"
                      : "bg-blue-600 hover:bg-blue-500"
                  }`}
                >
                  {isCurrent ? (
                    "Current plan"
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      {plan.price_monthly > currentPlan.price_monthly ? "Upgrade" : "Downgrade"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise CTA */}
        <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-r from-purple-500/5 to-blue-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6 text-yellow-400" />
              <div>
                <h4 className="font-semibold">Enterprise</h4>
                <p className="text-sm text-gray-400">
                  Custom limits, dedicated IPs, SLA, SSO, and more
                </p>
              </div>
            </div>
            <a
              href="mailto:enterprise@oonrumail.com"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div className="mt-8">
        <h3 className="mb-4 font-semibold">Invoice history</h3>
        {invoices.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No invoices yet. Invoices will appear here after your first payment.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3">
                      {new Date(invoice.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {currentPlan.name} Plan -{" "}
                      {billingInterval === "yearly" ? "Annual" : "Monthly"}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCents(invoice.amount_due)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          invoice.status === "paid"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {invoice.invoice_pdf && (
                        <a
                          href={invoice.invoice_pdf}
                          className="text-blue-400 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overage info */}
      {currentPlan.overage_enabled && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
            <div>
              <h3 className="text-sm font-semibold">Overage pricing</h3>
              <p className="mt-1 text-sm text-gray-400">
                If you exceed your monthly email limit, additional emails are charged at{" "}
                <strong className="text-white">
                  {formatCents(currentPlan.overage_price_per_1000)} per 1,000 emails
                </strong>
                . Overage charges appear on your next invoice.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
