# SMS Gateway Service

A provider-agnostic SMS gateway service with OTP support, message templates, rate limiting, and
multi-provider failover.

## Features

- **Multi-Provider Support**: Twilio, Vonage, with interfaces for SMPP and GSM modems
- **OTP Management**: Secure generation, verification, and rate limiting
- **Message Templates**: Customizable templates with variable substitution
- **Rate Limiting**: Per-user, per-phone, and per-API-key limits
- **Failover**: Automatic provider failover on failures
- **Webhooks**: Delivery status tracking via provider webhooks
- **Analytics**: Usage tracking and reporting

## Architecture

```
services/sms-gateway/
├── cmd/server/main.go       # Entry point
├── config.yaml              # Configuration
├── internal/
│   ├── api/                 # REST API handlers
│   │   ├── server.go        # Router setup
│   │   └── handlers.go      # Request handlers
│   ├── config/              # Configuration
│   ├── otp/                 # OTP logic
│   ├── providers/           # SMS providers
│   │   ├── interface.go     # Provider interface
│   │   ├── twilio/          # Twilio adapter
│   │   ├── vonage/          # Vonage adapter
│   │   ├── smpp/            # Direct SMPP (future)
│   │   └── gsm/             # GSM modem (future)
│   ├── ratelimit/           # Rate limiting
│   ├── repository/          # Database layer
│   └── templates/           # Message templates
└── migrations/              # Database migrations
```

## API Endpoints

### SMS

| Method | Endpoint                         | Description        |
| ------ | -------------------------------- | ------------------ |
| POST   | `/api/v1/sms/send`               | Send a single SMS  |
| POST   | `/api/v1/sms/send-bulk`          | Send bulk SMS      |
| GET    | `/api/v1/sms/status/{messageId}` | Get message status |
| GET    | `/api/v1/sms/messages`           | List messages      |

### OTP

| Method | Endpoint                  | Description    |
| ------ | ------------------------- | -------------- |
| POST   | `/api/v1/otp/send`        | Send OTP       |
| POST   | `/api/v1/otp/verify`      | Verify OTP     |
| POST   | `/api/v1/otp/resend`      | Resend OTP     |
| GET    | `/api/v1/otp/{requestId}` | Get OTP status |
| DELETE | `/api/v1/otp/{requestId}` | Cancel OTP     |

### Templates

| Method | Endpoint                 | Description     |
| ------ | ------------------------ | --------------- |
| GET    | `/api/v1/templates`      | List templates  |
| POST   | `/api/v1/templates`      | Create template |
| GET    | `/api/v1/templates/{id}` | Get template    |
| PUT    | `/api/v1/templates/{id}` | Update template |
| DELETE | `/api/v1/templates/{id}` | Delete template |

### Providers

| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| GET    | `/api/v1/providers`         | List providers         |
| GET    | `/api/v1/providers/status`  | Provider health status |
| GET    | `/api/v1/providers/balance` | Provider balances      |

## Usage Examples

### Send SMS

```bash
curl -X POST http://localhost:8087/api/v1/sms/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "+1234567890",
    "message": "Hello from SMS Gateway!"
  }'
```

### Send OTP

```bash
curl -X POST http://localhost:8087/api/v1/otp/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "phone_number": "+1234567890",
    "purpose": "login"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "expires_at": "2024-01-15T10:05:00Z",
    "resend_after": "2024-01-15T10:01:00Z",
    "attempts_left": 3
  }
}
```

### Verify OTP

```bash
curl -X POST http://localhost:8087/api/v1/otp/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "phone_number": "+1234567890",
    "code": "123456"
  }'
```

### Use Template

```bash
curl -X POST http://localhost:8087/api/v1/sms/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "+1234567890",
    "template_id": "welcome-template-id",
    "variables": {
      "name": "John",
      "app_name": "MyApp"
    }
  }'
```

## Configuration

### Environment Variables

```bash
# Server
SMS_GATEWAY_PORT=8087
SMS_METRICS_PORT=9095
LOG_LEVEL=info

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/oonrumail

# Redis
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=

# Authentication
JWT_SECRET=your-jwt-secret

# Twilio
TWILIO_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+15551234567
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxx

# Vonage
VONAGE_ENABLED=true
VONAGE_API_KEY=xxxxxxxxxxxxxx
VONAGE_API_SECRET=xxxxxxxxxxxxxx
VONAGE_FROM_NUMBER=MyBrand
```

## Rate Limiting

Default limits:

| Scope                    | Limit |
| ------------------------ | ----- |
| API requests per minute  | 30    |
| API requests per hour    | 500   |
| API requests per day     | 5000  |
| OTP per phone per minute | 3     |
| OTP per phone per hour   | 10    |
| OTP per phone per day    | 5     |

## Provider Priority

Providers are tried in priority order (lowest first). If a provider fails, the next one is tried
automatically.

```yaml
providers:
  twilio:
    priority: 1
  vonage:
    priority: 2
  smpp:
    priority: 3
```

## OTP Best Practices

1. **Short expiry**: Default 5 minutes
2. **Limited attempts**: Default 3 attempts
3. **Cooldown period**: 60 seconds between resends
4. **Numeric codes**: 6-digit codes for better UX
5. **Purpose-specific**: Different codes for login, registration, etc.

## Security

- API key authentication with hashed storage
- JWT token support for service-to-service auth
- Rate limiting prevents abuse
- OTP codes are stored hashed
- IP and user agent logging for audit

## Monitoring

- Prometheus metrics at `:9095/metrics`
- Health check at `/health`
- Structured JSON logging

## Docker

```bash
# Build
docker build -t sms-gateway .

# Run
docker run -d \
  -p 8087:8087 \
  -p 9095:9095 \
  -e DATABASE_URL="postgres://..." \
  -e TWILIO_ACCOUNT_SID="..." \
  sms-gateway
```

## Database Migration

```bash
psql $DATABASE_URL < migrations/007_create_sms_tables.sql
```

## Development

```bash
# Install dependencies
go mod download

# Run locally
go run ./cmd/server -config config.yaml

# Run tests
go test ./...

# Build
go build -o sms-gateway ./cmd/server
```

## Future Enhancements

- [ ] SMPP direct carrier integration
- [ ] GSM modem support for local sending
- [ ] Number lookup/validation API
- [ ] SMS scheduling
- [ ] Conversation threading
- [ ] MMS support
- [ ] WhatsApp Business integration
- [ ] Sender ID registration workflow
