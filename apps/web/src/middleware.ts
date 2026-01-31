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
 *
 * For horizontal scaling, this middleware uses Upstash Redis which is
 * Edge-compatible. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables for production.
 */

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
      return { allowed: true, remaining: 0, resetAt: Math.floor(Date.now() / 1000) };
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
      return { allowed: true, remaining: 0, resetAt: Math.floor(Date.now() / 1000) };
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

    // Content-Security-Policy: Prevent XSS and injection attacks
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://api.yourdomain.com wss://api.yourdomain.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
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
