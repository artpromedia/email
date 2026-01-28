# Multi-Domain IMAP Server

Enterprise-grade IMAP server supporting multiple domains per user with cross-domain operations, shared mailbox access, and comprehensive quota management.

## Features

### Multi-Domain Authentication
- Login with ANY email address associated with the user account
- Automatic discovery of all user mailboxes across domains
- Single connection provides access to all mailboxes

### Namespace Configuration
- **Unified Mode**: Single INBOX merging messages from all domains
- **Domain-Separated Mode**: Each domain appears as a separate namespace
- Per-user namespace preference

### Core IMAP Support
- IMAP4rev1 and IMAP4rev2 compliant
- Full command set: SELECT, FETCH, STORE, SEARCH, COPY, MOVE, etc.
- IDLE for real-time notifications
- CONDSTORE/QRESYNC for efficient synchronization

### Cross-Domain Operations
- Copy messages between mailboxes in different domains
- Move messages with proper UID mapping
- Permission validation for cross-domain access

### Shared Mailbox Access
- Share mailboxes with other users in the organization
- Granular permissions: read, write, delete, admin
- Shared namespace with "Shared/" prefix

### Quota Management
- Per-domain storage quotas
- Message count limits
- GETQUOTA, GETQUOTAROOT, SETQUOTA commands
- Quota warnings and enforcement

### Special-Use Folders
- Standard folders: Inbox, Drafts, Sent, Spam, Trash, Archive
- RFC 6154 special-use attributes
- Auto-creation on mailbox setup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      IMAP Client                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    IMAP Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth      │  │  Namespace  │  │   Notification      │  │
│  │   Handler   │  │   Handler   │  │   Hub (IDLE)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│  ┌──────▼──────────────────▼─────────────────────▼────────┐  │
│  │                 Connection Context                      │  │
│  │  - User ID           - Active Mailbox                   │  │
│  │  - Mailboxes[]       - Active Folder                    │  │
│  │  - SharedMailboxes[] - Domain Context                   │  │
│  │  - Namespace Mode    - Capabilities                     │  │
│  └───────────────────────┬─────────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌────────────┐   ┌────────────┐   ┌────────────┐
   │ PostgreSQL │   │   Redis    │   │  Storage   │
   │ (metadata) │   │ (sessions) │   │  (S3/FS)   │
   └────────────┘   └────────────┘   └────────────┘
```

## Configuration

### config.yaml

```yaml
server:
  host: "0.0.0.0"
  port: 143
  tls_port: 993
  max_connections: 10000

imap:
  namespace_mode: "domain_separated"  # or "unified"
  capabilities:
    - "IMAP4rev1"
    - "IDLE"
    - "NAMESPACE"
    - "QUOTA"
    - "MOVE"
```

### Namespace Modes

#### Domain-Separated (default)
Each domain appears as a separate namespace:
```
* NAMESPACE (("" "/")("example.com/" "/")("company.org/" "/")) 
  NIL (("Shared/" "/"))
```

User sees:
- `INBOX` (primary domain)
- `example.com/INBOX`
- `example.com/Sent`
- `company.org/INBOX`
- `company.org/Sent`
- `Shared/colleague@example.com/INBOX`

#### Unified
All mailboxes merged into a single namespace:
```
* NAMESPACE (("" "/")) (("example.com/" "/")("company.org/" "/")) 
  (("Shared/" "/"))
```

User sees:
- `INBOX` (combined from all domains)
- `Sent`
- `Drafts`

## IMAP Commands

### Authentication
```
A1 LOGIN user@example.com password
A2 AUTHENTICATE PLAIN
```

### Namespace
```
A1 NAMESPACE
* NAMESPACE (("" "/")("example.com/" "/")) NIL (("Shared/" "/"))
```

### List Mailboxes
```
A1 LIST "" "*"
* LIST (\HasNoChildren) "/" "INBOX"
* LIST (\HasNoChildren \Sent) "/" "Sent"
* LIST (\HasNoChildren) "/" "example.com/INBOX"
* LIST (\HasNoChildren \Sent) "/" "example.com/Sent"
```

### Cross-Domain Operations
```
# Copy from primary domain to secondary
A1 UID COPY 1:5 "company.org/Archive"

# Move between domains
A1 UID MOVE 10 "example.com/Spam"
```

### Quota
```
A1 GETQUOTAROOT "INBOX"
* QUOTAROOT "INBOX" "example.com"
* QUOTA "example.com" (STORAGE 512000 1048576)

A1 GETQUOTA "example.com"
* QUOTA "example.com" (STORAGE 512000 1048576 MESSAGE 1500 10000)
```

### IDLE
```
A1 IDLE
+ idling
* 23 EXISTS
* 24 EXISTS
DONE
A1 OK IDLE terminated
```

## API Integration

### Health Check
```bash
curl http://localhost:9090/health
```

### Metrics
```bash
curl http://localhost:9090/metrics
```

Prometheus metrics:
- `imap_active_connections` - Current active connections
- `imap_total_connections` - Total connections since start
- `imap_commands_processed` - Commands processed by type
- `imap_auth_attempts` - Authentication attempts (success/failure)

## Development

### Build
```bash
go build -o imap-server .
```

### Run
```bash
./imap-server -config config.yaml
```

### Docker
```bash
docker build -t imap-server .
docker run -p 143:143 -p 993:993 -p 9090:9090 imap-server
```

### Testing
```bash
# Connect with OpenSSL
openssl s_client -connect localhost:993

# Test commands
A1 CAPABILITY
A2 LOGIN user@example.com password
A3 NAMESPACE
A4 LIST "" "*"
A5 SELECT INBOX
A6 FETCH 1:* (FLAGS UID ENVELOPE)
A7 LOGOUT
```

## Database Schema

Key tables:
- `organizations` - Multi-tenant organizations
- `domains` - Email domains per organization
- `users` - User accounts
- `mailboxes` - Email addresses (multiple per user)
- `folders` - IMAP folders per mailbox
- `messages` - Email messages with full IMAP attributes
- `shared_mailbox_access` - Shared mailbox permissions
- `quotas` - Per-mailbox quota tracking

## Security

- TLS 1.2+ required for production
- STARTTLS support on port 143
- Implicit TLS on port 993
- SASL PLAIN and LOGIN mechanisms
- Account lockout after failed attempts
- Audit logging for compliance

## License

MIT License
