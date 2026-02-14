# @oonrumail/sdk

Official TypeScript SDK for the **OonruMail Transactional Email API**.

Zero dependencies. Works in Node.js 18+, Bun, Deno, Cloudflare Workers, and browsers.

## Install

```bash
npm install @oonrumail/sdk
# or
pnpm add @oonrumail/sdk
```

## Quick Start

```ts
import { OonruMail } from "@oonrumail/sdk";

const mail = new OonruMail({ apiKey: "em_live_..." });

// Send an email
const result = await mail.send({
  from: "noreply@myapp.com",
  to: ["user@example.com"],
  subject: "Welcome!",
  html: "<h1>Welcome aboard</h1>",
});

console.log(result.message_id); // "msg-abc123"
```

## Configuration

```ts
const mail = new OonruMail({
  apiKey: "em_live_...", // Required
  baseUrl: "https://api.oonrumail.com", // Default
  timeout: 30000, // Request timeout (ms)
  maxRetries: 3, // Retry on 5xx/429
});
```

## Sending Emails

### Simple send

```ts
await mail.sendSimple({
  from: "noreply@myapp.com",
  to: "user@example.com", // single string or array
  subject: "Hello",
  html: "<p>Hello world</p>",
});
```

### Full send with all options

```ts
await mail.send({
  from: "noreply@myapp.com",
  to: ["user@example.com"],
  cc: ["cc@example.com"],
  bcc: ["bcc@example.com"],
  reply_to: "support@myapp.com",
  subject: "Order Confirmed",
  html: "<h1>Order #123</h1>",
  text: "Order #123 confirmed",
  categories: ["orders"],
  custom_args: { order_id: "123" },
  track_opens: true,
  track_clicks: true,
  attachments: [
    {
      filename: "invoice.pdf",
      content: btoa("..."), // base64
      content_type: "application/pdf",
    },
  ],
});
```

### Send with a template

```ts
await mail.sendWithTemplate({
  from: "noreply@myapp.com",
  to: "user@example.com",
  template_id: "tpl-welcome-v2",
  substitutions: { name: "Alice", company: "Acme" },
});
```

### Batch send (up to 1000)

```ts
const result = await mail.sendBatch({
  messages: [
    { from: "noreply@app.com", to: ["a@b.com"], subject: "Hi A", html: "..." },
    { from: "noreply@app.com", to: ["c@d.com"], subject: "Hi C", html: "..." },
  ],
});
console.log(`Queued: ${result.total_queued}`);
```

### Scheduled send

```ts
await mail.send({
  from: "noreply@app.com",
  to: ["user@example.com"],
  subject: "Reminder",
  html: "<p>Don't forget!</p>",
  send_at: "2026-03-01T09:00:00Z",
});
```

## Templates

```ts
// Create
const tpl = await mail.templates.create({
  name: "Welcome Email",
  subject: "Welcome {{name}}!",
  html_content: "<h1>Hi {{name}}</h1><p>Welcome to {{company}}.</p>",
  variables: [
    { name: "name", type: "string", required: true },
    { name: "company", type: "string", default_value: "OonruMail" },
  ],
  category: "onboarding",
  tags: ["welcome", "new-user"],
});

// List
const { templates } = await mail.templates.list({ category: "onboarding" });

// Render (preview without sending)
const rendered = await mail.templates.render(tpl.id, { name: "Alice" });
console.log(rendered.html); // "<h1>Hi Alice</h1>..."

// Clone
const copy = await mail.templates.clone(tpl.id, { name: "Welcome v2" });

// Update
await mail.templates.update(tpl.id, { subject: "Hey {{name}}!" });

// Delete
await mail.templates.delete(tpl.id);
```

## Webhooks

```ts
// Create — secret is only returned on creation
const wh = await mail.webhooks.create({
  url: "https://myapp.com/hooks/email",
  events: ["delivered", "bounced", "opened", "clicked"],
  description: "Production webhook",
});
console.log(wh.secret); // Save this!

// Test
const test = await mail.webhooks.test(wh.id, "delivered");
console.log(test.success, test.latency_ms);

// Rotate secret
const { secret } = await mail.webhooks.rotateSecret(wh.id);

// View deliveries
const { deliveries } = await mail.webhooks.listDeliveries(wh.id, {
  limit: 10,
  success: false, // only failures
});
```

### Verifying webhook signatures

```ts
// In your Express/Next.js/Fastify handler:
import { OonruMail } from "@oonrumail/sdk";

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
    console.log(`Delivered to ${payload.recipient}`);
    break;
  case "bounced":
    console.log(`Bounced: ${payload.bounce_type} - ${payload.reason}`);
    break;
}
```

## Suppressions

```ts
// Check before sending
const check = await mail.suppressions.check(["user@example.com"]);
if (check.results["user@example.com"].suppressed) {
  console.log("Email is suppressed — skipping");
}

// Add manually
await mail.suppressions.create({
  email: "bad@example.com",
  reason: "manual",
  description: "User requested removal",
});

// Bulk add (up to 1000)
const result = await mail.suppressions.bulkCreate({
  emails: ["a@bad.com", "b@bad.com"],
  reason: "invalid",
});
console.log(`Added: ${result.added}, Already existed: ${result.existing}`);

// Stats
const stats = await mail.suppressions.stats();
console.log(`Total suppressed: ${stats.total}`);
```

## Messages & Events

```ts
// List recent messages
const { messages } = await mail.messages.list({
  status: "delivered",
  limit: 20,
});

// Get delivery timeline
const timeline = await mail.messages.timeline(messages[0].id);
for (const event of timeline.events) {
  console.log(`${event.event_type} at ${event.timestamp}`);
}

// List raw events
const events = await mail.events.list({ event_type: "bounced", limit: 50 });
```

## Analytics

```ts
// Overview stats
const stats = await mail.analytics.overview({
  start_date: "2026-01-01",
  end_date: "2026-01-31",
});
console.log(`Delivery rate: ${stats.delivery_rate}%`);

// Time series
const ts = await mail.analytics.timeseries({ interval: "day" });

// Bounce analysis
const bounces = await mail.analytics.bounces();

// Geographic distribution
const geo = await mail.analytics.geo({ limit: 10 });

// Real-time
const rt = await mail.analytics.realtime();
console.log(`${rt.sent_last_minute} emails/min`);

// Sender reputation
const rep = await mail.analytics.reputation();
console.log(`Reputation score: ${rep.score}`);
```

## API Keys (Admin)

```ts
// Create a key for a specific platform
const { key, api_key } = await mail.apiKeys.create({
  domain_id: "domain-uuid",
  name: "Platform X Production",
  scopes: ["send", "read", "templates"],
  rate_limit: 500, // per minute
  daily_limit: 10000,
});
console.log(`Key: ${key}`); // Only shown once!

// View usage
const usage = await mail.apiKeys.usage(api_key.id, 7);

// Rotate (revoke old, create new)
const rotated = await mail.apiKeys.rotate(api_key.id);

// Revoke
await mail.apiKeys.revoke(api_key.id);
```

## Error Handling

```ts
import { OonruMail, OonruMailError, OonruMailTimeoutError } from "@oonrumail/sdk";

try {
  await mail.send({ from: "bad", to: [], subject: "" });
} catch (e) {
  if (e instanceof OonruMailError) {
    console.log(e.status); // 400
    console.log(e.code); // "validation_error"
    console.log(e.message); // "Invalid email address"
    console.log(e.retryable); // false (true for 429/5xx)
  }
  if (e instanceof OonruMailTimeoutError) {
    console.log("Request timed out");
  }
}
```

The SDK automatically retries on 5xx errors and 429 (rate limited) with exponential backoff.

## TypeScript

All types are exported for full type safety:

```ts
import type {
  SendRequest,
  SendResponse,
  Template,
  Webhook,
  WebhookPayload,
  WebhookEventType,
  Suppression,
  OverviewStats,
  ApiKey,
} from "@oonrumail/sdk";
```

## License

MIT
