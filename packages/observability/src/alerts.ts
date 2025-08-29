import { getTelemetry } from './telemetry.js';

export interface AlertRule {
  name: string;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'ne';
  duration: string; // e.g., '5m', '10s'
  severity: 'critical' | 'warning' | 'info';
  description: string;
  runbook?: string;
}

export interface AlertChannel {
  type: 'webhook' | 'email' | 'slack';
  config: Record<string, any>;
}

export class AlertManager {
  private rules: AlertRule[] = [];
  private channels: AlertChannel[] = [];

  constructor() {
    // Default alert rules for CEERION Mail
    this.addDefaultRules();
  }

  private addDefaultRules(): void {
    this.rules = [
      {
        name: 'SMTP Queue Backlog',
        metric: 'ceerion_smtp_queue_size',
        threshold: 1000,
        operator: 'gt',
        duration: '5m',
        severity: 'critical',
        description: 'SMTP queue backlog exceeds 1000 emails for 5 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/smtp-queue-backlog',
      },
      {
        name: 'High DMARC Failure Rate',
        metric: 'rate(ceerion_dmarc_reports_total{disposition="reject"}[5m])',
        threshold: 0.1, // 10% failure rate
        operator: 'gt',
        duration: '10m',
        severity: 'warning',
        description: 'DMARC failure rate exceeds 10% for 10 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/dmarc-failures',
      },
      {
        name: 'TLS-RPT Failure Spike',
        metric: 'rate(ceerion_tls_rpt_reports_total{result="failure"}[5m])',
        threshold: 0.05, // 5% failure rate
        operator: 'gt',
        duration: '15m',
        severity: 'warning',
        description: 'TLS-RPT failure rate exceeds 5% for 15 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/tls-failures',
      },
      {
        name: 'High Authentication Failure Rate',
        metric: 'rate(ceerion_auth_attempts_total{status="failure"}[5m])',
        threshold: 0.2, // 20% failure rate
        operator: 'gt',
        duration: '5m',
        severity: 'warning',
        description: 'Authentication failure rate exceeds 20% for 5 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/auth-failures',
      },
      {
        name: 'Indexer High Latency',
        metric: 'histogram_quantile(0.95, rate(ceerion_indexer_latency_seconds_bucket[5m]))',
        threshold: 2.0, // 2 seconds
        operator: 'gt',
        duration: '10m',
        severity: 'warning',
        description: '95th percentile indexer latency exceeds 2 seconds for 10 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/indexer-latency',
      },
      {
        name: 'SMTP Processing High Latency',
        metric: 'histogram_quantile(0.95, rate(ceerion_smtp_processing_duration_seconds_bucket[5m]))',
        threshold: 30.0, // 30 seconds
        operator: 'gt',
        duration: '10m',
        severity: 'critical',
        description: '95th percentile SMTP processing time exceeds 30 seconds for 10 minutes',
        runbook: 'https://docs.ceerion.com/runbooks/smtp-latency',
      },
    ];
  }

  public addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  public addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  public getRules(): AlertRule[] {
    return [...this.rules];
  }

  public getChannels(): AlertChannel[] {
    return [...this.channels];
  }

  // Generate Prometheus alert rules YAML
  public generatePrometheusRules(): string {
    const groups = [
      {
        name: 'ceerion-mail-alerts',
        rules: this.rules.map(rule => ({
          alert: rule.name.replace(/\s+/g, ''),
          expr: rule.metric,
          for: rule.duration,
          labels: {
            severity: rule.severity,
          },
          annotations: {
            summary: rule.description,
            runbook_url: rule.runbook,
          },
        })),
      },
    ];

    return `groups:\n${groups.map(group => 
      `  - name: ${group.name}\n    rules:\n${group.rules.map(rule => 
        `      - alert: ${rule.alert}\n        expr: ${rule.expr}\n        for: ${rule.for}\n        labels:\n          severity: ${rule.labels.severity}\n        annotations:\n          summary: ${rule.annotations.summary}${rule.annotations.runbook_url ? `\n          runbook_url: ${rule.annotations.runbook_url}` : ''}`
      ).join('\n')}`
    ).join('\n')}`;
  }

  // Simulate alert firing for testing
  public async fireTestAlert(ruleName: string): Promise<void> {
    const rule = this.rules.find(r => r.name === ruleName);
    if (!rule) {
      throw new Error(`Alert rule '${ruleName}' not found`);
    }

    const telemetry = getTelemetry();
    
    // Inject test data based on rule type
    switch (ruleName) {
      case 'SMTP Queue Backlog':
        telemetry.recordSmtpQueueSize('outbound', 'high', 1500);
        break;
      case 'High DMARC Failure Rate':
        // Simulate multiple DMARC failures
        for (let i = 0; i < 20; i++) {
          telemetry.recordDmarcReport('test-domain.com', 'reject', 'reject');
        }
        break;
      case 'TLS-RPT Failure Spike':
        // Simulate TLS failures
        for (let i = 0; i < 10; i++) {
          telemetry.recordTlsRptReport('test-domain.com', 'enforce', 'failure');
        }
        break;
      case 'High Authentication Failure Rate':
        // Simulate auth failures
        for (let i = 0; i < 50; i++) {
          telemetry.recordAuthAttempt('password', 'failure', 'user');
        }
        break;
      case 'Indexer High Latency':
        telemetry.recordIndexerLatency('full-text', 3.5);
        break;
      case 'SMTP Processing High Latency':
        telemetry.recordSmtpProcessingTime('outbound', 'success', 45.0);
        break;
    }

    console.log(`🚨 Test alert fired: ${ruleName}`);
  }
}
