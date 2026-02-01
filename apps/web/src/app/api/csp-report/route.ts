/**
 * CSP Violation Report Endpoint
 *
 * Receives and logs Content Security Policy violation reports.
 * Reports are sent by browsers when CSP rules are violated.
 */

import { type NextRequest, NextResponse } from "next/server";

/**
 * CSP Violation Report structure (as sent by browsers)
 */
interface CSPViolationReport {
  "csp-report"?: {
    "document-uri"?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    disposition?: string;
    "blocked-uri"?: string;
    "status-code"?: number;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
    "script-sample"?: string;
    referrer?: string;
  };
  // Report-To API format
  type?: string;
  age?: number;
  url?: string;
  user_agent?: string;
  body?: {
    documentURL?: string;
    violatedDirective?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    disposition?: string;
    blockedURL?: string;
    statusCode?: number;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    sample?: string;
    referrer?: string;
  };
}

/**
 * Normalized violation report for logging
 */
interface NormalizedViolation {
  timestamp: string;
  documentUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  blockedUri: string;
  disposition: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
  referrer?: string;
  userAgent?: string;
  clientIp?: string;
}

/**
 * Normalize violation report from different formats
 */
function normalizeViolation(
  report: CSPViolationReport,
  request: NextRequest
): NormalizedViolation | null {
  // Handle legacy csp-report format
  if (report["csp-report"]) {
    const csp = report["csp-report"];
    return {
      timestamp: new Date().toISOString(),
      documentUri: csp["document-uri"] || "unknown",
      violatedDirective: csp["violated-directive"] || "unknown",
      effectiveDirective: csp["effective-directive"] || csp["violated-directive"] || "unknown",
      blockedUri: csp["blocked-uri"] || "unknown",
      disposition: csp.disposition || "enforce",
      sourceFile: csp["source-file"],
      lineNumber: csp["line-number"],
      columnNumber: csp["column-number"],
      sample: csp["script-sample"],
      referrer: csp.referrer,
      userAgent: request.headers.get("user-agent") || undefined,
      clientIp:
        request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    };
  }

  // Handle Report-To API format
  if (report.body) {
    const body = report.body;
    return {
      timestamp: new Date().toISOString(),
      documentUri: body.documentURL || report.url || "unknown",
      violatedDirective: body.violatedDirective || "unknown",
      effectiveDirective: body.effectiveDirective || body.violatedDirective || "unknown",
      blockedUri: body.blockedURL || "unknown",
      disposition: body.disposition || "enforce",
      sourceFile: body.sourceFile,
      lineNumber: body.lineNumber,
      columnNumber: body.columnNumber,
      sample: body.sample,
      referrer: body.referrer,
      userAgent: report.user_agent || request.headers.get("user-agent") || undefined,
      clientIp:
        request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    };
  }

  return null;
}

/**
 * Check if violation should be ignored (known false positives)
 */
function shouldIgnoreViolation(violation: NormalizedViolation): boolean {
  const ignoredPatterns = [
    // Browser extensions
    /^chrome-extension:/,
    /^moz-extension:/,
    /^safari-extension:/,
    /^ms-browser-extension:/,
    // Browser internal pages
    /^about:/,
    /^data:/,
    // Common false positives from browser features
    /^blob:/,
  ];

  // Check blocked URI against ignore patterns
  for (const pattern of ignoredPatterns) {
    if (pattern.test(violation.blockedUri)) {
      return true;
    }
  }

  // Ignore violations from browser prefetch/preload
  if (violation.documentUri === "about:blank") {
    return true;
  }

  return false;
}

/**
 * Log violation to configured logging system
 */
function logViolation(violation: NormalizedViolation): void {
  // In production, this would send to a logging service (e.g., Elasticsearch, Sentry)
  // For now, we log to console with structured format

  const logEntry = {
    level: "warn",
    type: "csp_violation",
    ...violation,
  };

  // Log to console (structured logging)
  console.warn("[CSP Violation]", JSON.stringify(logEntry));

  // Send to monitoring services in production
  if (process.env.NODE_ENV === "production") {
    // Send to security monitoring endpoint
    // NOTE: Configure monitoring service endpoints in environment variables
    // - SECURITY_MONITORING_URL: For aggregation (Elasticsearch/OpenSearch)
    // - SENTRY_DSN: For real-time alerting

    const monitoringUrl = process.env.SECURITY_MONITORING_URL;
    if (monitoringUrl) {
      fetch(monitoringUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logEntry),
      }).catch((err: unknown) => console.error("Failed to send CSP violation to monitoring:", err));
    }

    // Track high-severity violations
    if (logEntry.severity === "high") {
      console.error("[HIGH SEVERITY CSP]", logEntry);
      // NOTE: Trigger alerts for high-severity violations via your monitoring service
    }
  }
}

/**
 * POST handler for CSP violation reports
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse the violation report
    const contentType = request.headers.get("content-type") || "";

    let reports: CSPViolationReport[] = [];

    if (
      contentType.includes("application/csp-report") ||
      contentType.includes("application/json")
    ) {
      const body = (await request.json()) as unknown;

      // Handle both single reports and arrays (Report-To can batch)
      if (Array.isArray(body)) {
        reports = body as CSPViolationReport[];
      } else {
        reports = [body as CSPViolationReport];
      }
    } else {
      // Unknown content type
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    // Process each report
    let processed = 0;
    let ignored = 0;

    for (const report of reports) {
      const normalized = normalizeViolation(report, request);

      if (!normalized) {
        continue;
      }

      if (shouldIgnoreViolation(normalized)) {
        ignored++;
        continue;
      }

      logViolation(normalized);
      processed++;
    }

    // Return success (browsers expect 204 No Content for CSP reports)
    return new NextResponse(null, {
      status: 204,
      headers: {
        "X-Reports-Processed": String(processed),
        "X-Reports-Ignored": String(ignored),
      },
    });
  } catch (error) {
    console.error("[CSP Report Error]", error);

    // Still return success to avoid browser retry loops
    return new NextResponse(null, { status: 204 });
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * GET handler - health check and documentation
 */
export function GET(): NextResponse {
  return NextResponse.json({
    endpoint: "CSP Violation Report",
    description: "Receives Content Security Policy violation reports from browsers",
    methods: ["POST"],
    contentTypes: ["application/csp-report", "application/json"],
    documentation:
      "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-uri",
  });
}
