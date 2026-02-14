"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Zap, Shield, BarChart3, Code2, ArrowRight, Mail } from "lucide-react";

const PLANS = [
  {
    slug: "free",
    name: "Free",
    description: "Get started with transactional email",
    monthlyPrice: 0,
    yearlyPrice: null,
    emailsPerMonth: 3_000,
    emailsPerDay: 100,
    domains: 1,
    apiKeys: 2,
    features: {
      "Transactional email API": true,
      "TypeScript / Node.js SDK": true,
      "Basic analytics": true,
      "Template editor": true,
      "Email activity logs (3 days)": true,
      "Community support": true,
      Webhooks: false,
      "Custom tracking domain": false,
      "Dedicated IP": false,
      "Email validation": false,
      "Priority support": false,
      "Inbound parse": false,
    },
    cta: "Get Started Free",
    popular: false,
  },
  {
    slug: "pro",
    name: "Pro",
    description: "For growing applications and startups",
    monthlyPrice: 20,
    yearlyPrice: 16,
    emailsPerMonth: 50_000,
    emailsPerDay: 2_000,
    domains: 5,
    apiKeys: 10,
    features: {
      "Transactional email API": true,
      "TypeScript / Node.js SDK": true,
      "Full analytics dashboard": true,
      "Template editor": true,
      "Email activity logs (30 days)": true,
      "Email support": true,
      "Webhooks (5 endpoints)": true,
      "Custom tracking domain": true,
      "Dedicated IP": false,
      "Email validation": true,
      "Priority support": false,
      "Inbound parse": false,
    },
    cta: "Start Pro Trial",
    popular: true,
  },
  {
    slug: "business",
    name: "Business",
    description: "For scaling businesses with high volume",
    monthlyPrice: 75,
    yearlyPrice: 60,
    emailsPerMonth: 200_000,
    emailsPerDay: 10_000,
    domains: 25,
    apiKeys: 50,
    features: {
      "Transactional email API": true,
      "TypeScript / Node.js SDK": true,
      "Full analytics dashboard": true,
      "Template editor": true,
      "Email activity logs (90 days)": true,
      "Priority email & chat support": true,
      "Webhooks (25 endpoints)": true,
      "Custom tracking domain": true,
      "Dedicated IP": true,
      "Email validation": true,
      "Priority support": true,
      "Inbound parse": true,
    },
    cta: "Start Business Trial",
    popular: false,
  },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold">OonruMail</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm text-gray-400 transition hover:text-white">
              Documentation
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-white">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-gray-400 transition hover:text-white">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
          <Zap className="h-3.5 w-3.5" />
          SendGrid alternative — built for developers
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Transactional email
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            that just works
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
          Reliable email delivery with a developer-first API. Send with our SDK in 3 lines of code.
          99.9% uptime. No credit card required for free tier.
        </p>

        {/* Billing toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? "text-white" : "text-gray-500"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              annual ? "bg-blue-600" : "bg-gray-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                annual ? "translate-x-5.5 left-0" : "left-0.5"
              }`}
            />
          </button>
          <span className={`text-sm ${annual ? "text-white" : "text-gray-500"}`}>
            Yearly
            <span className="ml-1.5 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
              Save 20%
            </span>
          </span>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const price =
              annual && plan.yearlyPrice !== null ? plan.yearlyPrice : plan.monthlyPrice;

            return (
              <div
                key={plan.slug}
                className={`relative rounded-2xl border p-8 ${
                  plan.popular
                    ? "border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold">
                    Most Popular
                  </div>
                )}

                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-gray-400">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  {price === 0 ? (
                    <span className="text-4xl font-bold">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">${price}</span>
                      <span className="text-gray-400">/mo</span>
                    </>
                  )}
                </div>

                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Mail className="h-4 w-4 text-blue-400" />
                    {formatNumber(plan.emailsPerMonth)} emails/month
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Shield className="h-4 w-4 text-blue-400" />
                    {plan.domains} {plan.domains === 1 ? "domain" : "domains"}
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Code2 className="h-4 w-4 text-blue-400" />
                    {plan.apiKeys} API keys
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                    {formatNumber(plan.emailsPerDay)} emails/day
                  </div>
                </div>

                <Link
                  href={plan.slug === "free" ? "/register" : `/register?plan=${plan.slug}`}
                  className={`mt-8 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    plan.popular
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <div className="mt-8 space-y-3 border-t border-white/10 pt-6">
                  {Object.entries(plan.features).map(([feature, included]) => (
                    <div key={feature} className="flex items-center gap-2.5 text-sm">
                      {included ? (
                        <Check className="h-4 w-4 shrink-0 text-green-400" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-gray-600" />
                      )}
                      <span className={included ? "text-gray-300" : "text-gray-600"}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise CTA */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h3 className="text-2xl font-bold">Enterprise</h3>
          <p className="mx-auto mt-2 max-w-xl text-gray-400">
            Need higher volume, dedicated infrastructure, SLA guarantees, or custom integrations?
            Let&apos;s talk.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <a
              href="mailto:enterprise@oonrumail.com"
              className="rounded-lg bg-white/10 px-6 py-3 text-sm font-semibold transition hover:bg-white/20"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Code example */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold">Send your first email in minutes</h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                Install our TypeScript SDK, grab your API key, and start sending. No SMTP
                configuration, no complex setup.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "npm install @oonrumail/sdk",
                  "Create an API key in the console",
                  "Send your first email with 3 lines of code",
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                      {i + 1}
                    </div>
                    <span className="text-sm text-gray-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-gray-950 p-6 font-mono text-sm leading-relaxed">
              <div className="mb-4 flex items-center gap-2 text-gray-500">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/50" />
                <span className="ml-2 text-xs">send-email.ts</span>
              </div>
              <pre className="overflow-x-auto text-gray-300">
                <code>{`import { OonruMail } from "@oonrumail/sdk";

const mail = new OonruMail({
  apiKey: process.env.OONRUMAIL_API_KEY,
});

await mail.send({
  from: "noreply@yourapp.com",
  to: ["user@example.com"],
  subject: "Welcome to YourApp!",
  html: "<h1>Welcome aboard 🎉</h1>",
});`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-purple-600">
              <Mail className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">OonruMail</span>
          </div>
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} OonruMail. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
