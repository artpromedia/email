# Multi-Domain Infrastructure - Quick Reference

## 🚀 Quick Start

### Prerequisites

- AWS account with appropriate permissions
- kubectl configured
- terraform >= 1.5
- helm >= 3.x

### Deploy Infrastructure

```bash
cd infrastructure
chmod +x deploy.sh

# Set environment variables
export ENVIRONMENT=production
export AWS_REGION=us-east-1
export PRIMARY_DOMAIN=oonrumail.com
export GRAFANA_PASSWORD=<secure-password>

# Run deployment
./deploy.sh
```

## 📋 Common Operations

### Add New Customer Domain

```bash
# 1. Customer adds domain via API
curl -X POST https://api.oonrumail.com/domains \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "domain_name": "example.com",
    "organization_id": "org-123"
  }'

# 2. System returns DNS records
# Customer configures DNS at their provider

# 3. Monitor verification
kubectl logs -f deployment/domain-manager -n email-system | grep example.com
```

### Check Domain Status

```bash
# View all domains and verification status
kubectl exec -it deployment/domain-manager -n email-system -- \
  go run cmd/list-domains/main.go

# Check specific domain DNS
kubectl exec -it deployment/domain-manager -n email-system -- \
  go run cmd/verify-domain/main.go --domain example.com
```

### Certificate Management

```bash
# List all certificates
kubectl get certificates -n email-system

# Check certificate status
kubectl describe certificate example-com-tls -n email-system

# Force certificate renewal
kubectl delete certificate example-com-tls -n email-system
# cert-manager will automatically recreate it
```

### IP Pool Management

```bash
# Create new IP pool
psql $DATABASE_URL <<EOF
INSERT INTO ip_pools (pool_name, pool_type, ips, max_domains)
VALUES ('dedicated-vip', 'dedicated', ARRAY['10.0.1.100'], 5);
EOF

# Assign pool to domain
psql $DATABASE_URL <<EOF
INSERT INTO domain_ip_pools (domain_id, pool_id)
SELECT
  d.id,
  ip.id
FROM domains d, ip_pools ip
WHERE d.name = 'example.com' AND ip.pool_name = 'dedicated-vip';
EOF

# Check domain's IP pool
psql $DATABASE_URL <<EOF
SELECT d.name, ip.pool_name, ip.ips
FROM domains d
JOIN domain_ip_pools dip ON d.id = dip.domain_id
JOIN ip_pools ip ON dip.pool_id = ip.id
WHERE d.name = 'example.com';
EOF
```

### Monitor Domain Health

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Open http://localhost:3000 (admin/<password>)

# View domain metrics in Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090

# Query examples:
# - Domain email volume: rate(smtp_messages_total{domain="example.com"}[5m])
# - Domain error rate: rate(smtp_messages_failed_total{domain="example.com"}[5m])
# - Storage usage: domain_storage_used_bytes{domain="example.com"}
```

## 🔍 Troubleshooting

### DNS Not Verifying

```bash
# 1. Check DNS propagation
dig example.com MX
dig _mail-verification.example.com TXT
dig default._domainkey.example.com TXT

# 2. Manually verify
kubectl exec -it deployment/domain-manager -n email-system -- \
  go run cmd/verify-domain/main.go --domain example.com --verbose

# 3. Check logs
kubectl logs -f deployment/domain-manager -n email-system | grep "DNS verification"
```

### Certificate Not Issuing

```bash
# 1. Check certificate request
kubectl get certificaterequest -n email-system

# 2. Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# 3. Check challenges
kubectl get challenges -n email-system

# 4. Describe certificate for events
kubectl describe certificate example-com-tls -n email-system
```

### Email Not Routing

```bash
# 1. Check if domain is active in database
psql $DATABASE_URL -c "SELECT name, status, verified FROM domains WHERE name = 'example.com';"

# 2. Test SMTP connection
swaks --to user@example.com \
      --from test@test.com \
      --server mail.oonrumail.com \
      --tls

# 3. Check Postfix logs
kubectl logs -f deployment/smtp-server -n email-system | grep example.com

# 4. Check virtual domain lookup
kubectl exec -it deployment/smtp-server -n email-system -- \
  postmap -q example.com proxy:pgsql:/etc/postfix/pgsql-domains.cf
```

### High Error Rate Alert

```bash
# 1. Check Prometheus alert
kubectl get prometheusrules -n monitoring

# 2. Query error metrics
# In Prometheus UI (localhost:9090):
rate(smtp_messages_failed_total{domain="example.com"}[5m]) /
rate(smtp_messages_total{domain="example.com"}[5m])

# 3. Check SMTP server logs
kubectl logs -f deployment/smtp-server -n email-system --tail=100

# 4. Check domain configuration
psql $DATABASE_URL -c "SELECT * FROM domains WHERE name = 'example.com';"
```

## 📊 Monitoring Queries

### Prometheus Queries

```promql
# Email volume by domain (messages/minute)
sum by (domain) (rate(smtp_messages_total[5m]) * 60)

# Error rate by domain (%)
rate(smtp_messages_failed_total{domain!=""}[5m]) /
rate(smtp_messages_total{domain!=""}[5m]) * 100

# Storage usage by domain (GB)
domain_storage_used_bytes{domain!=""} / 1024 / 1024 / 1024

# Active connections by domain
smtp_active_connections{domain!=""}

# Certificate expiration (days)
(certmanager_certificate_expiration_timestamp_seconds - time()) / 86400

# Domain reputation score
domain_reputation_score{domain!=""}

# IP warming phase
ip_warming_phase{domain!=""}
```

### Database Queries

```sql
-- Domains summary
SELECT
  name,
  status,
  verified,
  created_at,
  last_verified_at
FROM domains
ORDER BY created_at DESC;

-- Domain storage usage
SELECT
  d.name,
  ROUND(d.storage_used_bytes / 1024.0 / 1024 / 1024, 2) as used_gb,
  ROUND(d.storage_quota_bytes / 1024.0 / 1024 / 1024, 2) as quota_gb,
  ROUND((d.storage_used_bytes::float / d.storage_quota_bytes) * 100, 1) as usage_pct
FROM domains d
WHERE d.status = 'active'
ORDER BY usage_pct DESC;

-- Top sending domains (last 7 days)
SELECT
  d.name,
  COUNT(*) as email_count
FROM emails e
JOIN users u ON e.user_id = u.id
JOIN domains d ON u.domain_id = d.id
WHERE e.sent_at > NOW() - INTERVAL '7 days'
GROUP BY d.name
ORDER BY email_count DESC
LIMIT 10;

-- IP pool usage
SELECT
  ip.pool_name,
  ip.pool_type,
  COUNT(DISTINCT dip.domain_id) as domain_count,
  ip.max_domains,
  array_length(ip.ips, 1) as ip_count
FROM ip_pools ip
LEFT JOIN domain_ip_pools dip ON ip.id = dip.pool_id
WHERE ip.active = true
GROUP BY ip.id;

-- Domains in IP warming
SELECT
  d.name,
  iws.current_phase,
  iws.daily_limit,
  iws.start_date,
  iws.status
FROM ip_warming_schedules iws
JOIN domains d ON iws.domain_id = d.id
WHERE iws.status = 'active';
```

## 🔧 Maintenance

### Scale Services

```bash
# Scale SMTP servers
kubectl scale deployment smtp-server -n email-system --replicas=5

# Scale IMAP servers
kubectl scale deployment imap-server -n email-system --replicas=3

# Scale web clients
kubectl scale deployment web-client -n email-system --replicas=4
```

### Update Configuration

```bash
# Update ingress
kubectl edit ingress mail-ingress-primary -n email-system

# Update ConfigMap
kubectl edit configmap domain-config -n email-system

# Restart services
kubectl rollout restart deployment/domain-manager -n email-system
```

### Backup and Restore

```bash
# Backup database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Backup certificates
kubectl get secrets -n email-system -o yaml > certificates-backup.yaml

# Restore database
psql $DATABASE_URL < backup-20240129.sql
```

## 🔐 Security

### Rotate Secrets

```bash
# Update database password
kubectl create secret generic database-credentials \
  --from-literal=url=$NEW_DATABASE_URL \
  -n email-system \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart dependent services
kubectl rollout restart deployment -n email-system
```

### Update TLS Certificates

```bash
# Let's Encrypt auto-renews, but to force renewal:
kubectl delete certificate <cert-name> -n email-system

# Check renewal status
kubectl get certificaterequest -n email-system
```

## 📱 Alerting

### Configure Alertmanager

```yaml
# alertmanager-config.yaml
receivers:
  - name: "email"
    email_configs:
      - to: "ops@oonrumail.com"
        from: "alerts@oonrumail.com"
        smarthost: "smtp.oonrumail.com:587"
  - name: "slack"
    slack_configs:
      - api_url: "$SLACK_WEBHOOK_URL"
        channel: "#email-alerts"

route:
  receiver: "email"
  routes:
    - match:
        severity: critical
      receiver: "slack"
```

Apply:

```bash
kubectl create secret generic alertmanager-config \
  --from-file=alertmanager.yaml=alertmanager-config.yaml \
  -n monitoring
```

## 📚 Additional Resources

- [Full Documentation](./README.md)
- [Terraform Modules](./terraform/modules/)
- [Kubernetes Manifests](./kubernetes/)
- [Monitoring Setup](./monitoring/)
- [Domain Manager Service](../services/domain-manager/)

## 🆘 Support

- **Emergency**: Slack #email-ops-emergency
- **General**: Slack #email-infrastructure
- **Email**: ops@oonrumail.com
- **On-Call**: PagerDuty rotation

## ⚡ Performance Tips

1. **DNS Caching**: Enable DNS caching to reduce verification load
2. **Connection Pooling**: Increase database connection pool for high traffic
3. **Read Replicas**: Use read replicas for domain lookups
4. **CDN**: Use CloudFront for attachment delivery
5. **Indexes**: Ensure proper database indexes on frequently queried fields
6. **Monitoring**: Set up custom alerts for your specific SLAs
7. **Scaling**: Use HPA (Horizontal Pod Autoscaler) for automatic scaling
