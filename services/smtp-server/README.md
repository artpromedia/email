# Multi-Domain SMTP Server

A production-ready SMTP server supporting **unlimited domains per organization** with advanced features for OONRUMAIL platforms.

## Features

### Multi-Domain Support
- **Unlimited Domains**: Handle any number of domains per organization
- **Per-Domain Configuration**: Individual policies, rate limits, and settings for each domain
- **Domain-Specific DKIM**: Automatic DKIM signing with per-domain keys
- **Domain Verification**: MX, SPF, DKIM, and DMARC verification status tracking

### Email Authentication
- **DKIM Signing**: Automatic DKIM signing for outbound messages with key rotation support
- **DKIM Verification**: Verify DKIM signatures on inbound messages
- **SPF Validation**: Full SPF record evaluation per RFC 7208
- **DMARC Enforcement**: Policy enforcement with alignment checking

### Message Routing
- **Internal Routing**: Automatic routing between domains in the same organization
- **External Delivery**: MX lookup and SMTP delivery to external domains
- **Routing Rules**: Configurable rules for forwarding, redirecting, rejecting, or quarantining
- **Catch-All Support**: Per-domain catch-all address configuration

### Queue Management
- **Persistent Queue**: PostgreSQL-backed message queue with Redis for fast lookups
- **Retry Logic**: Exponential backoff retry with configurable limits
- **Per-Domain Rate Limiting**: Hourly and daily rate limits per domain
- **Worker Pool**: Configurable number of delivery workers

### Observability
- **Prometheus Metrics**: Per-domain metrics for messages, delivery, SPF/DKIM/DMARC results
- **Structured Logging**: JSON logging with zap for easy log aggregation
- **Health Checks**: HTTP endpoints for liveness and readiness probes

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Port 25       │     │   Port 587      │
│   (Receiving)   │     │   (Submission)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │ SMTP Server │
              │  (Backend)  │
              └──────┬──────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼───┐      ┌─────▼─────┐    ┌─────▼─────┐
│  SPF  │      │   DKIM    │    │  DMARC    │
│ Check │      │Sign/Verify│    │  Check    │
└───────┘      └───────────┘    └───────────┘
                     │
              ┌──────▼──────┐
              │   Router    │
              │ (Rules/Int/ │
              │   Ext)      │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   Queue     │
              │  Manager    │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │Worker 1 │ │Worker 2 │ │Worker N │
    └─────────┘ └─────────┘ └─────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `email_platform` |
| `DB_USER` | Database user | `smtp_server` |
| `DB_PASSWORD` | Database password | - |
| `REDIS_ADDR` | Redis address | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `SMTP_HOSTNAME` | Server hostname | `localhost` |
| `TLS_CERT_FILE` | TLS certificate path | - |
| `TLS_KEY_FILE` | TLS key path | - |

### Configuration File

See `config.yaml` for full configuration options:

```yaml
server:
  hostname: "mail.example.com"
  smtp_addr: ":25"
  submission_addr: ":587"
  max_message_size: 26214400  # 25MB

database:
  host: "postgres"
  port: 5432
  name: "email_platform"

queue:
  workers: 4
  max_retries: 5
  retry_delay: 5m

tls:
  enabled: true
  cert_file: "/app/certs/server.crt"
  key_file: "/app/certs/server.key"
```

## API / Protocols

### SMTP (Port 25)
- Receives inbound email for configured domains
- Validates recipients against mailboxes, aliases, and distribution lists
- Performs SPF, DKIM, and DMARC checks on inbound messages

### Submission (Port 587)
- Accepts authenticated outbound email
- Validates sender permissions per domain
- Signs outbound messages with DKIM

## Database Schema

The server uses PostgreSQL with the following main tables:

- `domains` - Domain configuration and verification status
- `dkim_keys` - DKIM key pairs per domain
- `mailboxes` - User mailboxes
- `aliases` - Email aliases
- `distribution_lists` - Mailing lists
- `routing_rules` - Message routing configuration
- `user_domain_permissions` - Per-user sending permissions
- `message_queue` - Outbound message queue

PostgreSQL `LISTEN/NOTIFY` is used for real-time cache invalidation.

## Deployment

### Docker

```bash
# Build
docker build -t smtp-server .

# Run
docker run -d \
  -p 25:25 \
  -p 587:587 \
  -p 9090:9090 \
  -e DB_PASSWORD=secret \
  -v /path/to/certs:/app/certs \
  smtp-server
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: smtp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: smtp-server
  template:
    metadata:
      labels:
        app: smtp-server
    spec:
      containers:
      - name: smtp-server
        image: smtp-server:latest
        ports:
        - containerPort: 25
        - containerPort: 587
        - containerPort: 9090
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: smtp-secrets
              key: db-password
        livenessProbe:
          httpGet:
            path: /health
            port: 9090
        readinessProbe:
          httpGet:
            path: /ready
            port: 9090
```

## Metrics

Prometheus metrics available at `:9090/metrics`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `smtp_connections_total` | Counter | - | Total SMTP connections |
| `smtp_connections_active` | Gauge | - | Active connections |
| `smtp_messages_received_total` | Counter | domain | Messages received |
| `smtp_messages_sent_total` | Counter | domain | Messages sent |
| `smtp_messages_rejected_total` | Counter | domain, reason | Messages rejected |
| `smtp_message_size_bytes` | Histogram | domain | Message sizes |
| `smtp_delivery_duration_seconds` | Histogram | domain, type | Delivery time |
| `smtp_spf_results_total` | Counter | domain, result | SPF results |
| `smtp_dkim_results_total` | Counter | domain, result | DKIM results |
| `smtp_dmarc_results_total` | Counter | domain, result | DMARC results |
| `smtp_queue_size` | Gauge | domain, status | Queue size |

## Development

### Prerequisites

- Go 1.23+
- PostgreSQL 15+
- Redis 7+

### Building

```bash
go build -o smtp-server .
```

### Testing

```bash
go test ./...
```

### Running Locally

```bash
# Start dependencies
docker-compose up -d postgres redis

# Run migrations
psql -f migrations/001_initial_schema.sql

# Run server
./smtp-server -config config.yaml
```

## License

MIT License - See LICENSE file for details.
