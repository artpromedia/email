# Multi-Domain Email Infrastructure

Complete production infrastructure for enterprise multi-domain email system with automatic DNS
verification, TLS certificate provisioning, and per-domain monitoring.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Internet / DNS                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │  Load Balancer    │
         │  (AWS NLB/ALB)    │
         └─────────┬─────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼────┐  ┌─────▼─────┐  ┌────▼────┐
│ SMTP   │  │ Ingress   │  │ IMAP    │
│ :25    │  │ (HTTPS)   │  │ :143    │
│ :587   │  │           │  │ :993    │
│ :465   │  └───────────┘  └─────────┘
└────────┘         │
                   │
         ┌─────────▼──────────┐
         │   Kubernetes        │
         │   email-system NS   │
         │                     │
         │ ┌─────────────────┐ │
         │ │ Web Client      │ │
         │ │ Auth Service    │ │
         │ │ Domain Manager  │ │
         │ │ Storage Service │ │
         │ └─────────────────┘ │
         └─────────────────────┘
                   │
         ┌─────────▼──────────┐
         │   PostgreSQL RDS    │
         │   (Multi-tenant)    │
         └─────────────────────┘
                   │
         ┌─────────▼──────────┐
         │   S3 Storage        │
         │   (Per-domain)      │
         └─────────────────────┘
```

## Components

### 1. DNS Architecture

#### Primary Domain Setup

```
mail.oonrumail.com → Load Balancer IP
smtp.oonrumail.com → Load Balancer IP
imap.oonrumail.com → Load Balancer IP
webmail.oonrumail.com → Ingress Controller
api.oonrumail.com → Ingress Controller
```

#### Customer Domain Configuration

**Option A: MX to Primary Domain**

```
; Customer DNS
example.com.          MX  10 mail.oonrumail.com.
webmail.example.com.  CNAME webmail.oonrumail.com.
```

**Option B: Custom Vanity Domain**

```
; Customer DNS
example.com.          MX  10 mail.example.com.
mail.example.com.     CNAME mail.oonrumail.com.
webmail.example.com.  CNAME webmail.oonrumail.com.
```

#### DNS Verification Records

```
; Domain ownership verification
_mail-verification.example.com. TXT "mail-verification=<token>"

; Email authentication
example.com.                    TXT "v=spf1 include:spf.oonrumail.com ~all"
default._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=<public-key>"
_dmarc.example.com.             TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@oonrumail.com"
```

### 2. TLS Certificate Management

#### Automatic Certificate Provisioning

1. **Customer adds domain** → Domain Manager API
2. **DNS verification** → Automated DNS checker
3. **Certificate request** → cert-manager + Let's Encrypt
4. **Certificate provisioning** → Kubernetes Secret
5. **Ingress update** → Dynamic ingress controller
6. **Auto-renewal** → cert-manager (60 days)

#### Certificate Strategies

**Primary Domain (Wildcard)**

```yaml
dnsNames:
  - "*.oonrumail.com"
  - oonrumail.com
```

**Customer Domains (Per-Domain)**

```yaml
dnsNames:
  - example.com
  - mail.example.com
  - webmail.example.com
```

### 3. Kubernetes Infrastructure

#### Namespace Structure

```
email-system/         # Main application namespace
cert-manager/         # Certificate management
ingress-nginx/        # Ingress controller
monitoring/           # Prometheus + Grafana
```

#### Key Resources

**Ingress Controller with SNI**

- Automatic TLS certificate selection
- Per-domain rate limiting
- Custom headers for domain identification

**Dynamic Ingress Controller**

- Watches database for verified domains
- Creates ingress rules automatically
- Manages certificate lifecycle

**Service Mesh**

- Domain-based routing
- Request tracing per organization
- Circuit breakers and retries

### 4. SMTP Multi-Domain Configuration

#### Postfix Setup

**Virtual Domain Handling**

```
virtual_mailbox_domains = proxy:pgsql:/etc/postfix/pgsql-domains.cf
virtual_mailbox_maps = proxy:pgsql:/etc/postfix/pgsql-mailboxes.cf
```

**SNI for TLS**

- Present correct certificate per domain
- Automatic certificate rotation
- TLS 1.2+ enforcement

**IP Pool Management**

```
Domain A → Dedicated IP Pool (10.0.1.10-11)
Domain B → Shared IP Pool (10.0.1.20-29)
Domain C → High Volume Pool (10.0.1.30-39)
```

### 5. IP Reputation Management

#### IP Pool Configuration

```sql
CREATE TABLE ip_pools (
  id UUID PRIMARY KEY,
  pool_name VARCHAR(100) NOT NULL,
  pool_type VARCHAR(50), -- 'dedicated', 'shared', 'high-volume'
  ips TEXT[], -- Array of IP addresses
  warming_schedule JSONB, -- IP warming configuration
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE domain_ip_pools (
  domain_id UUID REFERENCES domains(id),
  pool_id UUID REFERENCES ip_pools(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (domain_id, pool_id)
);
```

#### IP Warming Strategy

**New Domain/IP Pair**

- Day 1-3: 100 emails/day
- Day 4-7: 500 emails/day
- Day 8-14: 2,000 emails/day
- Day 15-21: 10,000 emails/day
- Day 22+: Full volume

### 6. Domain Isolation (Enterprise)

For compliance-sensitive customers:

#### Dedicated Infrastructure

```hcl
module "isolated_domain" {
  source = "./modules/isolated-domain"

  domain_name     = "regulated-client.com"
  organization_id = "org-uuid"
  region          = "eu-west-1"

  # Dedicated database
  database_instance_class = "db.r6g.xlarge"
  enable_encryption       = true
  backup_retention_days   = 30

  # Dedicated storage
  storage_bucket_prefix = "regulated-client"

  # Dedicated encryption keys
  kms_key_alias = "regulated-client-key"
}
```

#### Features

- Separate PostgreSQL instance per domain
- Separate S3 bucket with encryption
- Dedicated KMS keys
- Regional deployment options
- Separate audit logs

### 7. Monitoring & Alerting

#### Per-Domain Metrics

**Prometheus Labels**

```
smtp_messages_total{domain="example.com", organization="org-123"}
domain_storage_used_bytes{domain="example.com"}
domain_verified{domain="example.com", status="active"}
```

**Grafana Dashboards**

- Multi-domain overview
- Per-domain email volume
- Storage usage by domain
- DNS health status
- Certificate expiration tracking

#### Alert Rules

**DNS Alerts**

- DNS record changed
- Domain verification failed
- DNS health check failed

**Certificate Alerts**

- Certificate expiring (30 days)
- Certificate expiring critical (7 days)
- Certificate renewal failed

**Performance Alerts**

- High error rate per domain
- Queue backlog per domain
- High latency per domain

**Security Alerts**

- SPF/DKIM failures
- High authentication failures
- Reputation score drop

### 8. Deployment

#### Prerequisites

```bash
# Install required tools
brew install terraform kubectl helm

# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace
```

#### Terraform Deployment

```bash
cd infrastructure/terraform

# Initialize
terraform init

# Plan
terraform plan \
  -var="aws_region=us-east-1" \
  -var="admin_email=admin@oonrumail.com"

# Apply
terraform apply
```

#### Kubernetes Deployment

```bash
cd infrastructure/kubernetes

# Create namespace
kubectl create namespace email-system

# Apply configurations
kubectl apply -f ingress.yaml
kubectl apply -f cert-manager-setup.yaml
kubectl apply -f dynamic-ingress-controller.yaml

# Deploy services
kubectl apply -f ../services/
```

#### Postfix Configuration

```bash
# Copy configuration files
cp infrastructure/postfix/*.cf /etc/postfix/

# Update database passwords
sed -i "s/\${POSTFIX_DB_PASSWORD}/$DB_PASSWORD/g" /etc/postfix/pgsql-*.cf

# Reload Postfix
postfix reload
```

### 9. Domain Onboarding Flow

#### 1. Customer Adds Domain

```bash
POST /api/domains
{
  "domain_name": "example.com",
  "organization_id": "org-123",
  "dns_setup_type": "mx_to_primary"
}
```

#### 2. System Returns DNS Records

```json
{
  "domain_id": "domain-456",
  "verification_token": "abc123",
  "required_records": [
    {
      "type": "TXT",
      "name": "_mail-verification.example.com",
      "value": "mail-verification=abc123"
    },
    {
      "type": "MX",
      "name": "example.com",
      "value": "10 mail.oonrumail.com"
    },
    ...
  ]
}
```

#### 3. Customer Configures DNS

Customer adds records to their DNS provider

#### 4. Automated Verification

- DNS monitor checks every 5 minutes
- Verifies ownership, MX, SPF, DKIM, DMARC
- Updates domain status in database

#### 5. Certificate Provisioning

- cert-manager requests certificate from Let's Encrypt
- Uses DNS-01 or HTTP-01 challenge
- Stores certificate in Kubernetes Secret

#### 6. Ingress Configuration

- Dynamic ingress controller detects verified domain
- Creates new ingress rule
- Adds SNI configuration for TLS

#### 7. SMTP Configuration

- Postfix virtual domain lookup includes new domain
- IP pool assigned (if applicable)
- DKIM key generated and signed

#### 8. Domain Active

Domain is ready to send/receive email

### 10. Scaling Considerations

#### Horizontal Scaling

- SMTP servers: Scale based on connection count
- IMAP servers: Scale based on active sessions
- API services: Scale based on request rate
- Storage service: Scale based on I/O operations

#### Database Scaling

- Read replicas for domain lookups
- Connection pooling
- Query caching
- Partitioning by organization

#### Storage Scaling

- S3 with CloudFront for attachments
- Lifecycle policies (Glacier after 90 days)
- Compression and deduplication
- Distributed object storage

### 11. Disaster Recovery

#### Backup Strategy

- Database: Automated daily backups (30-day retention)
- Email storage: S3 versioning + cross-region replication
- Configuration: Git repository + encrypted secrets
- Certificates: Backed up to S3

#### Recovery Procedures

- RTO: 4 hours
- RPO: 15 minutes
- Automated failover to backup region
- Blue-green deployment capability

### 12. Security

#### Network Security

- VPC with private subnets
- Security groups restricting traffic
- WAF on public endpoints
- DDoS protection

#### Data Security

- Encryption at rest (KMS)
- Encryption in transit (TLS 1.2+)
- Secrets management (AWS Secrets Manager)
- Regular security scans

#### Access Control

- RBAC for Kubernetes
- IAM roles with least privilege
- Audit logging
- MFA for administrative access

## Testing

### DNS Verification Testing

```bash
# Test domain verification
go run services/domain-manager/cmd/verify-domain/main.go \
  --domain example.com \
  --primary-domain oonrumail.com
```

### Certificate Testing

```bash
# Test certificate provisioning
kubectl get certificate -n email-system
kubectl describe certificate example-com-tls -n email-system
```

### SMTP Testing

```bash
# Test SMTP delivery
swaks --to user@example.com \
      --from sender@test.com \
      --server mail.oonrumail.com \
      --tls

# Check logs
kubectl logs -f deployment/smtp-server -n email-system
```

## Troubleshooting

### DNS Not Resolving

```bash
# Check DNS propagation
dig example.com MX
dig _mail-verification.example.com TXT

# Check domain manager logs
kubectl logs -f deployment/domain-manager -n email-system | grep example.com
```

### Certificate Not Issuing

```bash
# Check cert-manager status
kubectl get certificaterequest -n email-system
kubectl describe certificaterequest <name> -n email-system

# Check Let's Encrypt logs
kubectl logs -n cert-manager deployment/cert-manager
```

### Email Not Routing

```bash
# Check Postfix logs
tail -f /var/log/mail.log | grep example.com

# Check domain in database
psql -c "SELECT * FROM domains WHERE name = 'example.com';"
```

## Cost Optimization

- Use spot instances for non-critical workloads
- Implement S3 lifecycle policies
- Use CloudFront for attachment delivery
- Optimize database queries and indexes
- Implement caching layers

## Support

For issues or questions:

- Email: support@oonrumail.com
- Docs: https://docs.oonrumail.com

## License

Proprietary - OONRUMAIL System
