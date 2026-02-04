# Multi-Domain Storage Service

A comprehensive Go-based storage service for OONRUMAIL systems with domain-based
partitioning, hierarchical quotas, retention policies, data export, and GDPR-compliant deletion.

## Features

### Domain-Based Storage Partitioning

- Hierarchical storage key structure:
  `{org_id}/{domain_id}/{user_id}/messages/{year}/{month}/{message_id}`
- S3-compatible backend (AWS S3, MinIO)
- Domain isolation with cross-domain operations support

### Hierarchical Quota Management

- Four-level quota hierarchy: Organization → Domain → User → Mailbox
- Soft limits (warnings) and hard limits (blocking)
- Atomic quota reservations for concurrent operations
- Redis caching for fast quota checks

### Retention Policies

- Domain-level retention configuration
- Automatic archiving to cheaper storage tiers
- Compliance mode with minimum retention periods
- Legal holds with custodian management

### Data Export

- Async job-based export processing
- Multiple formats: MBOX, PST, EML, JSON
- Optional compression and encryption
- Presigned download URLs

### GDPR-Compliant Deletion

- Approval workflow for data deletion
- Complete audit trail
- Domain, user, mailbox, or selective deletion
- Compliance type tracking (GDPR, retention, legal, manual)

### Attachment Deduplication

- Organization-scoped deduplication
- SHA-256 content hashing
- Reference counting with automatic cleanup
- Significant storage savings for common attachments

## Architecture

```
services/storage/
├── config/           # Configuration loading
├── models/           # Domain models
├── storage/          # Storage interfaces and S3 implementation
├── quota/            # Quota service
├── retention/        # Retention policy service
├── export/           # Export and deletion services
├── dedup/            # Deduplication service
├── handlers/         # HTTP handlers
├── workers/          # Background job workers
├── migrations/       # Database schema
└── main.go           # Application entry point
```

## API Endpoints

### Messages

- `POST /api/v1/messages` - Get upload URL for new message
- `GET /api/v1/messages/{messageID}` - Retrieve message
- `DELETE /api/v1/messages/{messageID}` - Delete message
- `GET /api/v1/messages/{messageID}/presigned` - Get download URL

### Attachments

- `POST /api/v1/attachments` - Store attachment (with dedup check)
- `GET /api/v1/attachments/{attachmentID}` - Get attachment
- `DELETE /api/v1/attachments/{attachmentID}` - Delete attachment reference
- `GET /api/v1/attachments/message/{messageID}` - List message attachments

### Cross-Domain Operations

- `POST /api/v1/domains/copy` - Copy messages between domains
- `POST /api/v1/domains/move` - Move messages between domains

### Quotas

- `GET /api/v1/quotas` - Get quota configuration
- `PUT /api/v1/quotas` - Update quota limits
- `GET /api/v1/quotas/check` - Check if size fits in quota
- `GET /api/v1/quotas/usage` - Get current usage

### Retention

- `POST /api/v1/retention/policies` - Create retention policy
- `GET /api/v1/retention/policies/{domainID}` - Get domain policy
- `PUT /api/v1/retention/policies/{policyID}` - Update policy
- `DELETE /api/v1/retention/policies/{policyID}` - Delete policy

### Legal Holds

- `POST /api/v1/retention/holds` - Create legal hold
- `DELETE /api/v1/retention/holds/{holdID}` - Release hold
- `GET /api/v1/retention/holds/domain/{domainID}` - List domain holds

### Exports

- `POST /api/v1/exports` - Create export job
- `GET /api/v1/exports/{jobID}` - Get job status
- `GET /api/v1/exports/{jobID}/download` - Download export
- `DELETE /api/v1/exports/{jobID}` - Cancel export
- `GET /api/v1/exports/domain/{domainID}` - List domain exports

### Deletions

- `POST /api/v1/deletions` - Create deletion job
- `GET /api/v1/deletions/{jobID}` - Get job status
- `POST /api/v1/deletions/{jobID}/approve` - Approve deletion
- `DELETE /api/v1/deletions/{jobID}` - Cancel deletion
- `GET /api/v1/deletions/audit/{jobID}` - Get audit log

### Deduplication

- `GET /api/v1/dedup/stats/{orgID}` - Get deduplication statistics

## Configuration

Environment variables:

```bash
# Server
SERVER_PORT=8080
SERVER_READ_TIMEOUT=30
SERVER_WRITE_TIMEOUT=30

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=storage
DB_PASSWORD=secret
DB_NAME=storage
DB_SSL_MODE=disable

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# S3
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=email-storage
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_USE_PATH_STYLE=false

# Quotas
QUOTA_DEFAULT_ORG_GB=1000
QUOTA_DEFAULT_DOMAIN_GB=100
QUOTA_DEFAULT_USER_GB=10
QUOTA_DEFAULT_MAILBOX_GB=5

# Retention
RETENTION_DEFAULT_DAYS=365
RETENTION_DELETED_DAYS=30
RETENTION_ARCHIVE_DAYS=90

# Export
EXPORT_MAX_SIZE_GB=50
EXPORT_EXPIRY_HOURS=168
EXPORT_OUTPUT_BUCKET=email-exports

# Workers
WORKERS_ENABLED=true
WORKERS_RETENTION_INTERVAL=60
```

## Running

### Development

```bash
# Start dependencies
docker-compose up -d postgres redis minio

# Run migrations
psql $DATABASE_URL < migrations/001_initial_schema.sql

# Run service
go run main.go
```

### Docker

```bash
docker build -t storage-service .
docker run -p 8080:8080 --env-file .env storage-service
```

## Storage Key Format

Messages are stored with keys following this pattern:

```
{org_id}/{domain_id}/{user_id}/messages/{year}/{month}/{message_id}
```

Attachments (deduplicated):

```
{org_id}/attachments/{hash_prefix}/{content_hash}
```

Exports:

```
exports/{domain_id}/{job_id}/{filename}
```

## Quota Hierarchy

Quotas cascade from organization to mailbox level:

1. **Organization** - Total storage for all domains
2. **Domain** - Storage allocated to a domain
3. **User** - Per-user storage limit
4. **Mailbox** - Individual mailbox limit

A write operation must satisfy quotas at ALL levels.

## Legal Hold Behavior

When a legal hold is active:

- Messages matching the hold criteria cannot be deleted
- Retention policies are suspended for held messages
- Export includes held messages
- Audit trail is maintained

## License

Internal use only - OONRUMAIL Platform
