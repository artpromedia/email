# API Documentation

Welcome to the Enterprise Email Platform API documentation.

## OpenAPI Specifications

The platform provides OpenAPI 3.0 documentation for all services:

| Service               | Spec File                                                          | Description                                              |
| --------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| **Web App**           | [openapi.yaml](./openapi.yaml)                                     | Main web application API (mail compose, templates, etc.) |
| **SMS Gateway**       | [sms-gateway-openapi.yaml](./sms-gateway-openapi.yaml)             | SMS sending, OTP, and provider management                |
| **Domain Manager**    | [domain-manager-openapi.yaml](./domain-manager-openapi.yaml)       | Domain registration, verification, DKIM, policies        |
| **Transactional API** | [transactional-api-openapi.yaml](./transactional-api-openapi.yaml) | Transactional email sending and webhooks                 |

## Interactive API Documentation

View the interactive API documentation with Swagger UI:

**Web App:** http://localhost:3000/api/docs **Admin App:** http://localhost:3001/api/docs
**Production:** https://api.enterpriseemail.com/docs

## Quick Start

### Authentication

Most API endpoints require authentication. Different services use different methods:

**Bearer Token (Web/Admin Apps):**

```bash
curl -H "Authorization: Bearer <your-token>" \
  https://api.enterpriseemail.com/v1/mail/compose/addresses
```

**API Key (SMS Gateway, Transactional API):**

```bash
curl -H "X-API-Key: <your-api-key>" \
  https://sms.enterpriseemail.com/api/sms/send
```

### Rate Limiting

- **Auth endpoints:** 5 requests/minute
- **API endpoints:** 100-200 requests/minute
- **Default:** 300 requests/minute

Rate limit headers are included in every response:

- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

## API Endpoints

### Health Checks

| Endpoint            | Method | Description                           |
| ------------------- | ------ | ------------------------------------- |
| `/api/health`       | GET    | Basic health check                    |
| `/api/health/ready` | GET    | Readiness probe (checks dependencies) |
| `/api/health/live`  | GET    | Liveness probe (checks if running)    |

### Mail Compose

| Endpoint                           | Method | Description                   |
| ---------------------------------- | ------ | ----------------------------- |
| `/api/v1/mail/compose/addresses`   | GET    | Get sender addresses          |
| `/api/v1/mail/compose/signatures`  | GET    | Get email signatures          |
| `/api/v1/mail/compose/signatures`  | POST   | Create new signature          |
| `/api/v1/mail/compose/branding`    | GET    | Get domain branding           |
| `/api/v1/mail/compose/validate`    | POST   | Validate email before sending |
| `/api/v1/mail/compose/send`        | POST   | Send email                    |
| `/api/v1/mail/compose/drafts`      | GET    | Get draft emails              |
| `/api/v1/mail/compose/drafts`      | POST   | Create draft                  |
| `/api/v1/mail/compose/drafts`      | PUT    | Update draft (auto-save)      |
| `/api/v1/mail/compose/drafts`      | DELETE | Delete draft                  |
| `/api/v1/mail/compose/attachments` | POST   | Upload attachment (max 25MB)  |
| `/api/v1/mail/compose/attachments` | DELETE | Delete attachment             |
| `/api/v1/mail/compose/templates`   | GET    | Get email templates           |
| `/api/v1/mail/compose/templates`   | POST   | Create template               |

## Error Handling

All errors follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

### Common Error Codes

| Code                  | Status | Description                             |
| --------------------- | ------ | --------------------------------------- |
| `UNAUTHORIZED`        | 401    | Missing or invalid authentication token |
| `FORBIDDEN`           | 403    | Insufficient permissions                |
| `NOT_FOUND`           | 404    | Resource not found                      |
| `VALIDATION_ERROR`    | 400    | Request validation failed               |
| `RATE_LIMIT_EXCEEDED` | 429    | Too many requests                       |
| `INTERNAL_ERROR`      | 500    | Server error                            |

## Examples

### Send Email

```bash
curl -X POST https://api.enterpriseemail.com/v1/mail/compose/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Hello World",
    "body": "<p>This is a test email</p>",
    "bodyType": "html",
    "priority": "normal"
  }'
```

Response (202 Accepted):

```json
{
  "messageId": "<1234567890.abc@example.com>",
  "status": "queued",
  "message": "Email has been queued for sending",
  "sentAt": "2026-01-29T12:00:00.000Z"
}
```

### Create Draft

```bash
curl -X POST https://api.enterpriseemail.com/v1/mail/compose/drafts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Draft email",
    "body": "This is a draft...",
    "bodyType": "html"
  }'
```

### Upload Attachment

```bash
curl -X POST https://api.enterpriseemail.com/v1/mail/compose/attachments \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf"
```

Response (201 Created):

```json
{
  "id": "a1b2c3d4e5f6",
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "size": 245678,
  "uploadedAt": "2026-01-29T12:00:00.000Z",
  "url": "/api/v1/mail/compose/attachments/a1b2c3d4e5f6"
}
```

### Validate Email

```bash
curl -X POST https://api.enterpriseemail.com/v1/mail/compose/validate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "",
    "body": "Email content"
  }'
```

Response:

```json
{
  "isValid": true,
  "warnings": ["Email has no subject"]
}
```

## SDK Libraries

### JavaScript/TypeScript

```typescript
import { EmailClient } from "@enterprise-email/client";

const client = new EmailClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.enterpriseemail.com/v1",
});

// Send email
await client.mail.send({
  from: "sender@example.com",
  to: ["recipient@example.com"],
  subject: "Hello",
  body: "<p>Test email</p>",
  bodyType: "html",
});

// Create draft
const draft = await client.mail.createDraft({
  from: "sender@example.com",
  to: ["recipient@example.com"],
  subject: "Draft",
  body: "Draft content",
});

// Auto-save draft
await client.mail.updateDraft(draft.id, {
  subject: "Updated subject",
});
```

### Python

```python
from enterprise_email import EmailClient

client = EmailClient(
    api_key='your-api-key',
    base_url='https://api.enterpriseemail.com/v1'
)

# Send email
client.mail.send(
    from_='sender@example.com',
    to=['recipient@example.com'],
    subject='Hello',
    body='<p>Test email</p>',
    body_type='html'
)

# Upload attachment
with open('document.pdf', 'rb') as f:
    attachment = client.mail.upload_attachment(f)

# Send with attachment
client.mail.send(
    from_='sender@example.com',
    to=['recipient@example.com'],
    subject='With attachment',
    body='<p>See attached</p>',
    attachments=[attachment.id]
)
```

## Webhooks

Configure webhooks to receive real-time notifications:

```json
{
  "events": ["email.sent", "email.delivered", "email.bounced"],
  "url": "https://your-app.com/webhooks/email",
  "secret": "your-webhook-secret"
}
```

Event payload example:

```json
{
  "event": "email.delivered",
  "messageId": "<1234567890.abc@example.com>",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "data": {
    "from": "sender@example.com",
    "to": "recipient@example.com",
    "subject": "Hello World"
  }
}
```

## Support

- **Documentation:** https://docs.enterpriseemail.com
- **Support Email:** support@enterpriseemail.com
- **GitHub Issues:** https://github.com/artpromedia/email/issues
- **Status Page:** https://status.enterpriseemail.com
