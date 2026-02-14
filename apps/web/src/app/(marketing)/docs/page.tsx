"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  Zap,
  Send,
  FileCode2,
  Webhook,
  Ban,
  BarChart3,
  Key,
  AlertTriangle,
  MessageSquare,
  Activity,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Terminal,
  Shield,
} from "lucide-react";

/* ─── Section IDs used for sidebar nav ─────────────────────────────────────── */

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  children?: { id: string; label: string }[];
}

const NAV: NavItem[] = [
  {
    id: "quickstart",
    label: "Quick Start",
    icon: Zap,
    children: [
      { id: "install", label: "Installation" },
      { id: "configuration", label: "Configuration" },
      { id: "first-email", label: "Send your first email" },
    ],
  },
  {
    id: "sending",
    label: "Sending Emails",
    icon: Send,
    children: [
      { id: "simple-send", label: "Simple send" },
      { id: "full-send", label: "Full options" },
      { id: "template-send", label: "Send with template" },
      { id: "batch-send", label: "Batch send" },
      { id: "scheduled-send", label: "Scheduled send" },
    ],
  },
  {
    id: "templates",
    label: "Templates",
    icon: FileCode2,
    children: [
      { id: "tpl-create", label: "Create" },
      { id: "tpl-list", label: "List & search" },
      { id: "tpl-render", label: "Render preview" },
      { id: "tpl-manage", label: "Update & delete" },
    ],
  },
  {
    id: "webhooks",
    label: "Webhooks",
    icon: Webhook,
    children: [
      { id: "wh-create", label: "Create endpoint" },
      { id: "wh-events", label: "Event types" },
      { id: "wh-verify", label: "Verify signatures" },
      { id: "wh-manage", label: "Test & rotate" },
    ],
  },
  {
    id: "suppressions",
    label: "Suppressions",
    icon: Ban,
    children: [
      { id: "sup-check", label: "Check address" },
      { id: "sup-add", label: "Add & bulk add" },
      { id: "sup-stats", label: "Stats" },
    ],
  },
  {
    id: "messages",
    label: "Messages & Events",
    icon: MessageSquare,
    children: [
      { id: "msg-list", label: "List messages" },
      { id: "msg-timeline", label: "Delivery timeline" },
      { id: "msg-events", label: "Raw events" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    children: [
      { id: "analytics-overview", label: "Overview stats" },
      { id: "analytics-ts", label: "Time series" },
      { id: "analytics-bounces", label: "Bounce analysis" },
      { id: "analytics-realtime", label: "Real-time" },
      { id: "analytics-reputation", label: "Reputation" },
    ],
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: Key,
    children: [
      { id: "key-create", label: "Create key" },
      { id: "key-scopes", label: "Scopes" },
      { id: "key-manage", label: "Rotate & revoke" },
    ],
  },
  {
    id: "errors",
    label: "Error Handling",
    icon: AlertTriangle,
  },
  {
    id: "types",
    label: "TypeScript Types",
    icon: Activity,
  },
];

/* ─── Code block with copy button ──────────────────────────────────────────── */

function CodeBlock({ code, lang = "ts", title }: { code: string; lang?: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-4 rounded-xl border border-white/10 bg-gray-950">
      {title && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
            <span className="ml-1 text-xs text-gray-500">{title}</span>
          </div>
          <span className="text-xs text-gray-600">{lang}</span>
        </div>
      )}
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-gray-300 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-gray-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

/* ─── Shell command block ──────────────────────────────────────────────────── */

function ShellBlock({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-4 flex items-center gap-3 rounded-lg border border-white/10 bg-gray-950 px-4 py-3">
      <Terminal className="h-4 w-4 shrink-0 text-gray-500" />
      <code className="flex-1 text-sm text-gray-300">{cmd}</code>
      <button
        onClick={handleCopy}
        className="rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-gray-300 group-hover:opacity-100"
        aria-label="Copy command"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

/* ─── Sidebar nav item ─────────────────────────────────────────────────────── */

function SidebarItem({ item, active }: { item: NavItem; active: string }) {
  const [open, setOpen] = useState(
    item.id === active || (item.children?.some((c) => c.id === active) ?? false)
  );
  const isActive = item.id === active || (item.children?.some((c) => c.id === active) ?? false);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (item.children) {
            setOpen(!open);
          } else {
            const el = document.getElementById(item.id);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
          isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
        }`}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.children &&
          (open ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
          ))}
      </button>
      {item.children && open && (
        <div className="ml-7 mt-1 space-y-0.5 border-l border-white/10 pl-3">
          {item.children.map((child) => (
            <a
              key={child.id}
              href={`#${child.id}`}
              className={`block rounded px-2 py-1.5 text-xs transition ${
                active === child.id ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {child.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Section heading ──────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  badge,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-white/5 pb-12 pt-10">
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Sub({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mt-8 scroll-mt-24">
      <h3 className="mb-3 text-lg font-semibold text-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-gray-400">{children}</p>;
}

/* ─── Main page ────────────────────────────────────────────────────────────── */

export default function DocsPage() {
  const [activeSection] = useState("quickstart");

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
            <Link href="/pricing" className="text-sm text-gray-400 transition hover:text-white">
              Pricing
            </Link>
            <Link href="/docs" className="text-sm font-medium text-white">
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

      <div className="mx-auto flex max-w-7xl gap-8 px-6">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-1 overflow-y-auto py-8 pr-4">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <BookOpen className="h-3.5 w-3.5" />
              Documentation
            </div>
            {NAV.map((item) => (
              <SidebarItem key={item.id} item={item} active={activeSection} />
            ))}
            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-gray-300">Need help?</p>
              <p className="mt-1 text-xs text-gray-500">
                Reach out at{" "}
                <a href="mailto:support@oonrumail.com" className="text-blue-400 hover:underline">
                  support@oonrumail.com
                </a>
              </p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-24">
          {/* Hero */}
          <div className="border-b border-white/5 pb-10 pt-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
              <Zap className="h-3 w-3" />
              @oonrumail/sdk v1.0
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Developer Documentation</h1>
            <p className="mt-3 max-w-2xl text-lg text-gray-400">
              Everything you need to integrate OonruMail into your application. TypeScript SDK with
              full type safety, zero dependencies, and automatic retries.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                <Shield className="h-3.5 w-3.5 text-green-400" />
                Node.js 18+
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                <Shield className="h-3.5 w-3.5 text-green-400" />
                Bun &amp; Deno
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                <Shield className="h-3.5 w-3.5 text-green-400" />
                Cloudflare Workers
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                <Shield className="h-3.5 w-3.5 text-green-400" />
                Zero dependencies
              </div>
            </div>
          </div>

          {/* ───────── Quick Start ───────── */}
          <Section id="quickstart" title="Quick Start" badge="Start here">
            <Sub id="install" title="Installation">
              <P>Install the SDK via your preferred package manager:</P>
              <ShellBlock cmd="npm install @oonrumail/sdk" />
              <ShellBlock cmd="pnpm add @oonrumail/sdk" />
              <ShellBlock cmd="yarn add @oonrumail/sdk" />
            </Sub>

            <Sub id="configuration" title="Configuration">
              <P>
                Create a client instance with your API key. You can get an API key from the{" "}
                <Link href="/console/api-keys" className="text-blue-400 hover:underline">
                  Console → API Keys
                </Link>
                .
              </P>
              <CodeBlock
                title="config.ts"
                code={`import { OonruMail } from "@oonrumail/sdk";

const mail = new OonruMail({
  apiKey: "em_live_...",             // Required — your API key
  baseUrl: "https://api.oonrumail.com",  // Default
  timeout: 30000,                    // Request timeout (ms)
  maxRetries: 3,                     // Retries on 5xx / 429
});`}
              />
              <P>
                The SDK automatically retries failed requests with exponential backoff on 5xx server
                errors and 429 rate limit responses.
              </P>
            </Sub>

            <Sub id="first-email" title="Send your first email">
              <P>With the client configured, sending an email is just a few lines:</P>
              <CodeBlock
                title="send.ts"
                code={`import { OonruMail } from "@oonrumail/sdk";

const mail = new OonruMail({
  apiKey: process.env.OONRUMAIL_API_KEY,
});

const result = await mail.send({
  from: "noreply@myapp.com",
  to: ["user@example.com"],
  subject: "Welcome!",
  html: "<h1>Welcome aboard</h1>",
});

console.log(result.message_id);  // "msg-abc123"`}
              />
            </Sub>
          </Section>

          {/* ───────── Sending Emails ───────── */}
          <Section id="sending" title="Sending Emails">
            <Sub id="simple-send" title="Simple send">
              <P>
                Use{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">
                  sendSimple()
                </code>{" "}
                for a minimal API with fewer required fields:
              </P>
              <CodeBlock
                code={`await mail.sendSimple({
  from: "noreply@myapp.com",
  to: "user@example.com",     // single string or array
  subject: "Hello",
  html: "<p>Hello world</p>",
});`}
              />
            </Sub>

            <Sub id="full-send" title="Full options">
              <P>
                The{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">
                  send()
                </code>{" "}
                method accepts all email options including CC, BCC, reply-to, categories, custom
                arguments, tracking, and attachments:
              </P>
              <CodeBlock
                title="full-send.ts"
                code={`await mail.send({
  from: "noreply@myapp.com",
  to: ["user@example.com"],
  cc: ["cc@example.com"],
  bcc: ["bcc@example.com"],
  reply_to: "support@myapp.com",
  subject: "Order Confirmed",
  html: "<h1>Order #123</h1>",
  text: "Order #123 confirmed",      // plain text fallback
  categories: ["orders"],
  custom_args: { order_id: "123" },
  track_opens: true,
  track_clicks: true,
  attachments: [
    {
      filename: "invoice.pdf",
      content: btoa("..."),           // base64 encoded
      content_type: "application/pdf",
    },
  ],
});`}
              />
            </Sub>

            <Sub id="template-send" title="Send with template">
              <P>
                Send using a pre-built template with variable substitutions. Create templates in the{" "}
                <Link href="/console/templates" className="text-blue-400 hover:underline">
                  Console → Templates
                </Link>{" "}
                or via the SDK.
              </P>
              <CodeBlock
                code={`await mail.sendWithTemplate({
  from: "noreply@myapp.com",
  to: "user@example.com",
  template_id: "tpl-welcome-v2",
  substitutions: {
    name: "Alice",
    company: "Acme",
  },
});`}
              />
            </Sub>

            <Sub id="batch-send" title="Batch send">
              <P>
                Send up to 1,000 emails in a single API call. Each message can have different
                recipients, subjects, and content:
              </P>
              <CodeBlock
                code={`const result = await mail.sendBatch({
  messages: [
    { from: "noreply@app.com", to: ["a@b.com"], subject: "Hi A", html: "..." },
    { from: "noreply@app.com", to: ["c@d.com"], subject: "Hi C", html: "..." },
  ],
});

console.log(\`Queued: \${result.total_queued}\`);`}
              />
            </Sub>

            <Sub id="scheduled-send" title="Scheduled send">
              <P>
                Schedule emails for future delivery by including the{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">
                  send_at
                </code>{" "}
                field with an ISO 8601 timestamp:
              </P>
              <CodeBlock
                code={`await mail.send({
  from: "noreply@app.com",
  to: ["user@example.com"],
  subject: "Reminder",
  html: "<p>Don't forget!</p>",
  send_at: "2026-03-01T09:00:00Z",
});`}
              />
            </Sub>
          </Section>

          {/* ───────── Templates ───────── */}
          <Section id="templates" title="Templates">
            <P>
              Create reusable email templates with{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">
                {"{{variable}}"}
              </code>{" "}
              substitutions. Manage templates via the SDK or the{" "}
              <Link href="/console/templates" className="text-blue-400 hover:underline">
                Console
              </Link>
              .
            </P>

            <Sub id="tpl-create" title="Create a template">
              <CodeBlock
                code={`const tpl = await mail.templates.create({
  name: "Welcome Email",
  subject: "Welcome {{name}}!",
  html_content: "<h1>Hi {{name}}</h1><p>Welcome to {{company}}.</p>",
  variables: [
    { name: "name", type: "string", required: true },
    { name: "company", type: "string", default_value: "OonruMail" },
  ],
  category: "onboarding",
  tags: ["welcome", "new-user"],
});`}
              />
            </Sub>

            <Sub id="tpl-list" title="List &amp; search">
              <CodeBlock
                code={`// List all templates in a category
const { templates } = await mail.templates.list({
  category: "onboarding",
});

// Clone an existing template
const copy = await mail.templates.clone(tpl.id, {
  name: "Welcome v2",
});`}
              />
            </Sub>

            <Sub id="tpl-render" title="Render preview">
              <P>Preview a template with substitutions without sending an email:</P>
              <CodeBlock
                code={`const rendered = await mail.templates.render(tpl.id, {
  name: "Alice",
});

console.log(rendered.html);     // "<h1>Hi Alice</h1>..."
console.log(rendered.subject);  // "Welcome Alice!"`}
              />
            </Sub>

            <Sub id="tpl-manage" title="Update &amp; delete">
              <CodeBlock
                code={`// Update
await mail.templates.update(tpl.id, {
  subject: "Hey {{name}}!",
});

// Delete
await mail.templates.delete(tpl.id);`}
              />
            </Sub>
          </Section>

          {/* ───────── Webhooks ───────── */}
          <Section id="webhooks" title="Webhooks">
            <P>
              Receive real-time notifications when email events occur. Configure endpoints in the{" "}
              <Link href="/console/webhooks" className="text-blue-400 hover:underline">
                Console
              </Link>{" "}
              or via the SDK.
            </P>

            <Sub id="wh-create" title="Create an endpoint">
              <P>The signing secret is only returned on creation — save it securely.</P>
              <CodeBlock
                code={`const wh = await mail.webhooks.create({
  url: "https://myapp.com/hooks/email",
  events: ["delivered", "bounced", "opened", "clicked"],
  description: "Production webhook",
});

console.log(wh.secret);  // Save this!`}
              />
            </Sub>

            <Sub id="wh-events" title="Event types">
              <P>OonruMail can send the following webhook events:</P>
              <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { name: "delivered", desc: "Email accepted by recipient server" },
                  { name: "bounced", desc: "Delivery failed (hard or soft)" },
                  { name: "deferred", desc: "Temporarily delayed, will retry" },
                  { name: "dropped", desc: "Not sent (suppression or policy)" },
                  { name: "opened", desc: "Recipient opened the email" },
                  { name: "clicked", desc: "Recipient clicked a link" },
                  { name: "spam_report", desc: "Marked as spam" },
                  { name: "unsubscribed", desc: "Recipient unsubscribed" },
                  { name: "processed", desc: "Email accepted for delivery" },
                ].map((evt) => (
                  <div
                    key={evt.name}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <code className="text-xs font-medium text-blue-400">{evt.name}</code>
                    <p className="mt-0.5 text-xs text-gray-500">{evt.desc}</p>
                  </div>
                ))}
              </div>
            </Sub>

            <Sub id="wh-verify" title="Verify webhook signatures">
              <P>
                All webhook payloads are signed with HMAC-SHA256. Always verify the signature before
                processing:
              </P>
              <CodeBlock
                title="webhook-handler.ts"
                code={`import { OonruMail } from "@oonrumail/sdk";

// In your Express / Next.js / Fastify handler:
const isValid = await OonruMail.verifyWebhookSignature(
  rawBody,
  request.headers["x-webhook-signature"],
  process.env.WEBHOOK_SECRET
);

if (!isValid) {
  return new Response("Invalid signature", { status: 401 });
}

const payload = OonruMail.parseWebhookPayload(rawBody);

switch (payload.event) {
  case "delivered":
    console.log(\`Delivered to \${payload.recipient}\`);
    break;
  case "bounced":
    console.log(\`Bounced: \${payload.bounce_type} — \${payload.reason}\`);
    break;
}`}
              />
            </Sub>

            <Sub id="wh-manage" title="Test &amp; rotate">
              <P>Test your endpoint or rotate the signing secret at any time:</P>
              <CodeBlock
                code={`// Test endpoint
const test = await mail.webhooks.test(wh.id, "delivered");
console.log(test.success, test.latency_ms);

// Rotate signing secret
const { secret } = await mail.webhooks.rotateSecret(wh.id);

// View recent deliveries (filter for failures)
const { deliveries } = await mail.webhooks.listDeliveries(wh.id, {
  limit: 10,
  success: false,
});`}
              />
            </Sub>
          </Section>

          {/* ───────── Suppressions ───────── */}
          <Section id="suppressions" title="Suppressions">
            <P>
              The suppression list prevents sending to addresses that have bounced, unsubscribed, or
              been manually added. Manage your list via the{" "}
              <Link href="/console/suppressions" className="text-blue-400 hover:underline">
                Console
              </Link>{" "}
              or the SDK.
            </P>

            <Sub id="sup-check" title="Check an address">
              <P>Check whether addresses are suppressed before sending:</P>
              <CodeBlock
                code={`const check = await mail.suppressions.check(["user@example.com"]);

if (check.results["user@example.com"].suppressed) {
  console.log("Email is suppressed — skipping");
}`}
              />
            </Sub>

            <Sub id="sup-add" title="Add &amp; bulk add">
              <CodeBlock
                code={`// Add a single address
await mail.suppressions.create({
  email: "bad@example.com",
  reason: "manual",
  description: "User requested removal",
});

// Bulk add (up to 1,000)
const result = await mail.suppressions.bulkCreate({
  emails: ["a@bad.com", "b@bad.com"],
  reason: "invalid",
});

console.log(\`Added: \${result.added}\`);
console.log(\`Already existed: \${result.existing}\`);`}
              />
            </Sub>

            <Sub id="sup-stats" title="Suppression stats">
              <CodeBlock
                code={`const stats = await mail.suppressions.stats();
console.log(\`Total suppressed: \${stats.total}\`);`}
              />
            </Sub>
          </Section>

          {/* ───────── Messages & Events ───────── */}
          <Section id="messages" title="Messages &amp; Events">
            <Sub id="msg-list" title="List messages">
              <P>Query your sent messages with status filtering and pagination:</P>
              <CodeBlock
                code={`const { messages } = await mail.messages.list({
  status: "delivered",
  limit: 20,
});`}
              />
            </Sub>

            <Sub id="msg-timeline" title="Delivery timeline">
              <P>Get the full delivery timeline for a specific message:</P>
              <CodeBlock
                code={`const timeline = await mail.messages.timeline(messageId);

for (const event of timeline.events) {
  console.log(\`\${event.event_type} at \${event.timestamp}\`);
}`}
              />
            </Sub>

            <Sub id="msg-events" title="Raw events">
              <P>Query raw email events across all messages:</P>
              <CodeBlock
                code={`const events = await mail.events.list({
  event_type: "bounced",
  limit: 50,
});`}
              />
            </Sub>
          </Section>

          {/* ───────── Analytics ───────── */}
          <Section id="analytics" title="Analytics">
            <P>
              Access delivery stats, engagement metrics, and real-time data programmatically. Also
              available in the{" "}
              <Link href="/console/analytics" className="text-blue-400 hover:underline">
                Console → Analytics
              </Link>
              .
            </P>

            <Sub id="analytics-overview" title="Overview stats">
              <CodeBlock
                code={`const stats = await mail.analytics.overview({
  start_date: "2026-01-01",
  end_date: "2026-01-31",
});

console.log(\`Delivery rate: \${stats.delivery_rate}%\`);
console.log(\`Open rate: \${stats.open_rate}%\`);
console.log(\`Total sent: \${stats.total_sent}\`);`}
              />
            </Sub>

            <Sub id="analytics-ts" title="Time series">
              <P>Get time-bucketed stats for charts and dashboards:</P>
              <CodeBlock
                code={`const ts = await mail.analytics.timeseries({
  interval: "day",   // "hour" | "day" | "week" | "month"
});

for (const point of ts.data) {
  console.log(\`\${point.date}: \${point.sent} sent, \${point.delivered} delivered\`);
}`}
              />
            </Sub>

            <Sub id="analytics-bounces" title="Bounce analysis">
              <CodeBlock
                code={`const bounces = await mail.analytics.bounces();

console.log(\`Hard bounces: \${bounces.hard}\`);
console.log(\`Soft bounces: \${bounces.soft}\`);
console.log(\`Top reasons:\`, bounces.top_reasons);`}
              />
            </Sub>

            <Sub id="analytics-realtime" title="Real-time stats">
              <CodeBlock
                code={`const rt = await mail.analytics.realtime();

console.log(\`\${rt.sent_last_minute} emails/min\`);
console.log(\`\${rt.active_connections} active connections\`);`}
              />
            </Sub>

            <Sub id="analytics-reputation" title="Sender reputation">
              <CodeBlock
                code={`const rep = await mail.analytics.reputation();

console.log(\`Reputation score: \${rep.score}\`);
console.log(\`Status: \${rep.status}\`);  // "good" | "warning" | "critical"`}
              />
            </Sub>
          </Section>

          {/* ───────── API Keys ───────── */}
          <Section id="api-keys" title="API Keys" badge="Admin">
            <P>
              Manage API keys programmatically. Create keys with specific scopes and limits. Also
              available in the{" "}
              <Link href="/console/api-keys" className="text-blue-400 hover:underline">
                Console → API Keys
              </Link>
              .
            </P>

            <Sub id="key-create" title="Create a key">
              <P>The raw key value is only returned on creation — store it securely.</P>
              <CodeBlock
                code={`const { key, api_key } = await mail.apiKeys.create({
  domain_id: "domain-uuid",
  name: "Platform X Production",
  scopes: ["send", "read", "templates"],
  rate_limit: 500,     // requests per minute
  daily_limit: 10000,  // emails per day
});

console.log(\`Key: \${key}\`);  // Only shown once!`}
              />
            </Sub>

            <Sub id="key-scopes" title="Available scopes">
              <P>Each API key can be limited to specific operations:</P>
              <div className="my-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-4 py-2.5 text-left font-medium text-gray-300">Scope</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-300">Allows</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { scope: "send", desc: "Send emails and batch send" },
                      { scope: "read", desc: "Read messages, events, and activity" },
                      { scope: "templates", desc: "CRUD operations on templates" },
                      { scope: "webhooks", desc: "Manage webhook endpoints" },
                      { scope: "analytics", desc: "Access analytics and stats" },
                      { scope: "suppressions", desc: "Manage suppression lists" },
                      { scope: "admin", desc: "Full access (manage keys, domains)" },
                    ].map((s) => (
                      <tr key={s.scope}>
                        <td className="px-4 py-2">
                          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-400">
                            {s.scope}
                          </code>
                        </td>
                        <td className="px-4 py-2 text-gray-400">{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sub>

            <Sub id="key-manage" title="Rotate &amp; revoke">
              <CodeBlock
                code={`// Check usage over last 7 days
const usage = await mail.apiKeys.usage(api_key.id, 7);

// Rotate (revoke old key, create new one)
const rotated = await mail.apiKeys.rotate(api_key.id);
console.log(\`New key: \${rotated.key}\`);

// Revoke permanently
await mail.apiKeys.revoke(api_key.id);`}
              />
            </Sub>
          </Section>

          {/* ───────── Error Handling ───────── */}
          <Section id="errors" title="Error Handling">
            <P>
              The SDK throws typed errors with status codes, error codes, and retry information:
            </P>
            <CodeBlock
              title="error-handling.ts"
              code={`import {
  OonruMail,
  OonruMailError,
  OonruMailTimeoutError,
} from "@oonrumail/sdk";

try {
  await mail.send({ from: "bad", to: [], subject: "" });
} catch (e) {
  if (e instanceof OonruMailError) {
    console.log(e.status);    // 400
    console.log(e.code);      // "validation_error"
    console.log(e.message);   // "Invalid email address"
    console.log(e.retryable); // false (true for 429/5xx)
  }

  if (e instanceof OonruMailTimeoutError) {
    console.log("Request timed out");
  }
}`}
            />
            <P>
              The SDK automatically retries on 5xx server errors and 429 rate limit responses with
              exponential backoff. You can configure the number of retries via the{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">
                maxRetries
              </code>{" "}
              option.
            </P>
            <div className="my-4 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-4 py-2.5 text-left font-medium text-gray-300">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-300">Meaning</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-300">Retryable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { code: "400", desc: "Bad request — check your parameters", retry: "No" },
                    { code: "401", desc: "Invalid API key", retry: "No" },
                    { code: "403", desc: "Key lacks required scope", retry: "No" },
                    { code: "404", desc: "Resource not found", retry: "No" },
                    { code: "429", desc: "Rate limited — slow down", retry: "Yes" },
                    { code: "500", desc: "Server error", retry: "Yes" },
                    { code: "503", desc: "Service temporarily unavailable", retry: "Yes" },
                  ].map((s) => (
                    <tr key={s.code}>
                      <td className="px-4 py-2">
                        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-yellow-400">
                          {s.code}
                        </code>
                      </td>
                      <td className="px-4 py-2 text-gray-400">{s.desc}</td>
                      <td className="px-4 py-2">
                        <span className={s.retry === "Yes" ? "text-green-400" : "text-gray-600"}>
                          {s.retry}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ───────── TypeScript Types ───────── */}
          <Section id="types" title="TypeScript Types">
            <P>All types are exported for full type safety. Import what you need:</P>
            <CodeBlock
              title="types.ts"
              code={`import type {
  // Send
  SendRequest,
  SendResponse,
  BatchSendRequest,
  BatchSendResponse,
  SimpleSendRequest,
  TemplateSendRequest,

  // Templates
  Template,
  CreateTemplateRequest,
  TemplateVariable,

  // Webhooks
  Webhook,
  WebhookPayload,
  WebhookEventType,

  // Suppressions
  Suppression,
  SuppressionReason,

  // Analytics
  OverviewStats,
  TimeseriesPoint,

  // API Keys
  ApiKey,
  ApiKeyScope,

  // Config
  OonruMailConfig,
} from "@oonrumail/sdk";`}
            />
            <P>
              The SDK is written in TypeScript and ships with declaration files. You get full
              autocomplete and type checking in your editor with no additional setup.
            </P>
          </Section>
        </main>
      </div>
    </div>
  );
}
