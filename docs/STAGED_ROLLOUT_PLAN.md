# Staged Rollout Execution Plan

**Document Version:** 1.0.0 **Last Updated:** January 31, 2026 **Sprint:** 7 - Final Hardening

---

## Executive Summary

This document defines the staged rollout execution plan for deploying the Enterprise Email Platform
to production. The rollout consists of four phases with clear success criteria, monitoring
requirements, and rollback procedures.

**Rollout Timeline:** 4 weeks (estimated)

| Phase | Name                 | Duration  | Target Users          | Success Criteria         |
| ----- | -------------------- | --------- | --------------------- | ------------------------ |
| 1     | Internal Alpha       | 3-5 days  | Internal team (10-20) | 99.5% uptime, <500ms p95 |
| 2     | Closed Beta          | 5-7 days  | 50-100 users          | 99.5% uptime, <500ms p95 |
| 3     | Limited Production   | 7-10 days | 500-1000 users        | 99.9% uptime, <300ms p95 |
| 4     | General Availability | Ongoing   | Unlimited             | 99.9% uptime, <300ms p95 |

---

## Global Rollback Criteria

The following criteria will trigger an automatic rollback at ANY phase:

| Metric              | Threshold     | Measurement Window |
| ------------------- | ------------- | ------------------ |
| Error Rate          | >1%           | 5-minute rolling   |
| p95 Latency         | >1 second     | 15-minute rolling  |
| Email Delivery Rate | <98%          | 1-hour rolling     |
| Service Downtime    | >5 minutes    | Continuous         |
| Security Incident   | Any severity  | Immediate          |
| Data Corruption     | Any detection | Immediate          |

---

## Phase 1: Internal Alpha

### Objective

Validate production infrastructure with internal team before external users.

### Timeline

- **Start Date:** ******\_******
- **End Date:** ******\_******
- **Duration:** 3-5 business days

### Target Audience

- DevOps team members
- Engineering team members
- QA team members
- **Total Users:** 10-20

### Deployment Configuration

```yaml
# Phase 1 Configuration
environment: production
phase: internal-alpha

feature_flags:
  new_compose_ui: true
  multi_domain_support: true
  ai_assistant: false # Disabled for alpha
  virus_scanning: false # Not yet integrated
  advanced_analytics: false

rate_limits:
  api_requests_per_minute: 300
  smtp_messages_per_hour: 1000
  imap_connections_max: 50

monitoring:
  alert_threshold_multiplier: 2 # More sensitive alerting
  log_level: debug
```

### Pre-deployment Checklist

| Task                         | Owner | Status | Notes                     |
| ---------------------------- | ----- | ------ | ------------------------- |
| Backup production database   | Ops   | [ ]    | Full backup before deploy |
| Verify DNS records           | Ops   | [ ]    | DKIM, DMARC, SPF          |
| Deploy monitoring dashboards | Ops   | [ ]    | Phase 1 dashboard active  |
| Configure alerting           | Ops   | [ ]    | Team Slack channel        |
| Test SMTP authentication     | QA    | [ ]    | All auth methods          |
| Test DKIM signing            | QA    | [ ]    | Send test emails          |
| Test SSO integration         | QA    | [ ]    | Test IdP                  |
| Verify backup scripts        | Ops   | [ ]    | Run test backup/restore   |
| Document rollback procedure  | Ops   | [ ]    | Team review               |
| Notify stakeholders          | PM    | [ ]    | Alpha start announcement  |

### Deployment Steps

```bash
#!/bin/bash
# Phase 1 Deployment Script

set -e

echo "=== Phase 1: Internal Alpha Deployment ==="

# 1. Pre-flight checks
echo "Running pre-flight checks..."
./scripts/preflight-check.sh

# 2. Create backup
echo "Creating pre-deployment backup..."
./scripts/backups/backup-postgres.sh --tag="pre-alpha"

# 3. Deploy infrastructure
echo "Deploying infrastructure..."
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f infrastructure/kubernetes/secrets.yaml
kubectl apply -f infrastructure/kubernetes/configmap-alpha.yaml

# 4. Deploy services (ordered)
echo "Deploying core services..."
kubectl apply -f services/auth/k8s/deployment.yaml
kubectl rollout status deployment/auth -n email-production --timeout=300s

echo "Deploying email services..."
kubectl apply -f services/smtp-server/k8s/deployment.yaml
kubectl apply -f services/imap-server/k8s/deployment.yaml
kubectl rollout status deployment/smtp-server -n email-production --timeout=300s
kubectl rollout status deployment/imap-server -n email-production --timeout=300s

# 5. Deploy web applications
echo "Deploying web applications..."
kubectl apply -f apps/web/k8s/deployment.yaml
kubectl apply -f apps/admin/k8s/deployment.yaml
kubectl rollout status deployment/web -n email-production --timeout=300s

# 6. Verify deployment
echo "Running verification tests..."
./scripts/verify-deployment.sh --phase=alpha

# 7. Enable traffic
echo "Enabling alpha traffic..."
kubectl apply -f infrastructure/kubernetes/ingress-alpha.yaml

echo "=== Phase 1 Deployment Complete ==="
echo "Monitor: https://grafana.internal/d/phase1-alpha"
```

### Success Criteria

| Metric                  | Target   | Measurement            |
| ----------------------- | -------- | ---------------------- |
| Uptime                  | >99.5%   | Prometheus `up` metric |
| API Response Time (p95) | <500ms   | Grafana dashboard      |
| Error Rate              | <0.5%    | Log aggregation        |
| Email Delivery          | >99%     | Delivery reports       |
| Authentication Success  | >99.9%   | Auth service logs      |
| User Satisfaction       | Positive | Team feedback          |

### Monitoring Dashboard

**Phase 1 Key Metrics to Watch:**

```promql
# Error Rate
sum(rate(http_requests_total{status=~"5.*"}[5m])) /
sum(rate(http_requests_total[5m])) * 100

# P95 Latency
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# Email Delivery Rate
sum(rate(emails_delivered_total[1h])) /
sum(rate(emails_sent_total[1h])) * 100

# Active Connections
sum(smtp_active_connections) + sum(imap_active_connections)
```

### Go/No-Go Decision

**Phase 1 → Phase 2 Approval:**

| Criteria                    | Required | Actual | Pass? |
| --------------------------- | -------- | ------ | ----- |
| All success criteria met    | Yes      |        | [ ]   |
| No P1/P2 bugs outstanding   | Yes      |        | [ ]   |
| Team confidence survey >4/5 | Yes      |        | [ ]   |
| Zero security incidents     | Yes      |        | [ ]   |
| Runbooks validated          | Yes      |        | [ ]   |

**Decision:**

- [ ] **GO** - Proceed to Phase 2
- [ ] **NO-GO** - Address issues and re-evaluate

**Approved by:** ******\_\_\_****** **Date:** ******\_\_\_******

---

## Phase 2: Closed Beta

### Objective

Validate platform with limited external users in controlled environment.

### Timeline

- **Start Date:** ******\_******
- **End Date:** ******\_******
- **Duration:** 5-7 business days

### Target Audience

- Beta testers (opt-in customers)
- Power users from pilot companies
- **Total Users:** 50-100

### Deployment Configuration

```yaml
# Phase 2 Configuration
environment: production
phase: closed-beta

feature_flags:
  new_compose_ui: true
  multi_domain_support: true
  ai_assistant: true # Enable for beta testing
  virus_scanning: false # Still awaiting integration
  advanced_analytics: true # Enable for feedback

rate_limits:
  api_requests_per_minute: 500
  smtp_messages_per_hour: 2000
  imap_connections_max: 100

monitoring:
  alert_threshold_multiplier: 1.5
  log_level: info
```

### Beta User Selection Criteria

| Criterion               | Description                           |
| ----------------------- | ------------------------------------- |
| Technical Proficiency   | Comfortable reporting detailed issues |
| Usage Pattern           | Mix of light/heavy email users        |
| Geographic Distribution | Multiple time zones                   |
| Industry Diversity      | Various business types                |
| Feedback Commitment     | Agreed to provide weekly feedback     |

### Pre-deployment Checklist

| Task                        | Owner    | Status | Notes                   |
| --------------------------- | -------- | ------ | ----------------------- |
| Phase 1 sign-off complete   | Team     | [ ]    | All criteria met        |
| Beta user accounts created  | Support  | [ ]    | 100 accounts max        |
| Support channels configured | Support  | [ ]    | Dedicated Slack/email   |
| Feedback collection setup   | PM       | [ ]    | Survey forms ready      |
| Scale infrastructure        | Ops      | [ ]    | 2x replica count        |
| Enable additional features  | Dev      | [ ]    | AI assistant, analytics |
| Update rate limits          | Ops      | [ ]    | Increased limits        |
| Penetration test scheduled  | Security | [ ]    | During beta phase       |

### Deployment Steps

```bash
#!/bin/bash
# Phase 2 Deployment Script

set -e

echo "=== Phase 2: Closed Beta Deployment ==="

# 1. Verify Phase 1 sign-off
if [ ! -f ".phase1-signoff" ]; then
  echo "ERROR: Phase 1 sign-off not found. Aborting."
  exit 1
fi

# 2. Create backup
echo "Creating pre-beta backup..."
./scripts/backups/backup-postgres.sh --tag="pre-beta"

# 3. Scale up services
echo "Scaling services for beta load..."
kubectl scale deployment auth --replicas=3 -n email-production
kubectl scale deployment smtp-server --replicas=3 -n email-production
kubectl scale deployment imap-server --replicas=3 -n email-production
kubectl scale deployment web --replicas=3 -n email-production

# 4. Update configuration
echo "Applying beta configuration..."
kubectl apply -f infrastructure/kubernetes/configmap-beta.yaml

# 5. Restart services to pick up new config
echo "Rolling restart of services..."
kubectl rollout restart deployment/auth -n email-production
kubectl rollout restart deployment/smtp-server -n email-production
kubectl rollout restart deployment/imap-server -n email-production
kubectl rollout restart deployment/web -n email-production

# Wait for rollouts
kubectl rollout status deployment/auth -n email-production --timeout=300s
kubectl rollout status deployment/smtp-server -n email-production --timeout=300s

# 6. Enable beta user access
echo "Enabling beta user access..."
kubectl apply -f infrastructure/kubernetes/ingress-beta.yaml

# 7. Notify beta users
echo "Sending beta welcome emails..."
./scripts/notify-beta-users.sh

echo "=== Phase 2 Deployment Complete ==="
echo "Beta users can now access: https://mail.yourdomain.com"
echo "Monitor: https://grafana.internal/d/phase2-beta"
```

### Success Criteria

| Metric                  | Target  | Measurement            |
| ----------------------- | ------- | ---------------------- |
| Uptime                  | >99.5%  | Prometheus `up` metric |
| API Response Time (p95) | <500ms  | Grafana dashboard      |
| Error Rate              | <0.3%   | Log aggregation        |
| Email Delivery          | >99%    | Delivery reports       |
| Bug Reports             | <20 P2+ | Issue tracker          |
| NPS Score               | >30     | Weekly survey          |

### Penetration Testing

**During Phase 2, conduct:**

| Test Type              | Scope                | Timeline |
| ---------------------- | -------------------- | -------- |
| API Security Scan      | All endpoints        | Day 2-3  |
| Authentication Testing | SSO, MFA, password   | Day 3-4  |
| SMTP Security          | AUTH, TLS, injection | Day 4-5  |
| Web Application        | XSS, CSRF, injection | Day 5-6  |

**Findings Resolution:**

- Critical: Immediate fix, possible rollback
- High: Fix within 48 hours
- Medium: Fix before Phase 3
- Low: Add to backlog

### Go/No-Go Decision

**Phase 2 → Phase 3 Approval:**

| Criteria                           | Required | Actual | Pass? |
| ---------------------------------- | -------- | ------ | ----- |
| All success criteria met           | Yes      |        | [ ]   |
| Penetration test complete          | Yes      |        | [ ]   |
| No critical/high findings open     | Yes      |        | [ ]   |
| NPS score >30                      | Yes      |        | [ ]   |
| Infrastructure scaled successfully | Yes      |        | [ ]   |

**Decision:**

- [ ] **GO** - Proceed to Phase 3
- [ ] **NO-GO** - Address issues and re-evaluate

**Approved by:** ******\_\_\_****** **Date:** ******\_\_\_******

---

## Phase 3: Limited Production

### Objective

Production deployment with gradual traffic increase and comprehensive monitoring.

### Timeline

- **Start Date:** ******\_******
- **End Date:** ******\_******
- **Duration:** 7-10 business days

### Target Audience

- Early adopter customers
- Customers migrating from legacy systems
- **Total Users:** 500-1000

### Deployment Configuration

```yaml
# Phase 3 Configuration
environment: production
phase: limited-production

feature_flags:
  new_compose_ui: true
  multi_domain_support: true
  ai_assistant: true
  virus_scanning: true # Enabled if ClamAV integrated
  advanced_analytics: true

rate_limits:
  api_requests_per_minute: 1000
  smtp_messages_per_hour: 10000
  imap_connections_max: 500

monitoring:
  alert_threshold_multiplier: 1.0 # Standard alerting
  log_level: info
```

### Traffic Ramp-up Schedule

| Day  | Traffic % | Users | Actions                 |
| ---- | --------- | ----- | ----------------------- |
| 1-2  | 10%       | ~100  | Monitor baseline        |
| 3-4  | 25%       | ~250  | First increase          |
| 5-6  | 50%       | ~500  | Half capacity           |
| 7-8  | 75%       | ~750  | Near full               |
| 9-10 | 100%      | ~1000 | Full limited production |

### Pre-deployment Checklist

| Task                               | Owner    | Status | Notes               |
| ---------------------------------- | -------- | ------ | ------------------- |
| Phase 2 sign-off complete          | Team     | [ ]    | All criteria met    |
| Penetration test findings resolved | Security | [ ]    | All high/critical   |
| Production support team trained    | Support  | [ ]    | Runbook review      |
| On-call schedule established       | Ops      | [ ]    | 24/7 coverage       |
| Customer communication sent        | PM       | [ ]    | Migration timeline  |
| Capacity planning validated        | Ops      | [ ]    | Load test results   |
| SLA documentation finalized        | Legal    | [ ]    | Customer agreements |

### Deployment Steps

```bash
#!/bin/bash
# Phase 3 Deployment Script

set -e

echo "=== Phase 3: Limited Production Deployment ==="

# 1. Verify Phase 2 sign-off
if [ ! -f ".phase2-signoff" ]; then
  echo "ERROR: Phase 2 sign-off not found. Aborting."
  exit 1
fi

# 2. Create backup
echo "Creating pre-production backup..."
./scripts/backups/backup-postgres.sh --tag="pre-limited-prod"

# 3. Scale to production capacity
echo "Scaling to production capacity..."
kubectl scale deployment auth --replicas=5 -n email-production
kubectl scale deployment smtp-server --replicas=5 -n email-production
kubectl scale deployment imap-server --replicas=5 -n email-production
kubectl scale deployment web --replicas=5 -n email-production
kubectl scale deployment admin --replicas=3 -n email-production

# 4. Apply production configuration
echo "Applying production configuration..."
kubectl apply -f infrastructure/kubernetes/configmap-production.yaml

# 5. Enable virus scanning (if integrated)
if [ "$ENABLE_VIRUS_SCANNING" = "true" ]; then
  echo "Enabling virus scanning..."
  kubectl apply -f services/clamav/k8s/deployment.yaml
fi

# 6. Configure traffic routing
echo "Configuring production ingress..."
kubectl apply -f infrastructure/kubernetes/ingress-production.yaml

# 7. Start with 10% traffic
echo "Starting traffic ramp-up at 10%..."
kubectl annotate ingress email-production \
  nginx.ingress.kubernetes.io/canary-weight=10 \
  --overwrite

# 8. Enable production monitoring
echo "Activating production monitoring..."
kubectl apply -f infrastructure/monitoring/production-alerts.yaml

echo "=== Phase 3 Initial Deployment Complete ==="
echo "Traffic at 10%. Monitor closely."
echo "Dashboard: https://grafana.internal/d/phase3-production"
```

### Traffic Ramp-up Script

```bash
#!/bin/bash
# traffic-ramp.sh - Gradual traffic increase

CURRENT_WEIGHT=$1
TARGET_WEIGHT=$2

if [ -z "$CURRENT_WEIGHT" ] || [ -z "$TARGET_WEIGHT" ]; then
  echo "Usage: $0 <current_weight> <target_weight>"
  exit 1
fi

echo "Ramping traffic from ${CURRENT_WEIGHT}% to ${TARGET_WEIGHT}%"

# Verify metrics before ramp-up
echo "Checking current metrics..."
./scripts/check-health.sh
if [ $? -ne 0 ]; then
  echo "Health check failed. Aborting ramp-up."
  exit 1
fi

# Incremental ramp-up
STEP=5
for weight in $(seq $CURRENT_WEIGHT $STEP $TARGET_WEIGHT); do
  echo "Setting traffic weight to ${weight}%..."
  kubectl annotate ingress email-production \
    nginx.ingress.kubernetes.io/canary-weight=$weight \
    --overwrite

  echo "Waiting 5 minutes for stabilization..."
  sleep 300

  # Check metrics
  ./scripts/check-health.sh
  if [ $? -ne 0 ]; then
    echo "Health check failed at ${weight}%. Rolling back..."
    kubectl annotate ingress email-production \
      nginx.ingress.kubernetes.io/canary-weight=$CURRENT_WEIGHT \
      --overwrite
    exit 1
  fi
done

echo "Successfully ramped to ${TARGET_WEIGHT}%"
```

### Success Criteria

| Metric                  | Target   | Measurement            |
| ----------------------- | -------- | ---------------------- |
| Uptime                  | >99.9%   | Prometheus `up` metric |
| API Response Time (p95) | <300ms   | Grafana dashboard      |
| API Response Time (p99) | <500ms   | Grafana dashboard      |
| Error Rate              | <0.1%    | Log aggregation        |
| Email Delivery          | >99.5%   | Delivery reports       |
| Support Tickets         | <50/week | Ticket system          |
| Customer Satisfaction   | >4.0/5.0 | Survey                 |

### Go/No-Go Decision

**Phase 3 → Phase 4 (GA) Approval:**

| Criteria                             | Required | Actual | Pass? |
| ------------------------------------ | -------- | ------ | ----- |
| All success criteria met for 7+ days | Yes      |        | [ ]   |
| Traffic at 100% for 3+ days          | Yes      |        | [ ]   |
| Zero P1 incidents                    | Yes      |        | [ ]   |
| Support team capacity confirmed      | Yes      |        | [ ]   |
| Marketing materials ready            | Yes      |        | [ ]   |
| SLA commitments validated            | Yes      |        | [ ]   |

**Decision:**

- [ ] **GO** - Proceed to General Availability
- [ ] **NO-GO** - Address issues and re-evaluate

**Approved by:** ******\_\_\_****** **Date:** ******\_\_\_******

---

## Phase 4: General Availability

### Objective

Full production deployment with public availability and SLA commitments.

### Timeline

- **Start Date:** ******\_******
- **Ongoing operation**

### Target Audience

- All customers
- **Total Users:** Unlimited (capacity-based)

### GA Announcement Checklist

| Task                       | Owner     | Status | Notes                 |
| -------------------------- | --------- | ------ | --------------------- |
| Phase 3 sign-off complete  | Team      | [ ]    | All criteria met      |
| Press release drafted      | Marketing | [ ]    | Approved by legal     |
| Documentation site live    | Docs      | [ ]    | docs.yourdomain.com   |
| Support channels scaled    | Support   | [ ]    | 24/7 coverage         |
| Marketing campaign ready   | Marketing | [ ]    | Email, social, PR     |
| Partner notifications sent | BD        | [ ]    | Integration partners  |
| Status page public         | Ops       | [ ]    | status.yourdomain.com |

### GA Deployment

```bash
#!/bin/bash
# Phase 4 GA Deployment Script

set -e

echo "=== Phase 4: General Availability Deployment ==="

# 1. Verify Phase 3 sign-off
if [ ! -f ".phase3-signoff" ]; then
  echo "ERROR: Phase 3 sign-off not found. Aborting."
  exit 1
fi

# 2. Final backup
echo "Creating GA launch backup..."
./scripts/backups/backup-postgres.sh --tag="ga-launch"

# 3. Remove canary configuration
echo "Removing traffic restrictions..."
kubectl annotate ingress email-production \
  nginx.ingress.kubernetes.io/canary-weight- \
  --overwrite

# 4. Enable auto-scaling
echo "Enabling horizontal pod autoscaling..."
kubectl apply -f infrastructure/kubernetes/hpa-production.yaml

# 5. Update DNS for public access
echo "DNS updates required (manual step)"
echo "Please update the following DNS records:"
echo "  - mail.yourdomain.com -> production LB IP"
echo "  - smtp.yourdomain.com -> production SMTP IP"
echo "  - imap.yourdomain.com -> production IMAP IP"

# 6. Enable public status page
echo "Enabling public status page..."
kubectl apply -f infrastructure/kubernetes/statuspage.yaml

# 7. Update feature flags
echo "Enabling all GA features..."
kubectl apply -f infrastructure/kubernetes/configmap-ga.yaml

# 8. Notify stakeholders
echo "Sending GA announcement..."
./scripts/send-ga-announcement.sh

echo "=== General Availability Deployment Complete ==="
echo "🎉 Enterprise Email Platform is now GA!"
echo "Public URL: https://mail.yourdomain.com"
echo "Status Page: https://status.yourdomain.com"
```

### SLA Commitments

| Service         | Availability Target | Support Response |
| --------------- | ------------------- | ---------------- |
| Web Application | 99.9%               | 4 hours (P1)     |
| SMTP Service    | 99.9%               | 1 hour (P1)      |
| IMAP Service    | 99.9%               | 2 hours (P1)     |
| API             | 99.9%               | 2 hours (P1)     |
| Admin Portal    | 99.5%               | 8 hours (P1)     |

### Ongoing Monitoring

```yaml
# GA Monitoring Configuration
monitoring:
  dashboards:
    - system-overview
    - email-flow
    - domain-health
    - user-activity
    - performance

  alerts:
    critical:
      - service_down
      - database_unreachable
      - email_queue_backlog
    warning:
      - high_latency
      - error_rate_elevated
      - disk_space_low
    info:
      - deployment_complete
      - config_change

  sla_tracking:
    enabled: true
    report_frequency: daily
    stakeholders:
      - ops-team@company.com
      - management@company.com
```

---

## Rollback Procedures

### Automated Rollback Triggers

The following conditions trigger automatic rollback:

```yaml
# Rollback trigger configuration
rollback:
  automatic:
    error_rate_threshold: 1%
    error_rate_window: 5m
    latency_p95_threshold: 1000ms
    latency_window: 15m
    delivery_rate_threshold: 98%
    delivery_window: 1h

  manual_approval_required:
    - data_corruption
    - security_incident
    - partial_service_outage
```

### Phase-Specific Rollback

#### Phase 1 Rollback (Alpha → Pre-Alpha)

```bash
#!/bin/bash
# rollback-phase1.sh

echo "=== Rolling back Phase 1 (Alpha) ==="

# 1. Alert team
./scripts/send-alert.sh "ROLLBACK: Phase 1 Alpha"

# 2. Restore database
./scripts/backups/restore-postgres.sh /backups/pre-alpha/latest.sql.gz

# 3. Revert deployments
kubectl rollout undo deployment/auth -n email-production
kubectl rollout undo deployment/smtp-server -n email-production
kubectl rollout undo deployment/imap-server -n email-production
kubectl rollout undo deployment/web -n email-production

# 4. Disable alpha ingress
kubectl delete -f infrastructure/kubernetes/ingress-alpha.yaml

echo "=== Phase 1 Rollback Complete ==="
```

#### Phase 2 Rollback (Beta → Alpha)

```bash
#!/bin/bash
# rollback-phase2.sh

echo "=== Rolling back Phase 2 (Beta → Alpha) ==="

# 1. Alert team and beta users
./scripts/send-alert.sh "ROLLBACK: Phase 2 Beta to Alpha"
./scripts/notify-beta-users.sh --status=maintenance

# 2. Restore alpha configuration
kubectl apply -f infrastructure/kubernetes/configmap-alpha.yaml

# 3. Scale down to alpha levels
kubectl scale deployment auth --replicas=2 -n email-production
kubectl scale deployment smtp-server --replicas=2 -n email-production
kubectl scale deployment imap-server --replicas=2 -n email-production
kubectl scale deployment web --replicas=2 -n email-production

# 4. Revert to alpha ingress
kubectl apply -f infrastructure/kubernetes/ingress-alpha.yaml

# 5. Rolling restart
kubectl rollout restart deployment -n email-production

echo "=== Phase 2 Rollback Complete ==="
```

#### Phase 3 Rollback (Limited → Beta)

```bash
#!/bin/bash
# rollback-phase3.sh

CURRENT_TRAFFIC=$1

echo "=== Rolling back Phase 3 (Limited Production → Beta) ==="

# 1. Critical alert
./scripts/send-alert.sh "CRITICAL ROLLBACK: Phase 3 Production to Beta" --level=critical

# 2. Reduce traffic immediately
echo "Reducing traffic to 0%..."
kubectl annotate ingress email-production \
  nginx.ingress.kubernetes.io/canary-weight=0 \
  --overwrite

# 3. Notify affected customers
./scripts/notify-customers.sh --status=maintenance --severity=high

# 4. Restore beta configuration
kubectl apply -f infrastructure/kubernetes/configmap-beta.yaml

# 5. Scale down
kubectl scale deployment auth --replicas=3 -n email-production
kubectl scale deployment smtp-server --replicas=3 -n email-production
kubectl scale deployment imap-server --replicas=3 -n email-production
kubectl scale deployment web --replicas=3 -n email-production

# 6. Restore beta ingress
kubectl apply -f infrastructure/kubernetes/ingress-beta.yaml

echo "=== Phase 3 Rollback Complete ==="
echo "Service restored to beta configuration"
```

#### Phase 4 Rollback (GA → Limited)

```bash
#!/bin/bash
# rollback-phase4.sh

echo "=== Rolling back Phase 4 (GA → Limited Production) ==="

# 1. CRITICAL alert - all hands
./scripts/send-alert.sh "CRITICAL: GA Rollback in progress" --level=p1

# 2. Update status page
./scripts/update-status-page.sh --status=major-outage

# 3. Disable auto-scaling
kubectl delete -f infrastructure/kubernetes/hpa-production.yaml

# 4. Re-enable traffic controls
kubectl annotate ingress email-production \
  nginx.ingress.kubernetes.io/canary-weight=50 \
  --overwrite

# 5. Notify all customers
./scripts/notify-customers.sh --all --status=degraded

# 6. Engage incident response
./scripts/start-incident.sh --severity=p1

echo "=== Phase 4 Rollback Initiated ==="
echo "Incident response engaged. Follow incident procedure."
```

---

## Communication Plan

### Internal Communications

| Phase   | Channel              | Frequency | Content         |
| ------- | -------------------- | --------- | --------------- |
| Alpha   | Slack #alpha-rollout | Real-time | All updates     |
| Beta    | Slack #beta-rollout  | Daily     | Metrics, issues |
| Limited | Slack #prod-rollout  | 4x daily  | Status updates  |
| GA      | Slack #production    | As needed | Major updates   |

### External Communications

| Phase    | Audience        | Channel            | Content                    |
| -------- | --------------- | ------------------ | -------------------------- |
| Beta     | Beta users      | Email, Slack       | Welcome, feedback requests |
| Limited  | Early customers | Email              | Migration status           |
| GA       | All customers   | Email, Blog        | GA announcement            |
| Incident | Affected users  | Status page, Email | Incident updates           |

### Escalation Matrix

| Severity      | Response Time | Escalation Path                  |
| ------------- | ------------- | -------------------------------- |
| P1 (Critical) | 15 min        | On-call → Engineering Lead → CTO |
| P2 (High)     | 1 hour        | On-call → Engineering Lead       |
| P3 (Medium)   | 4 hours       | On-call → Team Lead              |
| P4 (Low)      | 24 hours      | Queue → Next business day        |

---

## Appendix

### Phase Transition Checklist Template

```markdown
# Phase [X] → Phase [X+1] Transition

## Pre-Transition

- [ ] All Phase [X] success criteria met
- [ ] Sign-off from all stakeholders
- [ ] Backup created and verified
- [ ] Communication sent to affected parties
- [ ] Support team briefed

## During Transition

- [ ] Deployment scripts executed
- [ ] Configuration applied
- [ ] Health checks passing
- [ ] Monitoring confirmed active
- [ ] Initial traffic verified

## Post-Transition

- [ ] All services healthy
- [ ] Metrics within acceptable range
- [ ] User feedback collected
- [ ] Issues documented
- [ ] Next phase planning started
```

### Metrics Dashboard URLs

| Dashboard       | URL                   | Purpose          |
| --------------- | --------------------- | ---------------- |
| System Overview | `/d/system-overview`  | Overall health   |
| Phase Progress  | `/d/rollout-progress` | Rollout metrics  |
| Email Flow      | `/d/email-flow`       | Delivery metrics |
| Error Tracking  | `/d/error-tracking`   | Error analysis   |
| User Experience | `/d/user-experience`  | UX metrics       |

---

**Document Maintained By:** DevOps & Engineering Teams **Review Frequency:** Before each phase
transition **Next Review:** Before Phase 1 start
