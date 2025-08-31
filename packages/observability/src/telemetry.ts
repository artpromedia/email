import { metrics, trace, SpanStatusCode } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { register, Counter, Histogram, Gauge } from "prom-client";

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  prometheusEnabled?: boolean;
}

export class Telemetry {
  private sdk: NodeSDK;
  private tracer: ReturnType<typeof trace.getTracer>;
  private meter: ReturnType<typeof metrics.getMeter>;

  // Prometheus metrics
  public readonly smtpQueueSize!: Gauge<string>;
  public readonly smtpQueueProcessingTime!: Histogram<string>;
  public readonly authAttempts!: Counter<string>;
  public readonly mailOperations!: Counter<string>;
  public readonly indexerLatency!: Histogram<string>;
  public readonly dmarcReports!: Counter<string>;
  public readonly tlsRptReports!: Counter<string>;

  constructor(config: TelemetryConfig) {
    // Initialize OpenTelemetry SDK
    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]:
          config.serviceVersion || "1.0.0",
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
          config.environment || "development",
      }),
      traceExporter: config.otlpEndpoint
        ? new OTLPTraceExporter({
            url: `${config.otlpEndpoint}/v1/traces`,
          })
        : undefined,
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": {
            enabled: false, // Reduces noise
          },
        }),
      ],
    });

    this.tracer = trace.getTracer(config.serviceName);
    this.meter = metrics.getMeter(config.serviceName);

    // Initialize Prometheus metrics
    if (config.prometheusEnabled !== false) {
      this.smtpQueueSize = new Gauge({
        name: "ceerion_smtp_queue_size",
        help: "Number of emails in SMTP queue",
        labelNames: ["queue_type", "priority"],
      });

      this.smtpQueueProcessingTime = new Histogram({
        name: "ceerion_smtp_processing_duration_seconds",
        help: "Time spent processing SMTP queue items",
        labelNames: ["queue_type", "status"],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      });

      this.authAttempts = new Counter({
        name: "ceerion_auth_attempts_total",
        help: "Total authentication attempts",
        labelNames: ["method", "status", "user_type"],
      });

      this.mailOperations = new Counter({
        name: "ceerion_mail_operations_total",
        help: "Total mail operations (list, read, send)",
        labelNames: ["operation", "status", "user_id"],
      });

      this.indexerLatency = new Histogram({
        name: "ceerion_indexer_latency_seconds",
        help: "Mail indexing latency",
        labelNames: ["index_type"],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      });

      this.dmarcReports = new Counter({
        name: "ceerion_dmarc_reports_total",
        help: "DMARC reports processed",
        labelNames: ["domain", "policy", "disposition"],
      });

      this.tlsRptReports = new Counter({
        name: "ceerion_tls_rpt_reports_total",
        help: "TLS-RPT reports processed",
        labelNames: ["domain", "policy", "result"],
      });
    }
  }

  public start(): void {
    this.sdk.start();
  }

  public async shutdown(): Promise<void> {
    await this.sdk.shutdown();
  }

  // Tracing utilities
  public withSpan<T>(
    name: string,
    fn: (span: any) => Promise<T> | T,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    });
  }

  public recordAuthAttempt(
    method: string,
    status: "success" | "failure",
    userType: string,
  ): void {
    this.authAttempts?.inc({ method, status, user_type: userType });
  }

  public recordMailOperation(
    operation: "list" | "read" | "send" | "compose",
    status: "success" | "failure",
    userId: string,
  ): void {
    this.mailOperations?.inc({ operation, status, user_id: userId });
  }

  public recordSmtpQueueSize(
    queueType: string,
    priority: string,
    size: number,
  ): void {
    this.smtpQueueSize?.set({ queue_type: queueType, priority }, size);
  }

  public recordSmtpProcessingTime(
    queueType: string,
    status: "success" | "failure",
    durationSeconds: number,
  ): void {
    this.smtpQueueProcessingTime?.observe(
      { queue_type: queueType, status },
      durationSeconds,
    );
  }

  public recordIndexerLatency(indexType: string, latencySeconds: number): void {
    this.indexerLatency?.observe({ index_type: indexType }, latencySeconds);
  }

  public recordDmarcReport(
    domain: string,
    policy: string,
    disposition: string,
  ): void {
    this.dmarcReports?.inc({ domain, policy, disposition });
  }

  public recordTlsRptReport(
    domain: string,
    policy: string,
    result: string,
  ): void {
    this.tlsRptReports?.inc({ domain, policy, result });
  }

  // Get Prometheus metrics endpoint
  public async getPrometheusMetrics(): Promise<string> {
    return register.metrics();
  }
}

// Singleton instance
let telemetryInstance: Telemetry | null = null;

export function initTelemetry(config: TelemetryConfig): Telemetry {
  if (telemetryInstance) {
    throw new Error("Telemetry already initialized");
  }
  telemetryInstance = new Telemetry(config);
  telemetryInstance.start();
  return telemetryInstance;
}

export function getTelemetry(): Telemetry {
  if (!telemetryInstance) {
    throw new Error("Telemetry not initialized. Call initTelemetry() first.");
  }
  return telemetryInstance;
}
