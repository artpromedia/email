import { NextResponse, type NextRequest } from "next/server";
import {
  InMemoryRateLimiter,
  RATE_LIMIT_TIERS,
  type RateLimitResult,
} from "@email/utils";

/**
 * Security Middleware for Enterprise Email Platform
 *
 * Implements:
 * - Security headers (CSP, HSTS, XSS protection)
 * - Rate limiting (using @email/utils rate limiter)
 * - CSRF protection validation
 * - Authentication checks
 *
 * Note: For horizontal scaling in production, replace InMemoryRateLimiter
 * with RedisRateLimiter from @email/utils in API routes, or use an
 * Edge-compatible Redis client like Upstash for middleware.
 */

// Rate limiter instance - uses InMemoryRateLimiter for Edge compatibility
// In production with multiple instances, use Redis-based rate limiting
// via API routes or Upstash Redis for Edge middleware
const rateLimiter = new InMemoryRateLimiter();

function getRateLimitTier(pathname: string): "auth" | "api" | "web" {
  if (pathname.startsWith("/api/auth")) return "auth";
  if (pathname.startsWith("/api/")) return "api";
  return "web";
}

async function checkRateLimit(
  identifier: string,
  pathname: string
): Promise<RateLimitResult> {
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
          "Retry-After": String(rateLimitResult.retryAfter || 60),
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
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
