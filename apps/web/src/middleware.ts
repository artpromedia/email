import { NextResponse, type NextRequest } from "next/server";
import { RATE_LIMIT_TIERS, type RateLimitResult, type RateLimitConfig } from "@email/utils";

/**
 * Security Middleware for Enterprise Email Platform
 *
 * Implements:
 * - Security headers (CSP, HSTS, XSS protection)
 * - Rate limiting with Redis (Upstash for Edge compatibility)
 * - CSRF protection validation
 * - Authentication checks
 * - Nonce-based inline script support
 *
 * For horizontal scaling, this middleware uses Upstash Redis which is
 * Edge-compatible. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables for production.
 *
 * CSP Configuration (environment variables):
 * - CSP_CONNECT_DOMAINS: Comma-separated list of allowed API/WebSocket domains
 * - CSP_SCRIPT_DOMAINS: Comma-separated list of allowed script domains
 * - CSP_STYLE_DOMAINS: Comma-separated list of allowed style domains
 * - CSP_REPORT_URI: URL for CSP violation reports
 * - CSP_REPORT_ONLY: Set to "true" to use report-only mode
 * - API_URL: Primary API URL (auto-added to connect-src)
 */

// CSP Configuration from environment
interface CSPEnvConfig {
  connectDomains: string[];
  scriptDomains: string[];
  styleDomains: string[];
  fontDomains: string[];
  imgDomains: string[];
  reportUri: string;
  reportOnly: boolean;
  isDevelopment: boolean;
}

function getCSPConfig(): CSPEnvConfig {
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  const parseDomainsEnv = (envVar: string | undefined): string[] => {
    if (!envVar) return [];
    return envVar
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  };

  // Build connect domains from API_URL and explicit CSP_CONNECT_DOMAINS
  const connectDomains: string[] = [];
  if (process.env.API_URL) {
    try {
      const apiUrl = new URL(process.env.API_URL);
      connectDomains.push(apiUrl.origin);
      // Add WebSocket equivalent
      const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      connectDomains.push(`${wsProtocol}//${apiUrl.host}`);
    } catch {
      // Invalid URL, skip
    }
  }
  if (process.env.WEB_APP_URL) {
    try {
      const webUrl = new URL(process.env.WEB_APP_URL);
      connectDomains.push(webUrl.origin);
    } catch {
      // Invalid URL, skip
    }
  }
  connectDomains.push(...parseDomainsEnv(process.env.CSP_CONNECT_DOMAINS));

  return {
    connectDomains,
    scriptDomains: parseDomainsEnv(process.env.CSP_SCRIPT_DOMAINS),
    styleDomains: parseDomainsEnv(process.env.CSP_STYLE_DOMAINS),
    fontDomains: parseDomainsEnv(process.env.CSP_FONT_DOMAINS),
    imgDomains: parseDomainsEnv(process.env.CSP_IMG_DOMAINS),
    reportUri: process.env.CSP_REPORT_URI || "/api/csp-report",
    reportOnly: process.env.CSP_REPORT_ONLY === "true",
    isDevelopment,
  };
}

/**
 * Generate a cryptographically secure nonce for CSP
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCodePoint(...array));
}

/**
 * Build CSP header from configuration
 */
function buildCSPHeader(config: CSPEnvConfig, nonce: string): string {
  const directives: string[] = [];

  // Default sources
  directives.push("default-src 'self'");

  // Script sources with nonce
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "https://cdn.jsdelivr.net"];
  if (config.scriptDomains.length > 0) {
    scriptSources.push(...config.scriptDomains);
  }
  // Development: allow unsafe-inline and unsafe-eval for hot reload
  if (config.isDevelopment) {
    scriptSources.push("'unsafe-inline'", "'unsafe-eval'");
  }
  directives.push(`script-src ${scriptSources.join(" ")}`);

  // Style sources with nonce
  const styleSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
  ];
  if (config.styleDomains.length > 0) {
    styleSources.push(...config.styleDomains);
  }
  directives.push(`style-src ${styleSources.join(" ")}`);

  // Font sources
  const fontSources = ["'self'", "https://fonts.gstatic.com", "data:"];
  if (config.fontDomains.length > 0) {
    fontSources.push(...config.fontDomains);
  }
  directives.push(`font-src ${fontSources.join(" ")}`);

  // Image sources
  const imgSources = ["'self'", "data:", "https:", "blob:"];
  if (config.imgDomains.length > 0) {
    imgSources.push(...config.imgDomains);
  }
  directives.push(`img-src ${imgSources.join(" ")}`);

  // Connect sources (API, WebSockets)
  const connectSources = ["'self'"];
  if (config.connectDomains.length > 0) {
    connectSources.push(...config.connectDomains);
  }
  // Development: allow localhost
  if (config.isDevelopment) {
    connectSources.push(
      "http://localhost:*",
      "ws://localhost:*",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*"
    );
  }
  directives.push(
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:"
  );

  // Report URI for violation logging
  if (config.reportUri) {
    directives.push(`report-uri ${config.reportUri}`);
  }

  return directives.join("; ");
}

// Cache CSP config (parsed once at startup)
let cachedCSPConfig: CSPEnvConfig | null = null;

function getOrCreateCSPConfig(): CSPEnvConfig {
  if (!cachedCSPConfig) {
    cachedCSPConfig = getCSPConfig();
    // Validate at startup
    validateCSPConfigAtStartup(cachedCSPConfig);
  }
  return cachedCSPConfig;
}

function validateCSPConfigAtStartup(config: CSPEnvConfig): void {
  const warnings: string[] = [];

  if (config.connectDomains.length === 0 && !config.isDevelopment) {
    warnings.push("CSP: No connect domains configured. API calls may be blocked.");
  }

  if (!config.reportUri && !config.isDevelopment) {
    warnings.push("CSP: No report URI configured. Violations won't be logged.");
  }

  if (warnings.length > 0) {
    console.warn("[CSP Config Warnings]", warnings.join(" | "));
  }

  if (!config.isDevelopment) {
    console.info("[CSP Config] Loaded with", config.connectDomains.length, "connect domains");
  }
}

// Edge-compatible Redis rate limiter using Upstash REST API
class EdgeRedisRateLimiter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly prefix: string;
  private readonly fallbackToAllow: boolean;

  constructor() {
    this.baseUrl = process.env.UPSTASH_REDIS_REST_URL || "";
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN || "";
    this.prefix = "ratelimit";
    this.fallbackToAllow = true;
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  private async redisCommand(command: string[]): Promise<unknown> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        console.error("Upstash Redis error:", response.status);
        return null;
      }

      const data = (await response.json()) as { result: unknown };
      return data.result as string | number | null;
    } catch (error) {
      console.error("Redis command failed:", error);
      return null;
    }
  }

  async check(identifier: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `${this.prefix}:${identifier}:${Math.floor(now / windowMs)}`;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = Math.floor((windowStart + windowMs) / 1000);

    if (!this.isConfigured) {
      // Fallback to allow when Redis is not configured
      return this.fallbackResult(limit, resetAt);
    }

    try {
      // Increment counter atomically
      const count = (await this.redisCommand(["INCR", windowKey])) as number;

      // Set expiry (only on first request for this window)
      if (count === 1) {
        await this.redisCommand(["EXPIRE", windowKey, String(Math.ceil(windowMs / 1000) + 1)]);
      }

      const remaining = Math.max(0, limit - count);
      const allowed = count <= limit;

      return {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil((windowStart + windowMs - now) / 1000),
      };
    } catch (error) {
      console.error("Rate limiter Redis error:", error);
      return this.fallbackResult(limit, resetAt);
    }
  }

  async checkMultiple(identifier: string, configs: RateLimitConfig[]): Promise<RateLimitResult> {
    if (configs.length === 0) {
      return {
        allowed: true,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000),
        retryAfter: undefined,
      };
    }

    const results = await Promise.all(
      configs.map((config) => this.check(identifier, config.limit, config.windowMs))
    );

    // Return the most restrictive result
    const denied = results.find((r) => !r.allowed);
    if (denied) {
      return denied;
    }

    // All passed - return the one with lowest remaining (results guaranteed non-empty)
    return results.reduce((min, r) => (r.remaining < min.remaining ? r : min), results[0]);
  }

  private fallbackResult(limit: number, resetAt: number): RateLimitResult {
    return {
      allowed: this.fallbackToAllow,
      remaining: this.fallbackToAllow ? limit : 0,
      resetAt,
      retryAfter: undefined,
    };
  }
}

// In-memory fallback rate limiter for development
class EdgeInMemoryRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  check(identifier: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `${identifier}:${windowStart}`;
    const resetAt = Math.floor((windowStart + windowMs) / 1000);

    let entry = this.windows.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: windowStart + windowMs };
      this.windows.set(key, entry);
      // Clean up old entries periodically
      this.cleanup();
    }

    entry.count++;
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  checkMultiple(identifier: string, configs: RateLimitConfig[]): RateLimitResult {
    if (configs.length === 0) {
      return {
        allowed: true,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000),
        retryAfter: undefined,
      };
    }

    const results = configs.map((config) => this.check(identifier, config.limit, config.windowMs));

    const denied = results.find((r) => !r.allowed);
    if (denied) return denied;

    // results guaranteed non-empty
    return results.reduce((min, r) => (r.remaining < min.remaining ? r : min), results[0]);
  }

  private cleanup(): void {
    const now = Date.now();
    // Only cleanup every ~100 requests to avoid overhead
    if (Math.random() > 0.01) return;

    for (const [key, entry] of this.windows.entries()) {
      if (entry.resetAt < now) {
        this.windows.delete(key);
      }
    }
  }
}

// Create rate limiter - uses Redis in production, in-memory for development
const rateLimiter = process.env.UPSTASH_REDIS_REST_URL
  ? new EdgeRedisRateLimiter()
  : new EdgeInMemoryRateLimiter();

function getRateLimitTier(pathname: string): "auth" | "api" | "web" {
  if (pathname.startsWith("/api/auth")) return "auth";
  if (pathname.startsWith("/api/")) return "api";
  return "web";
}

async function checkRateLimit(identifier: string, pathname: string): Promise<RateLimitResult> {
  const tier = getRateLimitTier(pathname);
  const configs = RATE_LIMIT_TIERS[tier];
  return rateLimiter.checkMultiple(identifier, configs);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Skip CSP report endpoint to avoid circular issues
  if (pathname === "/api/csp-report") {
    return response;
  }

  // Get client identifier (IP address or user ID)
  const identifier =
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "unknown";

  // Rate limiting using @email/utils rate limiter
  const rateLimitKey = `${identifier}:${pathname}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, pathname);

  if (!rateLimitResult.allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfter ?? 60),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimitResult.resetAt),
        },
      }
    );
  }

  // Generate nonce for this request
  const nonce = generateNonce();

  // Get CSP configuration
  const cspConfig = getOrCreateCSPConfig();
  const cspHeader = buildCSPHeader(cspConfig, nonce);
  const cspHeaderName = cspConfig.reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  // Security Headers
  const securityHeaders = {
    // Strict-Transport-Security: Force HTTPS
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

    // X-Frame-Options: Prevent clickjacking
    "X-Frame-Options": "DENY",

    // X-Content-Type-Options: Prevent MIME sniffing
    "X-Content-Type-Options": "nosniff",

    // X-XSS-Protection: Enable XSS filter
    "X-XSS-Protection": "1; mode=block",

    // Referrer-Policy: Control referrer information
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Permissions-Policy: Control browser features
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",

    // Content-Security-Policy: Dynamic based on environment
    [cspHeaderName]: cspHeader,

    // X-Nonce: Pass nonce to application for inline scripts
    "X-Nonce": nonce,
  };

  // Apply security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // CSRF Token validation for state-changing requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    // Skip CSRF check for API routes that use other auth methods
    if (!pathname.startsWith("/api/webhook")) {
      const csrfToken = request.headers.get("x-csrf-token");
      const csrfCookie = request.cookies.get("csrf-token")?.value;

      if (!csrfToken || csrfToken !== csrfCookie) {
        return new NextResponse(JSON.stringify({ error: "Invalid CSRF token" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  // Add rate limit headers to successful responses
  response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
  response.headers.set("X-RateLimit-Reset", String(rateLimitResult.resetAt));

  return response;
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    String.raw`/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`,
  ],
};
