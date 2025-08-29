# CEERION Mail - Observability & CI Guide

## 🎯 Overview

This guide covers the comprehensive end-to-end observability and CI/CD pipeline for CEERION Mail, including:

- **OpenTelemetry tracing** around auth/list/read/send operations
- **Prometheus metrics** for SMTP queues, indexer latencies
- **Grafana dashboards** with real-time visualization
- **Alert management** for queue backlog & DMARC/TLS-RPT failure spikes
- **Hard CI gates** with performance budgets and accessibility testing

## 🏗️ Architecture

```mermaid
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CEERION API   │───▶│ OpenTelemetry   │───▶│    Jaeger       │
│                 │    │   Collector     │    │   (Traces)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Prometheus    │    │     Loki        │    │    Grafana      │
│   (Metrics)     │    │    (Logs)       │    │  (Dashboards)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│  AlertManager   │                          │   CI Pipeline   │
│   (Alerts)      │                          │  (Hard Gates)   │
└─────────────────┘                          └─────────────────┘
```

## 🚀 Quick Start

### 1. Start Observability Stack

```bash
# Start monitoring infrastructure
pnpm monitoring:up

# Check all services are running
docker ps | grep ceerion
```

**Services Available:**

- Grafana: <http://localhost:3000> (admin/ceerion123)
- Prometheus: <http://localhost:9090>
- Jaeger: <http://localhost:16686>
- AlertManager: <http://localhost:9093>

### 2. Start CEERION Applications

```bash
# Start development infrastructure
pnpm dev:infra

# Start all applications with telemetry
pnpm dev
```

### 3. Run CI Pipeline Locally

```bash
# Run all CI checks
pnpm test:smoke        # Playwright smoke tests
pnpm test:lighthouse   # Performance budgets
pnpm test:a11y         # Accessibility tests
pnpm test:contract-drift # Contract validation
```

## 📊 Observability Features

### OpenTelemetry Traces

**Instrumented Operations:**

- Authentication flows (`auth/login`, `auth/logout`)
- Mail operations (`mail/list`, `mail/read`, `mail/send`)
- Admin operations (`admin/users`, `admin/deliverability`)
- Database queries (Prisma auto-instrumentation)
- HTTP requests (Fastify auto-instrumentation)

**Usage Example:**

```typescript
import { getTelemetry } from '@ceerion/observability';

const telemetry = getTelemetry();

// Wrap operations with tracing
await telemetry.withSpan('mail-send-operation', async (span) => {
  span.setAttributes({
    'mail.recipient': email.to,
    'mail.subject': email.subject,
    'mail.size': email.body.length,
  });
  
  const result = await sendEmail(email);
  return result;
});
```

### Prometheus Metrics

**Key Metrics:**

- `ceerion_smtp_queue_size` - Number of emails in SMTP queue
- `ceerion_smtp_processing_duration_seconds` - SMTP processing latency
- `ceerion_auth_attempts_total` - Authentication attempts by status
- `ceerion_mail_operations_total` - Mail operations (list/read/send)
- `ceerion_indexer_latency_seconds` - Mail indexing latency
- `ceerion_dmarc_reports_total` - DMARC reports by disposition
- `ceerion_tls_rpt_reports_total` - TLS-RPT reports by result

**Custom Metrics:**

```typescript
const telemetry = getTelemetry();

// Record SMTP queue size
telemetry.recordSmtpQueueSize('outbound', 'high', 150);

// Record mail operations
telemetry.recordMailOperation('send', 'success', 'user123');

// Record indexer performance
telemetry.recordIndexerLatency('full-text', 0.8);
```

### Grafana Dashboards

**Pre-configured Dashboards:**

1. **CEERION Mail Overview** - High-level system health
2. **SMTP Performance** - Queue sizes, processing times, error rates
3. **Security & Compliance** - DMARC/TLS-RPT reports, auth failures
4. **Performance Metrics** - Indexer latency, API response times

**Access:** <http://localhost:3000> (admin/ceerion123)

### Alert Rules

**Critical Alerts:**

- SMTP Queue Backlog (>1000 emails for 5m)
- High DMARC Failure Rate (>10% for 10m)
- TLS-RPT Failure Spike (>5% for 15m)
- High Auth Failure Rate (>20% for 5m)
- Indexer High Latency (>2s p95 for 10m)
- SMTP Processing High Latency (>30s p95 for 10m)

**Alert Channels:**

- Email notifications to SRE team
- Slack webhooks for critical alerts
- Webhook integration for custom handling

## 🔍 CI/CD Pipeline

### Hard CI Gates

The CI pipeline enforces strict quality gates that **must pass** for deployment:

#### 1. Contract Drift Detection

```bash
pnpm test:contract-drift
```

- Validates OpenAPI spec integrity
- Ensures SDK types match API schemas
- Checks for undocumented API endpoints
- Fails if contracts diverge

#### 2. Playwright Smoke Tests

```bash
pnpm test:smoke
```

- Tests **EVERY visible primary control** in Webmail/Admin
- Asserts network calls and toast notifications
- Covers critical user flows end-to-end
- Runs against real backend services

#### 3. Lighthouse Performance Budgets

```bash
pnpm test:lighthouse
```

**Strict Budgets:**

- **LCP ≤ 2.2s** (Largest Contentful Paint)
- **INP ≤ 200ms** (Interaction to Next Paint)
- **CLS ≤ 0.1** (Cumulative Layout Shift)
- **Performance Score ≥ 90**

#### 4. Accessibility Testing

```bash
pnpm test:a11y
```

- **WCAG 2.1 AA compliance** with axe-core
- Tests Inbox/Thread/Compose + Admin Users/Deliverability
- Validates keyboard navigation
- Checks screen reader compatibility

### CI Pipeline Jobs

```yaml
lint-and-typecheck     → contract-drift → backend-tests
                      ↘                 ↗
                        e2e-smoke → lighthouse-budgets
                                  ↘               ↗
                                   accessibility ↗
                                            ↓
                                      all-checks
```

**Pipeline Features:**

- **Parallel execution** for faster feedback
- **Service dependencies** (PostgreSQL, Redis)
- **Artifact collection** (reports, screenshots)
- **Fail-fast** on critical errors

## 🧪 Testing & Validation

### Synthetic Alert Testing

Test monitoring pipeline with injected failures:

```bash
# Test specific alert
node scripts/synthetic-alert-test.js smtp-queue

# Test all alerts
node scripts/synthetic-alert-test.js all
```

**Available Tests:**

- `smtp-queue` - Inject high queue backlog
- `dmarc-failure` - Simulate DMARC failures
- `tls-failure` - Inject TLS-RPT failures
- `auth-failure` - Simulate authentication failures
- `indexer-latency` - Inject high indexer latency
- `smtp-latency` - Simulate SMTP processing delays

### Performance Budget Validation

```bash
# Test Webmail performance
pnpm --filter @ceerion/e2e-tests test --grep "Webmail.*Performance"

# Test Admin performance
pnpm --filter @ceerion/e2e-tests test --grep "Admin.*Performance"

# Mobile performance
pnpm --filter @ceerion/e2e-tests test --grep "Mobile.*Performance"
```

### Accessibility Validation

```bash
# Test specific pages
pnpm --filter @ceerion/e2e-tests test --grep "Inbox.*Accessibility"
pnpm --filter @ceerion/e2e-tests test --grep "Admin Users.*Accessibility"

# Test color contrast
pnpm --filter @ceerion/e2e-tests test --grep "Color Contrast"

# Test keyboard navigation
pnpm --filter @ceerion/e2e-tests test --grep "Keyboard Navigation"
```

## 📈 Monitoring Best Practices

### 1. Metrics Collection

**DO:**

- Use histogram buckets appropriate for your latency ranges
- Include relevant labels (user_type, operation, status)
- Record both success and failure metrics
- Use consistent naming conventions

**DON'T:**

- Create high-cardinality metrics (e.g., user IDs as labels)
- Over-instrument (every function call)
- Ignore metric cleanup and retention

### 2. Alerting Strategy

**Alert Hierarchy:**

1. **Critical** - Service down, data loss risk
2. **Warning** - Performance degradation, capacity issues
3. **Info** - Deployment notifications, scheduled maintenance

**Alert Fatigue Prevention:**

- Set appropriate thresholds based on historical data
- Use alert suppression during maintenance
- Implement escalation policies
- Regular alert rule review and tuning

### 3. Dashboard Design

**Effective Dashboards:**

- Start with high-level overview, drill down to details
- Use consistent time ranges and refresh intervals
- Include SLO/SLI tracking
- Annotate deployments and incidents

## 🔧 Configuration

### Environment Variables

```bash
# OpenTelemetry configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=ceerion-api
OTEL_SERVICE_VERSION=1.0.0

# Prometheus configuration
PROMETHEUS_ENABLED=true

# CI configuration
CI=true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ceerion_mail_test
REDIS_URL=redis://localhost:6379
```

### Alert Configuration

Edit `monitoring/alertmanager.yml` to configure:

- Email recipients
- Slack webhook URLs
- Alert routing rules
- Notification templates

### Dashboard Customization

Add custom dashboards to:

- `monitoring/grafana/dashboards/` - JSON dashboard files
- Update `monitoring/grafana/provisioning/dashboards/dashboards.yml`

## 🚨 Troubleshooting

### Common Issues

**Metrics not appearing:**

1. Check telemetry initialization in API
2. Verify Prometheus scrape configuration
3. Check network connectivity between services

**Alerts not firing:**

1. Validate metric thresholds in `monitoring/alert-rules.yml`
2. Check AlertManager configuration
3. Test with synthetic alert injection

**CI pipeline failures:**

1. Check service health (PostgreSQL, Redis)
2. Verify environment variables
3. Check test data setup

**Performance budget failures:**

1. Profile slow components with React DevTools
2. Check bundle size and code splitting
3. Optimize images and static assets

### Debug Commands

```bash
# Check metric endpoint
curl http://localhost:4000/metrics

# Test alert rules
promtool check rules monitoring/alert-rules.yml

# Validate Grafana config
docker exec ceerion-grafana grafana-cli admin reset-admin-password admin

# Check OpenTelemetry traces
curl http://localhost:16686/api/traces?service=ceerion-api
```

## 📚 References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Dashboard Design](https://grafana.com/docs/grafana/latest/best-practices/)
- [Playwright Testing Guide](https://playwright.dev/docs/best-practices)
- [Lighthouse Performance Budgets](https://web.dev/lighthouse-performance-budgets/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## 🎉 Acceptance Criteria

✅ **CI is green only if budgets pass**

- Performance budgets: LCP ≤ 2.2s, INP ≤ 200ms
- Accessibility compliance: WCAG 2.1 AA
- Contract integrity maintained

✅ **Dashboards show traces/metrics**

- Real-time SMTP queue monitoring
- DMARC/TLS-RPT compliance tracking
- Performance and error rate visualization

✅ **Synthetic alert fires on injected DMARC failure**

- Automated alert testing capability
- End-to-end monitoring validation
- Alert routing and notification verification

### Ready for Production! 🚀
