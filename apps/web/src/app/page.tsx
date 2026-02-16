import Link from "next/link";
import {
  Mail,
  Shield,
  Globe,
  Zap,
  Code2,
  BarChart3,
  ArrowRight,
  Check,
  Webhook,
  FileCode2,
  Activity,
  ShieldCheck,
  Ban,
  Key,
  BookOpen,
  Terminal,
  Clock,
  Users,
  Settings,
  CreditCard,
  Inbox,
  Send,
  Paperclip,
  Search,
  Star,
  FolderOpen,
  MessageSquare,
} from "lucide-react";

// ============================================================
// REGULAR EMAIL FEATURES
// ============================================================

const EMAIL_FEATURES = [
  {
    icon: Inbox,
    title: "Multi-Domain Inbox",
    description:
      "Manage all your email accounts in one unified inbox. Filter by domain, search across accounts, and switch seamlessly between personal and team mailboxes.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    icon: Send,
    title: "Compose & Send",
    description:
      "Rich text editor with formatting, attachments, signatures, and domain branding. Reply, forward, schedule sends, and undo sent emails with one click.",
    color: "from-purple-500 to-pink-400",
  },
  {
    icon: Users,
    title: "Team Accounts",
    description:
      "Create user accounts for your team with role-based access. Admins, domain managers, and users — each with the right level of control over shared mailboxes.",
    color: "from-green-500 to-emerald-400",
  },
  {
    icon: FolderOpen,
    title: "Folders & Organization",
    description:
      "Inbox, Sent, Drafts, Starred, Archive, Trash, and custom folders. Drag-and-drop emails between folders, snooze messages, and keep everything organized.",
    color: "from-orange-500 to-amber-400",
  },
  {
    icon: Search,
    title: "Advanced Search",
    description:
      "Find any email instantly with full-text search, operator filters (from:, to:, subject:, has:attachment), and recent search suggestions.",
    color: "from-red-500 to-rose-400",
  },
  {
    icon: Globe,
    title: "Multi-Domain Management",
    description:
      "Add and verify multiple domains with automated DKIM, SPF, and DMARC configuration. DNS records generated and validated in real time.",
    color: "from-indigo-500 to-violet-400",
  },
];

// ============================================================
// TRANSACTIONAL EMAIL FEATURES
// ============================================================

const TRANSACTIONAL_FEATURES = [
  {
    icon: Zap,
    title: "Transactional Email API",
    description:
      "RESTful API for sending transactional emails — password resets, order confirmations, notifications. Reliable delivery with automatic retries and bounce handling.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    icon: Code2,
    title: "TypeScript SDK",
    description:
      "First-class TypeScript SDK with full type safety. Install with npm, send your first email in 3 lines of code. Zero dependencies, tree-shakeable.",
    color: "from-purple-500 to-pink-400",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description:
      "Track delivery rates, open rates, click-through rates, and bounces. Visual dashboards with time-range filtering and exportable reports.",
    color: "from-orange-500 to-amber-400",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description:
      "Get real-time notifications for email events — delivered, opened, clicked, bounced, complained. HMAC-signed payloads with retry logic.",
    color: "from-indigo-500 to-violet-400",
  },
  {
    icon: FileCode2,
    title: "Template Editor",
    description:
      "Create and manage reusable HTML email templates with variable substitution. Live preview, automatic variable detection, and SDK integration.",
    color: "from-teal-500 to-cyan-400",
  },
  {
    icon: Ban,
    title: "Suppression Management",
    description:
      "Automatic suppression of bounced addresses and complaints. Add addresses manually or in bulk. CSV export for compliance audits.",
    color: "from-yellow-500 to-orange-400",
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "<1s", label: "Avg. delivery" },
  { value: "200K+", label: "Emails / month" },
  { value: "25+", label: "Domains / account" },
];

const CONSOLE_FEATURES = [
  { icon: BarChart3, label: "Analytics dashboard" },
  { icon: Activity, label: "Real-time activity log" },
  { icon: Globe, label: "Domain management" },
  { icon: Key, label: "API key management" },
  { icon: FileCode2, label: "Template editor" },
  { icon: Webhook, label: "Webhook configuration" },
  { icon: Ban, label: "Suppression lists" },
  { icon: CreditCard, label: "Billing & usage" },
  { icon: Settings, label: "Organization settings" },
  { icon: Users, label: "Team management" },
];

export default function HomePage() {
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
          <div className="hidden items-center gap-6 sm:flex">
            <Link href="/pricing" className="text-sm text-gray-400 transition hover:text-white">
              Pricing
            </Link>
            <Link href="/docs" className="text-sm text-gray-400 transition hover:text-white">
              Docs
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

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute left-1/4 top-32 h-[400px] w-[400px] rounded-full bg-purple-600/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-24 text-center sm:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
            <Zap className="h-3.5 w-3.5" />
            Complete email platform — Regular mail + Transactional API
          </div>

          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Your email, your way.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Inbox + API in one platform
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400 sm:text-xl">
            OonruMail is a full email platform for teams and developers. Send and receive regular
            email with a modern inbox, create team accounts with role-based access, and power your
            apps with a transactional email API and TypeScript SDK.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold transition hover:bg-blue-500"
            >
              Start For Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-semibold transition hover:bg-white/10"
            >
              API Documentation
            </Link>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Full inbox + Transactional API · 3,000 emails/month free · No credit card required
          </p>

          {/* Stats row */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-8 border-t border-white/10 pt-10 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400">
                <Terminal className="h-3 w-3" />
                Developer Experience
              </div>
              <h2 className="text-3xl font-bold sm:text-4xl">
                Send your first email
                <br />
                <span className="text-gray-400">in under a minute</span>
              </h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                Install our zero-dependency TypeScript SDK, create an API key in the console, and
                start sending. No SMTP configuration, no complex setup, no vendor lock-in.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  { step: "Install the SDK", cmd: "npm install @oonrumail/sdk" },
                  { step: "Create an API key", cmd: "Console → API Keys → Create" },
                  { step: "Send emails", cmd: "3 lines of TypeScript" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.step}</div>
                      <div className="font-mono text-xs text-gray-500">{item.cmd}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                Get your API key
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-gray-950 p-6 font-mono text-sm leading-relaxed">
              <div className="mb-4 flex items-center gap-2 text-gray-500">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/50" />
                <span className="ml-2 text-xs">send-email.ts</span>
              </div>
              <pre className="overflow-x-auto text-gray-300">
                <code>
                  <span className="text-purple-400">import</span>
                  {" { OonruMail } "}
                  <span className="text-purple-400">from</span>
                  {' "'}
                  <span className="text-green-400">@oonrumail/sdk</span>
                  {'"\n\n'}
                  <span className="text-purple-400">const</span>
                  {" mail = "}
                  <span className="text-purple-400">new</span>{" "}
                  <span className="text-blue-400">OonruMail</span>
                  {"({\n"}
                  {"  apiKey: process.env."}
                  <span className="text-cyan-400">OONRUMAIL_API_KEY</span>
                  {",\n})\n\n"}
                  <span className="text-purple-400">await</span>
                  {" mail."}
                  <span className="text-blue-400">send</span>
                  {"({\n"}
                  {"  from: "}
                  <span className="text-green-400">&quot;noreply@yourapp.com&quot;</span>
                  {",\n"}
                  {"  to: ["}
                  <span className="text-green-400">&quot;user@example.com&quot;</span>
                  {"],\n"}
                  {"  subject: "}
                  <span className="text-green-400">&quot;Welcome to YourApp!&quot;</span>
                  {",\n"}
                  {"  html: "}
                  <span className="text-green-400">{'"<h1>Welcome aboard 🎉</h1>"'}</span>
                  {",\n})"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Regular Email Features */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            <Inbox className="h-3 w-3" />
            Full email client
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl">
            A modern inbox
            <br />
            <span className="text-gray-400">for your team</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-400">
            Send and receive regular email across multiple domains. Create team accounts with shared
            mailboxes, custom folders, and role-based access control.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {EMAIL_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div
                className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${feature.color} bg-opacity-20`}
              >
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Inbox Preview Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-8 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
                <Mail className="h-3 w-3" />
                Multi-domain inbox
              </div>
              <h2 className="text-3xl font-bold sm:text-4xl">
                All your accounts,
                <br />
                <span className="text-gray-400">one powerful inbox</span>
              </h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                Switch between domains or view everything in a unified inbox. Preview emails without
                leaving your list, drag-and-drop to organize, and compose with rich formatting and
                signatures.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {[
                  { icon: Inbox, label: "Unified inbox view" },
                  { icon: Star, label: "Star & organize" },
                  { icon: Search, label: "Full-text search" },
                  { icon: FolderOpen, label: "Custom folders" },
                  { icon: Paperclip, label: "File attachments" },
                  { icon: Users, label: "Shared mailboxes" },
                  { icon: MessageSquare, label: "Thread grouping" },
                  { icon: Clock, label: "Undo send & snooze" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="text-sm text-gray-300">{item.label}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                Try the inbox
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Inbox mock preview */}
            <div className="rounded-xl border border-white/10 bg-gray-950 p-1">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
                <span className="ml-2 text-xs text-gray-600">mail.oonrumail.com/mail/inbox</span>
              </div>
              <div className="flex">
                {/* Mini sidebar */}
                <div className="w-36 border-r border-white/10 p-3">
                  <div className="mb-3 rounded-md bg-blue-600 px-3 py-1.5 text-center text-xs font-medium">
                    Compose
                  </div>
                  {[
                    { name: "Inbox", count: 12, active: true },
                    { name: "Starred", count: 3, active: false },
                    { name: "Sent", count: 0, active: false },
                    { name: "Drafts", count: 1, active: false },
                  ].map((folder) => (
                    <div
                      key={folder.name}
                      className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                        folder.active ? "bg-blue-500/20 text-blue-400" : "text-gray-500"
                      }`}
                    >
                      <span>{folder.name}</span>
                      {folder.count > 0 && <span className="text-[10px]">{folder.count}</span>}
                    </div>
                  ))}
                  <div className="mt-3 border-t border-white/10 pt-2 text-[10px] font-semibold uppercase text-gray-600">
                    acme.com
                  </div>
                  <div className="mt-1 rounded px-2 py-1 text-xs text-gray-500">Inbox</div>
                  <div className="rounded px-2 py-1 text-xs text-gray-500">Sent</div>
                </div>
                {/* Email list */}
                <div className="flex-1 p-3">
                  {[
                    {
                      from: "Sarah Chen",
                      subject: "Q4 Report ready for review",
                      time: "10:23 AM",
                      unread: true,
                    },
                    {
                      from: "GitHub",
                      subject: "New PR: feat/auth-refactor #127",
                      time: "9:45 AM",
                      unread: true,
                    },
                    {
                      from: "David Kim",
                      subject: "Re: Meeting notes from Friday",
                      time: "Yesterday",
                      unread: false,
                    },
                    {
                      from: "AWS",
                      subject: "Your invoice for December 2024",
                      time: "Yesterday",
                      unread: false,
                    },
                    {
                      from: "Jira",
                      subject: "[PROJ-452] Bug fix deployed to staging",
                      time: "Mon",
                      unread: false,
                    },
                  ].map((email, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 border-b border-white/5 px-2 py-2 text-xs ${
                        email.unread ? "text-white" : "text-gray-500"
                      }`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${email.unread ? "bg-blue-400" : "bg-transparent"}`}
                      />
                      <span className={`w-20 truncate ${email.unread ? "font-semibold" : ""}`}>
                        {email.from}
                      </span>
                      <span className="flex-1 truncate">{email.subject}</span>
                      <span className="shrink-0 text-gray-600">{email.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transactional Email Features */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
            <Shield className="h-3 w-3" />
            Transactional email API
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl">
            Developer-first
            <br />
            <span className="text-gray-400">transactional email</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-400">
            Power your application with a reliable transactional email API. Send password resets,
            order confirmations, and notifications with our TypeScript SDK and RESTful API.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TRANSACTIONAL_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div
                className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${feature.color} bg-opacity-20`}
              >
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* API Console Preview Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-8 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
                <Settings className="h-3 w-3" />
                API Console
              </div>
              <h2 className="text-3xl font-bold sm:text-4xl">
                Full control from
                <br />
                <span className="text-gray-400">a single dashboard</span>
              </h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                Manage every aspect of your email infrastructure from the OonruMail console. Monitor
                transactional email delivery, manage API keys, configure webhooks, and track
                analytics — all in one place.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {CONSOLE_FEATURES.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="text-sm text-gray-300">{item.label}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/console"
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                Open the console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Console mock preview */}
            <div className="rounded-xl border border-white/10 bg-gray-950 p-1">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
                <span className="ml-2 text-xs text-gray-600">mail.oonrumail.com/console</span>
              </div>
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">Dashboard</span>
                  <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                    Free Plan
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-gray-500">Sent today</div>
                    <div className="mt-1 text-lg font-bold">1,247</div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div className="h-full w-1/3 rounded-full bg-blue-500" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-gray-500">Delivery rate</div>
                    <div className="mt-1 text-lg font-bold text-green-400">99.2%</div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div className="h-full w-[99%] rounded-full bg-green-500" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-gray-500">Open rate</div>
                    <div className="mt-1 text-lg font-bold">38.5%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-gray-500">Domains</div>
                    <div className="mt-1 text-lg font-bold">3</div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {["delivered", "opened", "clicked", "delivered", "bounced"].map((event, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${
                            event === "delivered"
                              ? "bg-green-400"
                              : event === "opened"
                                ? "bg-blue-400"
                                : event === "clicked"
                                  ? "bg-purple-400"
                                  : "bg-red-400"
                          }`}
                        />
                        <span className="text-gray-400">{event}</span>
                      </div>
                      <span className="text-gray-600">user{i + 1}@example.com</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Reliability Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-400">
            <ShieldCheck className="h-3 w-3" />
            Enterprise ready
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl">
            Built for security
            <br />
            <span className="text-gray-400">and reliability</span>
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "DKIM / SPF / DMARC",
              desc: "Automatic DNS record generation and validation for every sending domain",
            },
            {
              icon: Key,
              title: "Scoped API Keys",
              desc: "Fine-grained permissions per key — send, read, templates, webhooks, analytics",
            },
            {
              icon: Clock,
              title: "Audit Logging",
              desc: "Complete activity history for compliance. Track every action, every user",
            },
            {
              icon: Shield,
              title: "Webhook Signing",
              desc: "HMAC-SHA256 signed webhook payloads so you can verify every notification",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <item.icon className="mb-3 h-6 w-6 text-yellow-400" />
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SDK / Developer Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 lg:p-12">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">
              Built for developers,
              <span className="text-gray-400"> loved by teams</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-400">
              Everything you need from an email API — with the TypeScript SDK that makes integration
              effortless.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Code2,
                title: "Full Type Safety",
                desc: "Every request and response is fully typed. Autocomplete-driven development.",
              },
              {
                icon: BookOpen,
                title: "Comprehensive Docs",
                desc: "API reference, guides, examples, and SDK docs. Get answers fast.",
              },
              {
                icon: Terminal,
                title: "Zero Dependencies",
                desc: "Lightweight SDK with no external dependencies. Works in Node.js and edge runtimes.",
              },
              {
                icon: Webhook,
                title: "Webhook Events",
                desc: "7 event types: sent, delivered, bounced, opened, clicked, complained, unsubscribed.",
              },
              {
                icon: FileCode2,
                title: "Template Variables",
                desc: "Use {{variable}} syntax in templates. Detect variables automatically from HTML.",
              },
              {
                icon: BarChart3,
                title: "Analytics API",
                desc: "Query delivery stats, engagement metrics, and bounce details programmatically.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                <div>
                  <h4 className="font-medium">{item.title}</h4>
                  <p className="mt-1 text-sm text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-600/10 to-purple-600/10 p-8 text-center lg:p-12">
          <h2 className="text-3xl font-bold sm:text-4xl">Simple, transparent pricing</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-400">
            Start free with 3,000 emails per month. Upgrade as you grow. No hidden fees, no
            per-email charges on paid plans within your limit.
          </p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-4">
            {[
              { name: "Free", price: "$0", emails: "3K/mo" },
              { name: "Pro", price: "$20", emails: "50K/mo" },
              { name: "Business", price: "$75", emails: "200K/mo" },
              { name: "Enterprise", price: "Custom", emails: "Unlimited" },
            ].map((plan) => (
              <div key={plan.name} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium text-gray-400">{plan.name}</div>
                <div className="mt-1 text-2xl font-bold">{plan.price}</div>
                <div className="mt-1 text-xs text-gray-500">{plan.emails}</div>
              </div>
            ))}
          </div>
          <Link
            href="/pricing"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold transition hover:bg-blue-500"
          >
            Compare Plans
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Ready to get started?</h2>
          <p className="mx-auto mt-4 max-w-lg text-gray-400">
            Create your free account to get a full email inbox and start sending transactional
            emails through our API — all in under 5 minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold transition hover:bg-blue-500"
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-semibold transition hover:bg-white/10"
            >
              Read the Docs
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-400" />
              No credit card required
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-400" />
              Full inbox included
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-400" />
              3,000 transactional emails free
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                  <Mail className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold">OonruMail</span>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                Complete email platform — regular mail and transactional API for teams and
                developers.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-300">Product</h4>
              <div className="space-y-2">
                <Link
                  href="/register"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Email Inbox
                </Link>
                <Link
                  href="/pricing"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Pricing
                </Link>
                <Link
                  href="/console"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  API Console
                </Link>
                <Link
                  href="/docs"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Documentation
                </Link>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-300">Developers</h4>
              <div className="space-y-2">
                <Link
                  href="/docs/api"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  API Reference
                </Link>
                <Link
                  href="/docs"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  SDK Guide
                </Link>
                <Link
                  href="/docs"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Webhooks
                </Link>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-300">Company</h4>
              <div className="space-y-2">
                <Link
                  href="/privacy"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Terms of Service
                </Link>
                <a
                  href="mailto:support@oonrumail.com"
                  className="block text-sm text-gray-500 transition hover:text-gray-300"
                >
                  Contact
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 text-center text-sm text-gray-600">
            © {new Date().getFullYear()} OonruMail. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
