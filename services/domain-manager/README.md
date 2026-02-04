# Domain Manager Service

A Go-based microservice for managing email domains in the OONRUMAIL Platform. Provides comprehensive domain lifecycle management, DKIM key management, DNS verification, and monitoring.

## Features

- **Domain Lifecycle Management**: Create, read, update, and delete domains with proper verification workflow
- **DNS Verification**: Automated verification of TXT, MX, SPF, DKIM, and DMARC records
- **DKIM Key Management**: Generate, rotate, and manage RSA key pairs with secure encryption
- **Domain Branding**: Custom logos, colors, and email templates per domain
- **Domain Policies**: Message size limits, recipient restrictions, attachment policies
- **Catch-All Configuration**: Handle undeliverable mail (deliver, forward, reject)
- **Domain Statistics**: User counts, mailbox stats, email metrics
- **DNS Monitoring**: Background service for continuous DNS health checks with alerting

## API Endpoints

### Domain Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/domains` | Create a new domain |
| GET | `/api/admin/domains` | List domains for organization |
| GET | `/api/admin/domains/:id` | Get domain details with DNS records |
| PUT | `/api/admin/domains/:id` | Update domain |
| DELETE | `/api/admin/domains/:id` | Delete domain (soft delete) |

### Domain Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/domains/:id/verify` | Verify domain ownership via TXT record |
| POST | `/api/admin/domains/:id/check-dns` | Comprehensive DNS health check |

### DKIM Key Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/domains/:id/dkim/generate` | Generate new DKIM key pair |
| GET | `/api/admin/domains/:id/dkim` | List DKIM keys for domain |
| POST | `/api/admin/domains/:id/dkim/:keyId/activate` | Activate a DKIM key |
| POST | `/api/admin/domains/:id/dkim/:keyId/rotate` | Rotate DKIM key (generate new, deactivate old) |
| DELETE | `/api/admin/domains/:id/dkim/:keyId` | Delete inactive DKIM key |

### Branding

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/admin/domains/:id/branding` | Update domain branding |
| GET | `/api/admin/domains/:id/branding` | Get domain branding |
| GET | `/api/domains/:domainName/branding` | Public: Get branding by domain name |

### Policies

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/admin/domains/:id/policies` | Update domain policies |
| GET | `/api/admin/domains/:id/policies` | Get domain policies |

### Catch-All

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/admin/domains/:id/catch-all` | Update catch-all configuration |
| GET | `/api/admin/domains/:id/catch-all` | Get catch-all configuration |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/domains/:id/stats` | Get domain statistics |

## Quick Start

### Prerequisites

- Go 1.23+
- PostgreSQL 14+
- Redis 7+

### Configuration

1. Copy the example config:
```bash
cp config.yaml config.local.yaml
```

2. Set environment variables:
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=oonrumail
export DB_USER=postgres
export DB_PASSWORD=postgres
export DKIM_ENCRYPTION_KEY=your-32-byte-encryption-key-here
```

### Database Setup

Run the migrations:
```bash
psql -h localhost -U postgres -d oonrumail -f migrations/001_initial_schema.sql
```

### Build and Run

```bash
# Build
go build -o domain-manager .

# Run
./domain-manager

# Or with custom config
CONFIG_PATH=/path/to/config.yaml ./domain-manager
```

### Docker

```bash
# Build image
docker build -t domain-manager:latest .

# Run container
docker run -d \
  -p 8083:8083 \
  -p 9090:9090 \
  -e DB_HOST=host.docker.internal \
  -e DB_PASSWORD=postgres \
  -e DKIM_ENCRYPTION_KEY=your-key \
  domain-manager:latest
```

## Domain Verification Flow

1. **Create Domain**: Generate verification token
2. **Add DNS Records**: User adds TXT record with verification token
3. **Verify Domain**: System checks for TXT record
4. **Configure DNS**: User adds MX, SPF, DKIM, DMARC records
5. **Check DNS**: System validates all DNS records
6. **Generate DKIM**: Create and activate DKIM key
7. **Final Check**: Verify DKIM DNS record

## DNS Record Requirements

For a domain `example.com`:

### Verification TXT Record
```
example.com. TXT "oonrumail-verify=<verification_token>"
```

### MX Record
```
example.com. MX 10 mx.oonrumail.com.
```

### SPF Record
```
example.com. TXT "v=spf1 include:spf.oonrumail.com ~all"
```

### DKIM Record
```
mail._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=<public_key>"
```

### DMARC Record
```
_dmarc.example.com. TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@oonrumail.com"
```

## DKIM Key Management

### Key Generation
- RSA 2048-bit keys (configurable)
- Private keys encrypted with AES-GCM
- Public keys formatted for DNS TXT records

### Key Rotation
1. Generate new key with new selector
2. Add new DKIM DNS record
3. Wait for DNS propagation
4. Activate new key
5. Old key marked as rotated

## DNS Monitoring

The service runs a background job to monitor DNS records:

- Default interval: Every 30 minutes (configurable)
- Checks: MX, SPF, DKIM, DMARC, Verification TXT
- Alerts generated on failures:
  - `mx_failure`: Critical - affects mail delivery
  - `spf_failure`: High - may cause spam classification
  - `dkim_failure`: High - authentication failures
  - `dmarc_failure`: Medium - policy not enforced
  - `verification_failure`: Medium - ownership not confirmed

## Metrics

Prometheus metrics available at `/metrics`:
- HTTP request counts and latencies
- DNS check results
- Domain counts by status
- DKIM key statistics

## Project Structure

```
services/domain-manager/
├── main.go                 # Application entry point
├── config/
│   └── config.go          # Configuration management
├── domain/
│   └── types.go           # Domain models
├── repository/
│   └── repository.go      # Database operations
├── service/
│   ├── dns.go             # DNS verification service
│   └── dkim.go            # DKIM key management
├── handler/
│   ├── domain.go          # Domain API handlers
│   ├── domain_extended.go # DKIM, branding, policies handlers
│   └── public.go          # Public API handlers
├── monitor/
│   └── dns_monitor.go     # DNS monitoring background job
├── migrations/
│   └── 001_initial_schema.sql
├── config.yaml
├── Dockerfile
└── README.md
```

## License

Copyright © 2024 OONRUMAIL Platform
