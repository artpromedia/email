# Production Deployment Runbook

## OONRUMAIL Platform

**Last Updated:** January 29, 2026 **Version:** 1.0.0

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Steps](#deployment-steps)
3. [Rollback Procedure](#rollback-procedure)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Incident Response](#incident-response)

---

## Pre-Deployment Checklist

### Environment Verification

- [ ] All required secrets configured in AWS Secrets Manager/Vault
- [ ] `.env.production` file reviewed and validated
- [ ] Database backups completed and verified (< 24 hours old)
- [ ] SSL/TLS certificates valid and not expiring within 30 days
- [ ] DNS records configured (MX, SPF, DKIM, DMARC)
- [ ] Monitoring dashboards accessible
- [ ] Alert channels configured (Slack, PagerDuty, Email)
- [ ] On-call rotation scheduled
- [ ] Rollback plan reviewed with team

### Code Verification

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review approved by 2+ team members
- [ ] No known security vulnerabilities (Snyk/Trivy scan clean)
- [ ] Performance benchmarks meet SLA requirements
- [ ] Documentation updated (API docs, runbooks)
- [ ] Change log updated
- [ ] Feature flags configured for gradual rollout

### Infrastructure Verification

- [ ] Kubernetes cluster healthy (all nodes ready)
- [ ] Database replicas in sync
- [ ] Redis cluster healthy
- [ ] MinIO/S3 accessible and healthy
- [ ] Load balancers configured
- [ ] Auto-scaling policies configured
- [ ] Resource limits defined (CPU, memory, storage)
- [ ] Network policies applied
- [ ] RBAC permissions reviewed

---

## Deployment Steps

### Phase 1: Database Migration

**Duration:** 15-30 minutes **Downtime:** None (if migrations are backwards compatible)

```bash
# 1. Create database backup
./scripts/backups/backup-postgres.sh

# 2. Verify backup integrity
sha256sum -c /backups/postgres/daily/latest.sql.gz.sha256

# 3. Run migrations in dry-run mode
cd packages/database
pnpm drizzle-kit push --dry-run

# 4. Review migration plan
# Verify no destructive operations

# 5. Apply migrations
pnpm drizzle-kit push

# 6. Verify migration
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d oonrumail -c "\dt"
```

**Rollback:** If migration fails, restore from backup:

```bash
./scripts/backups/restore-postgres.sh /backups/postgres/daily/latest.sql.gz
```

### Phase 2: Backend Services Deployment

**Duration:** 10-20 minutes **Downtime:** None (rolling update)

```bash
# 1. Set context to production cluster
kubectl config use-context production

# 2. Verify current state
kubectl get pods -n email-platform
kubectl get services -n email-platform

# 3. Update Docker images
docker build -t email-platform/auth:v1.0.0 -f services/auth/Dockerfile .
docker build -t email-platform/smtp:v1.0.0 -f services/smtp-server/Dockerfile .
docker build -t email-platform/imap:v1.0.0 -f services/imap-server/Dockerfile .
docker build -t email-platform/storage:v1.0.0 -f services/storage/Dockerfile .
docker build -t email-platform/domain-manager:v1.0.0 -f services/domain-manager/Dockerfile .

# 4. Push to registry
docker push email-platform/auth:v1.0.0
docker push email-platform/smtp:v1.0.0
docker push email-platform/imap:v1.0.0
docker push email-platform/storage:v1.0.0
docker push email-platform/domain-manager:v1.0.0

# 5. Deploy with rolling update strategy
kubectl set image deployment/auth auth=email-platform/auth:v1.0.0 -n email-platform
kubectl set image deployment/smtp smtp=email-platform/smtp:v1.0.0 -n email-platform
kubectl set image deployment/imap imap=email-platform/imap:v1.0.0 -n email-platform
kubectl set image deployment/storage storage=email-platform/storage:v1.0.0 -n email-platform
kubectl set image deployment/domain-manager domain-manager=email-platform/domain-manager:v1.0.0 -n email-platform

# 6. Monitor rollout
kubectl rollout status deployment/auth -n email-platform
kubectl rollout status deployment/smtp -n email-platform
kubectl rollout status deployment/imap -n email-platform
kubectl rollout status deployment/storage -n email-platform
kubectl rollout status deployment/domain-manager -n email-platform

# 7. Verify pods are running
kubectl get pods -n email-platform -w
```

**Health Check:** After each service deployment, verify:

```bash
# Auth service
curl https://api.yourdomain.com/health

# SMTP service
echo "QUIT" | nc mail.yourdomain.com 25

# IMAP service
echo "a1 LOGOUT" | openssl s_client -connect mail.yourdomain.com:993 -quiet

# Storage service
curl https://storage.yourdomain.com/health

# Domain manager
curl https://api.yourdomain.com/api/domains/health
```

### Phase 3: Frontend Deployment

**Duration:** 5-10 minutes **Downtime:** None (with proper caching)

```bash
# 1. Build Next.js applications
cd apps/web
pnpm build

cd ../admin
pnpm build

# 2. Run production tests
cd ../web
pnpm start & WEB_PID=$!
sleep 5
curl http://localhost:3000 || kill $WEB_PID
kill $WEB_PID

cd ../admin
pnpm start & ADMIN_PID=$!
sleep 5
curl http://localhost:3001 || kill $ADMIN_PID
kill $ADMIN_PID

# 3. Deploy to Vercel/hosting platform
cd apps/web
vercel --prod

cd ../admin
vercel --prod

# Alternative: Deploy to Kubernetes
# docker build -t email-platform/web:v1.0.0 -f apps/web/Dockerfile .
# docker build -t email-platform/admin:v1.0.0 -f apps/admin/Dockerfile .
# kubectl set image deployment/web web=email-platform/web:v1.0.0 -n email-platform
# kubectl set image deployment/admin admin=email-platform/admin:v1.0.0 -n email-platform
```

### Phase 4: Cache Warming (Optional)

```bash
# Warm up Redis cache
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD <<EOF
# Preload critical data
HSET domains:cache:primary name yourdomain.com
HSET domains:cache:primary dkim_enabled true
EOF

# Warm up application cache
curl https://api.yourdomain.com/api/domains
curl https://api.yourdomain.com/api/users/me
```

### Phase 5: Enable Traffic

**For Canary Deployments:**

```bash
# 1. Route 10% traffic to new version
kubectl patch service email-web -n email-platform -p '{"spec":{"selector":{"version":"v1.0.0","canary":"10"}}}'

# 2. Monitor for 15 minutes
# Watch error rates, latency, and business metrics

# 3. Gradually increase traffic
# 25% -> 50% -> 75% -> 100%

# 4. Full cutover
kubectl patch service email-web -n email-platform -p '{"spec":{"selector":{"version":"v1.0.0"}}}'
```

---

## Rollback Procedure

### Immediate Rollback (< 5 minutes)

**If deployment fails or critical issues detected:**

```bash
# 1. Rollback Kubernetes deployments
kubectl rollout undo deployment/auth -n email-platform
kubectl rollout undo deployment/smtp -n email-platform
kubectl rollout undo deployment/imap -n email-platform
kubectl rollout undo deployment/storage -n email-platform
kubectl rollout undo deployment/domain-manager -n email-platform

# 2. Verify rollback
kubectl rollout status deployment/auth -n email-platform
kubectl get pods -n email-platform

# 3. Check health
./scripts/health-check-all.sh

# 4. Notify team
echo "Deployment rolled back due to critical issue" | \
    ./scripts/notify-slack.sh --channel=#incidents
```

### Database Rollback

**Only if database migration caused issues:**

```bash
# 1. Stop all application services
kubectl scale deployment --all --replicas=0 -n email-platform

# 2. Restore database from pre-migration backup
./scripts/backups/restore-postgres.sh /backups/postgres/pre-deploy/latest.sql.gz

# 3. Verify database state
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d oonrumail -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"

# 4. Restart services with previous version
kubectl set image deployment/auth auth=email-platform/auth:v0.9.0 -n email-platform
kubectl scale deployment --all --replicas=3 -n email-platform

# 5. Monitor recovery
kubectl get pods -n email-platform -w
```

---

## Post-Deployment Verification

### Automated Checks

```bash
#!/bin/bash
# Post-deployment verification script

echo "Running post-deployment checks..."

# 1. Health endpoints
for service in auth smtp imap storage domain-manager; do
    response=$(curl -s -o /dev/null -w "%{http_code}" https://api.yourdomain.com/health/$service)
    if [ "$response" = "200" ]; then
        echo "✓ $service is healthy"
    else
        echo "✗ $service health check failed (HTTP $response)"
        exit 1
    fi
done

# 2. Database connectivity
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d oonrumail -c "SELECT 1;" > /dev/null || exit 1
echo "✓ Database connection OK"

# 3. Redis connectivity
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD PING > /dev/null || exit 1
echo "✓ Redis connection OK"

# 4. S3/MinIO connectivity
aws s3 ls s3://$S3_ATTACHMENTS_BUCKET --endpoint-url $S3_ENDPOINT > /dev/null || exit 1
echo "✓ S3/MinIO connection OK"

# 5. SMTP connectivity
echo "QUIT" | nc -w 5 mail.yourdomain.com 25 > /dev/null || exit 1
echo "✓ SMTP server responding"

# 6. IMAP connectivity
echo "a1 LOGOUT" | openssl s_client -connect mail.yourdomain.com:993 -quiet 2>/dev/null | grep "OK" > /dev/null || exit 1
echo "✓ IMAP server responding"

# 7. DNS verification
dig +short MX yourdomain.com | grep "mail.yourdomain.com" > /dev/null || exit 1
echo "✓ DNS MX record OK"

# 8. SSL certificate
echo | openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com 2>/dev/null | \
    openssl x509 -noout -checkend 2592000 > /dev/null || echo "⚠ SSL certificate expires soon"

echo "All post-deployment checks passed! ✓"
```

### Manual Verification

- [ ] Send test email through web interface
- [ ] Receive test email via IMAP
- [ ] Verify email appears in OpenSearch
- [ ] Check Grafana dashboards (no anomalies)
- [ ] Review Sentry for new errors
- [ ] Test user authentication (web + admin)
- [ ] Verify domain management features
- [ ] Check DKIM signature on sent emails
- [ ] Test email forwarding rules
- [ ] Verify quota enforcement

### Business Metrics Verification

Monitor for 1 hour post-deployment:

| Metric                  | Expected | Actual | Status |
| ----------------------- | -------- | ------ | ------ |
| Email delivery rate     | > 99%    | \_\_\_ | ⬜     |
| API response time (p95) | < 200ms  | \_\_\_ | ⬜     |
| SMTP connections/min    | \_\_\_   | \_\_\_ | ⬜     |
| Error rate              | < 0.1%   | \_\_\_ | ⬜     |
| Active users            | \_\_\_   | \_\_\_ | ⬜     |

---

## Monitoring & Alerts

### Critical Alerts (Page Immediately)

- Database down or unreachable
- Redis cluster down
- SMTP/IMAP server not responding
- API error rate > 1%
- Email queue depth > 10,000
- Disk usage > 90%
- SSL certificate expires < 7 days

### Warning Alerts (Notify Slack)

- API response time p95 > 500ms
- Email queue depth > 1,000
- Database connection pool > 90%
- Memory usage > 85%
- Email delivery rate < 98%

### Grafana Dashboards

- **System Overview:** http://grafana.yourdomain.com/d/system-overview
- **Email Metrics:** http://grafana.yourdomain.com/d/email-metrics
- **Domain Health:** http://grafana.yourdomain.com/d/domain-health
- **API Performance:** http://grafana.yourdomain.com/d/api-performance

---

## Incident Response

### Severity Levels

**P0 - Critical (Page On-Call)**

- Complete service outage
- Data loss or corruption
- Security breach
- **Response Time:** < 15 minutes
- **Resolution Time:** < 4 hours

**P1 - High (Notify Team)**

- Degraded performance (> 50% users affected)
- Partial service outage
- **Response Time:** < 1 hour
- **Resolution Time:** < 24 hours

**P2 - Medium (During Business Hours)**

- Minor feature not working
- Performance degradation (< 50% users)
- **Response Time:** < 4 hours
- **Resolution Time:** < 3 days

### Incident Response Workflow

1. **Detect:** Alert triggered or issue reported
2. **Acknowledge:** On-call engineer acknowledges within 15 min
3. **Assess:** Determine severity and impact
4. **Communicate:** Update status page, notify stakeholders
5. **Mitigate:** Apply immediate fix or rollback
6. **Resolve:** Fully resolve root cause
7. **Post-Mortem:** Document incident and prevention steps

### Emergency Contacts

- **On-Call Engineer:** PagerDuty rotation
- **Engineering Lead:** [Phone]
- **DevOps Lead:** [Phone]
- **CTO:** [Phone]

### Common Issues & Solutions

| Issue                              | Symptoms                               | Solution                                 |
| ---------------------------------- | -------------------------------------- | ---------------------------------------- |
| Database connection pool exhausted | API 500 errors, "too many connections" | Restart PgBouncer, increase pool size    |
| Redis out of memory                | Cache misses, slow performance         | Clear old keys, increase memory          |
| Email queue backing up             | Delayed email delivery                 | Check SMTP service logs, restart workers |
| High CPU on SMTP server            | Slow email sending                     | Scale up replicas, check for spam        |
| DNS resolution failures            | Domain verification failing            | Check CoreDNS logs, verify records       |

---

## Appendix

### Useful Commands

```bash
# View logs
kubectl logs -f deployment/auth -n email-platform
kubectl logs --tail=100 -l app=smtp -n email-platform

# Scale services
kubectl scale deployment/smtp --replicas=5 -n email-platform

# Port forward for debugging
kubectl port-forward service/postgres 5432:5432 -n email-platform

# Database queries
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d oonrumail

# Redis commands
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD
```

### Related Documents

- [Architecture Overview](../docs/ARCHITECTURE.md)
- [Multi-Domain Setup](../docs/MULTI_DOMAIN_COMPOSE_README.md)
- [API Documentation](../docs/API_DOCUMENTATION.md)
- [Security Hardening](../docs/SECURITY_HARDENING.md)
- [Disaster Recovery Plan](./disaster-recovery.md)

---

**Document Owner:** DevOps Team **Review Cycle:** Monthly **Last Reviewed:** January 29, 2026
