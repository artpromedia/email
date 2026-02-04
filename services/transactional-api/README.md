# Transactional Email API Service

A SendGrid-compatible transactional email API for the OONRUMAIL platform.

## Features

- **RESTful API** - Simple JSON API for sending transactional emails
- **API Key Authentication** - Secure API key management with scopes
- **Email Templates** - Template management with variable substitution and versioning
- **Webhooks** - Real-time delivery notifications (delivered, bounced, opened, clicked)
- **Suppression Management** - Handle bounces, unsubscribes, and spam reports
- **Analytics** - Delivery stats, engagement metrics, and bounce analysis
- **Batch Sending** - Send up to 1000 emails per request
- **Scheduled Delivery** - Queue emails for future delivery
- **Open/Click Tracking** - Automatic tracking pixel and link rewriting

## Quick Start

```bash
# Start the service
docker-compose up transactional-api

# Or run directly
go run main.go -config config.yaml
```

## API Reference

### Authentication

All API requests require an API key in the `X-API-Key` header or as a Bearer token:

```bash
curl -H "X-API-Key: em_your_api_key" https://api.yourdomain.com/v1/send
# or
curl -H "Authorization: Bearer em_your_api_key" https://api.yourdomain.com/v1/send
```

### Send Email

```bash
POST /v1/send
Content-Type: application/json

{
  "from": {"email": "sender@yourdomain.com", "name": "Your App"},
  "to": [{"email": "recipient@example.com", "name": "John Doe"}],
  "subject": "Welcome to our service!",
  "html_body": "<h1>Hello {{name}}!</h1><p>Welcome aboard.</p>",
  "text_body": "Hello {{name}}! Welcome aboard.",
  "template_data": {"name": "John"},
  "tags": ["welcome", "onboarding"],
  "track_opens": true,
  "track_clicks": true
}
```

### Batch Send

```bash
POST /v1/send/batch
Content-Type: application/json

{
  "messages": [
    {"from": {"email": "..."}, "to": [...], "subject": "...", ...},
    {"from": {"email": "..."}, "to": [...], "subject": "...", ...}
  ]
}
```

### Templates

```bash
# List templates
GET /v1/templates

# Create template
POST /v1/templates
{
  "name": "welcome",
  "subject": "Welcome {{name}}!",
  "html_body": "<h1>Welcome {{name}}!</h1>",
  "text_body": "Welcome {{name}}!"
}

# Get template
GET /v1/templates/{id}

# Update template
PUT /v1/templates/{id}

# Delete template
DELETE /v1/templates/{id}

# Template versions
GET /v1/templates/{id}/versions
POST /v1/templates/{id}/versions
```

### Webhooks

```bash
# List webhooks
GET /v1/webhooks

# Create webhook
POST /v1/webhooks
{
  "url": "https://your-app.com/webhook",
  "events": ["delivered", "bounced", "opened", "clicked"]
}

# Test webhook
POST /v1/webhooks/{id}/test
```

### Analytics

```bash
# Overview stats
GET /v1/analytics/overview?from=2026-01-01&to=2026-01-31

# Delivery stats
GET /v1/analytics/delivery?interval=day

# Engagement stats
GET /v1/analytics/engagement

# Bounce analysis
GET /v1/analytics/bounces
```

### Suppressions

```bash
# List bounces
GET /v1/suppressions/bounces

# Remove from bounce list
DELETE /v1/suppressions/bounces/{email}

# List unsubscribes
GET /v1/suppressions/unsubscribes

# Add to unsubscribe list
POST /v1/suppressions/unsubscribes
{"email": "user@example.com", "reason": "User requested"}

# List spam reports
GET /v1/suppressions/spam-reports
```

### Events

```bash
# List events
GET /v1/events?event_type=delivered&from=2026-01-01

# Get events for a message
GET /v1/events/{message_id}
```

## Webhook Events

When a webhook is triggered, you'll receive a POST request with:

```json
{
  "event": "delivered",
  "timestamp": "2026-01-31T12:00:00Z",
  "message_id": "uuid",
  "recipient": "user@example.com",
  "data": {
    "event_id": "uuid",
    "ip_address": "1.2.3.4"
  }
}
```

Headers include:

- `X-Webhook-ID`: The webhook UUID
- `X-Webhook-Timestamp`: Unix timestamp
- `X-Webhook-Signature`: HMAC-SHA256 signature for verification

### Signature Verification

```javascript
const crypto = require("crypto");

function verifyWebhookSignature(payload, signature, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

## Rate Limits

Default rate limits per API key:

- 100 requests/second
- 1,000 requests/minute
- 10,000 requests/hour
- 100,000 requests/day

Rate limit headers returned:

- `X-RateLimit-Limit`: Current limit
- `X-RateLimit-Remaining`: Remaining requests
- `Retry-After`: Seconds until reset (when limited)

## Configuration

Environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_ADDR`: Redis address
- `SMTP_HOST`: Internal SMTP server host
- `TRACKING_HOST`: Domain for tracking URLs
- `WEBHOOK_SIGNING_SECRET`: Secret for signing webhooks

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Client    │────▶│ Transactional API│────▶│ SMTP Server │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │                       │
                            ▼                       ▼
                    ┌───────────────┐       ┌─────────────┐
                    │  PostgreSQL   │       │   Mailpit   │
                    └───────────────┘       └─────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Redis      │
                    └───────────────┘
```
