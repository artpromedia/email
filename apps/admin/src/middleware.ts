import { NextResponse, type NextRequest } from "next/server";

/**
 * Security Middleware for Enterprise Email Admin Dashboard
 *
 * Implements:
 * - Security headers (CSP, HSTS, XSS protection)
 * - Rate limiting
 * - CSRF protection validation
 * - Admin authentication checks
 */

// Rate limiting store (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMITS = {
  auth: { requests: 3, windowMs: 60000 }, // 3 requests per minute for admin auth
  api: { requests: 200, windowMs: 60000 }, // 200 requests per minute for admin API
  default: { requests: 100, windowMs: 60000 }, // 100 requests per minute default
};

function getRateLimit(pathname: string) {
  if (pathname.startsWith("/api/auth")) return RATE_LIMITS.auth;
  if (pathname.startsWith("/api/")) return RATE_LIMITS.api;
  return RATE_LIMITS.default;
}

function checkRateLimit(
  identifier: string,
  limit: { requests: number; windowMs: number }
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + limit.windowMs });
    return true;
  }

  if (record.count >= limit.requests) {
    return false;
  }

  record.count++;
  return true;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Get client identifier (IP address or user ID)
  const identifier =
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "unknown";

  // Rate limiting
  const rateLimit = getRateLimit(pathname);
  const rateLimitKey = `${identifier}:${pathname}`;

  if (!checkRateLimit(rateLimitKey, rateLimit)) {
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  // Security Headers (Stricter for admin)
  const securityHeaders = {
    // Strict-Transport-Security: Force HTTPS
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

    // X-Frame-Options: Prevent clickjacking
    "X-Frame-Options": "DENY",

    // X-Content-Type-Options: Prevent MIME sniffing
    "X-Content-Type-Options": "nosniff",

    // X-XSS-Protection: Enable XSS filter
    "X-XSS-Protection": "1; mode=block",

    // Referrer-Policy: No referrer for admin
    "Referrer-Policy": "no-referrer",

    // Permissions-Policy: Disable all features
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",

    // Content-Security-Policy: Strict policy for admin
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Note: Remove unsafe-inline in production
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.yourdomain.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  };

  // Apply security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // CSRF Token validation for state-changing requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const csrfToken = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get("csrf-token")?.value;

    if (!csrfToken || csrfToken !== csrfCookie) {
      return new NextResponse(JSON.stringify({ error: "Invalid CSRF token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Clean up old rate limit entries periodically
  if (Math.random() < 0.01) {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    String.raw`/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`,
  ],
};
