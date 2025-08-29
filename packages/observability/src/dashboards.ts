export interface GrafanaDashboard {
  id?: number;
  title: string;
  tags: string[];
  panels: GrafanaPanel[];
  time: {
    from: string;
    to: string;
  };
  refresh: string;
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: string;
  gridPos: {
    h: number;
    w: number;
    x: number;
    y: number;
  };
  targets: GrafanaTarget[];
  fieldConfig?: any;
  options?: any;
}

export interface GrafanaTarget {
  expr: string;
  legendFormat: string;
  refId: string;
}

export function createGrafanaDashboards(): Record<string, GrafanaDashboard> {
  return {
    'ceerion-mail-overview': createOverviewDashboard(),
    'ceerion-mail-smtp': createSmtpDashboard(),
    'ceerion-mail-security': createSecurityDashboard(),
    'ceerion-mail-performance': createPerformanceDashboard(),
  };
}

function createOverviewDashboard(): GrafanaDashboard {
  return {
    title: 'CEERION Mail - Overview',
    tags: ['ceerion', 'mail', 'overview'],
    time: { from: 'now-6h', to: 'now' },
    refresh: '30s',
    panels: [
      {
        id: 1,
        title: 'Mail Operations Rate',
        type: 'stat',
        gridPos: { h: 6, w: 8, x: 0, y: 0 },
        targets: [
          {
            expr: 'sum(rate(ceerion_mail_operations_total[5m]))',
            legendFormat: 'Ops/sec',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'ops',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 100 },
                { color: 'red', value: 500 },
              ],
            },
          },
        },
      },
      {
        id: 2,
        title: 'SMTP Queue Size',
        type: 'stat',
        gridPos: { h: 6, w: 8, x: 8, y: 0 },
        targets: [
          {
            expr: 'sum(ceerion_smtp_queue_size)',
            legendFormat: 'Queue Size',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'short',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 500 },
                { color: 'red', value: 1000 },
              ],
            },
          },
        },
      },
      {
        id: 3,
        title: 'Authentication Success Rate',
        type: 'stat',
        gridPos: { h: 6, w: 8, x: 16, y: 0 },
        targets: [
          {
            expr: 'sum(rate(ceerion_auth_attempts_total{status="success"}[5m])) / sum(rate(ceerion_auth_attempts_total[5m])) * 100',
            legendFormat: 'Success Rate %',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'red', value: null },
                { color: 'yellow', value: 80 },
                { color: 'green', value: 95 },
              ],
            },
          },
        },
      },
      {
        id: 4,
        title: 'Mail Operations by Type',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 6 },
        targets: [
          {
            expr: 'sum by (operation) (rate(ceerion_mail_operations_total[5m]))',
            legendFormat: '{{operation}}',
            refId: 'A',
          },
        ],
      },
      {
        id: 5,
        title: 'System Health',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 12, y: 6 },
        targets: [
          {
            expr: 'up{job="ceerion-api"}',
            legendFormat: 'API Health',
            refId: 'A',
          },
          {
            expr: 'up{job="postgres"}',
            legendFormat: 'Database Health',
            refId: 'B',
          },
          {
            expr: 'up{job="redis"}',
            legendFormat: 'Redis Health',
            refId: 'C',
          },
        ],
      },
    ],
  };
}

function createSmtpDashboard(): GrafanaDashboard {
  return {
    title: 'CEERION Mail - SMTP Performance',
    tags: ['ceerion', 'mail', 'smtp'],
    time: { from: 'now-1h', to: 'now' },
    refresh: '30s',
    panels: [
      {
        id: 1,
        title: 'SMTP Queue Size by Type',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        targets: [
          {
            expr: 'sum by (queue_type, priority) (ceerion_smtp_queue_size)',
            legendFormat: '{{queue_type}} - {{priority}}',
            refId: 'A',
          },
        ],
      },
      {
        id: 2,
        title: 'SMTP Processing Latency',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 12, y: 0 },
        targets: [
          {
            expr: 'histogram_quantile(0.50, sum(rate(ceerion_smtp_processing_duration_seconds_bucket[5m])) by (le))',
            legendFormat: '50th percentile',
            refId: 'A',
          },
          {
            expr: 'histogram_quantile(0.95, sum(rate(ceerion_smtp_processing_duration_seconds_bucket[5m])) by (le))',
            legendFormat: '95th percentile',
            refId: 'B',
          },
          {
            expr: 'histogram_quantile(0.99, sum(rate(ceerion_smtp_processing_duration_seconds_bucket[5m])) by (le))',
            legendFormat: '99th percentile',
            refId: 'C',
          },
        ],
      },
      {
        id: 3,
        title: 'SMTP Processing Rate',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 8 },
        targets: [
          {
            expr: 'sum by (status) (rate(ceerion_smtp_processing_duration_seconds_count[5m]))',
            legendFormat: '{{status}}',
            refId: 'A',
          },
        ],
      },
      {
        id: 4,
        title: 'SMTP Error Rate',
        type: 'stat',
        gridPos: { h: 8, w: 12, x: 12, y: 8 },
        targets: [
          {
            expr: 'sum(rate(ceerion_smtp_processing_duration_seconds_count{status="failure"}[5m])) / sum(rate(ceerion_smtp_processing_duration_seconds_count[5m])) * 100',
            legendFormat: 'Error Rate %',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 1 },
                { color: 'red', value: 5 },
              ],
            },
          },
        },
      },
    ],
  };
}

function createSecurityDashboard(): GrafanaDashboard {
  return {
    title: 'CEERION Mail - Security & Compliance',
    tags: ['ceerion', 'mail', 'security'],
    time: { from: 'now-24h', to: 'now' },
    refresh: '1m',
    panels: [
      {
        id: 1,
        title: 'DMARC Reports by Policy',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        targets: [
          {
            expr: 'sum by (policy, disposition) (rate(ceerion_dmarc_reports_total[5m]))',
            legendFormat: '{{policy}} - {{disposition}}',
            refId: 'A',
          },
        ],
      },
      {
        id: 2,
        title: 'TLS-RPT Success Rate',
        type: 'stat',
        gridPos: { h: 8, w: 12, x: 12, y: 0 },
        targets: [
          {
            expr: 'sum(rate(ceerion_tls_rpt_reports_total{result="success"}[5m])) / sum(rate(ceerion_tls_rpt_reports_total[5m])) * 100',
            legendFormat: 'TLS Success Rate %',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'red', value: null },
                { color: 'yellow', value: 90 },
                { color: 'green', value: 98 },
              ],
            },
          },
        },
      },
      {
        id: 3,
        title: 'Authentication Attempts by Method',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 8 },
        targets: [
          {
            expr: 'sum by (method, status) (rate(ceerion_auth_attempts_total[5m]))',
            legendFormat: '{{method}} - {{status}}',
            refId: 'A',
          },
        ],
      },
      {
        id: 4,
        title: 'Failed Authentication Rate',
        type: 'stat',
        gridPos: { h: 8, w: 12, x: 12, y: 8 },
        targets: [
          {
            expr: 'sum(rate(ceerion_auth_attempts_total{status="failure"}[5m])) / sum(rate(ceerion_auth_attempts_total[5m])) * 100',
            legendFormat: 'Auth Failure Rate %',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            color: { mode: 'thresholds' },
            thresholds: {
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 5 },
                { color: 'red', value: 20 },
              ],
            },
          },
        },
      },
    ],
  };
}

function createPerformanceDashboard(): GrafanaDashboard {
  return {
    title: 'CEERION Mail - Performance Metrics',
    tags: ['ceerion', 'mail', 'performance'],
    time: { from: 'now-1h', to: 'now' },
    refresh: '30s',
    panels: [
      {
        id: 1,
        title: 'Indexer Latency',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        targets: [
          {
            expr: 'histogram_quantile(0.50, sum(rate(ceerion_indexer_latency_seconds_bucket[5m])) by (le, index_type))',
            legendFormat: '{{index_type}} - 50th percentile',
            refId: 'A',
          },
          {
            expr: 'histogram_quantile(0.95, sum(rate(ceerion_indexer_latency_seconds_bucket[5m])) by (le, index_type))',
            legendFormat: '{{index_type}} - 95th percentile',
            refId: 'B',
          },
        ],
      },
      {
        id: 2,
        title: 'API Response Time',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 12, y: 0 },
        targets: [
          {
            expr: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="ceerion-api"}[5m])) by (le, method, route))',
            legendFormat: '{{method}} {{route}} - 95th percentile',
            refId: 'A',
          },
        ],
      },
      {
        id: 3,
        title: 'Database Connection Pool',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 0, y: 8 },
        targets: [
          {
            expr: 'pg_pool_size{job="ceerion-api"}',
            legendFormat: 'Pool Size',
            refId: 'A',
          },
          {
            expr: 'pg_pool_used{job="ceerion-api"}',
            legendFormat: 'Used Connections',
            refId: 'B',
          },
          {
            expr: 'pg_pool_waiting{job="ceerion-api"}',
            legendFormat: 'Waiting Connections',
            refId: 'C',
          },
        ],
      },
      {
        id: 4,
        title: 'Memory Usage',
        type: 'timeseries',
        gridPos: { h: 8, w: 12, x: 12, y: 8 },
        targets: [
          {
            expr: 'process_resident_memory_bytes{job="ceerion-api"}',
            legendFormat: 'Resident Memory',
            refId: 'A',
          },
          {
            expr: 'nodejs_heap_size_used_bytes{job="ceerion-api"}',
            legendFormat: 'Heap Used',
            refId: 'B',
          },
          {
            expr: 'nodejs_heap_size_total_bytes{job="ceerion-api"}',
            legendFormat: 'Heap Total',
            refId: 'C',
          },
        ],
      },
    ],
  };
}
