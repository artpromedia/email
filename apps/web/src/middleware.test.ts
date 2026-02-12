/**
 * Middleware Tests
 *
 * Tests for security headers, rate limiting, and CSRF validation
 * Updated to support async middleware with @email/utils rate limiter
 */

// Note: These tests require the jest setup from jest.setup.js

// Mock @email/utils before importing middleware
jest.mock("@email/utils", () => {
  // Create a mock rate limiter that tracks calls per identifier
  const mockCounts = new Map<string, number>();

  const mockRateLimiter = {
    check: jest.fn(async (identifier: string, limit: number) => {
      const count = (mockCounts.get(identifier) || 0) + 1;
      mockCounts.set(identifier, count);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: Math.floor(Date.now() / 1000) + 60,
        retryAfter: count > limit ? 60 : undefined,
      };
    }),
    checkMultiple: jest.fn(
      async (identifier: string, configs: Array<{ limit: number; windowMs: number }>) => {
        // Use the most restrictive limit
        const minLimit = Math.min(...configs.map((c) => c.limit));
        const count = (mockCounts.get(identifier) || 0) + 1;
        mockCounts.set(identifier, count);
        return {
          allowed: count <= minLimit,
          remaining: Math.max(0, minLimit - count),
          resetAt: Math.floor(Date.now() / 1000) + 60,
          retryAfter: count > minLimit ? 60 : undefined,
        };
      }
    ),
    reset: jest.fn(),
  };

  return {
    InMemoryRateLimiter: jest.fn(() => mockRateLimiter),
    RATE_LIMIT_TIERS: {
      auth: [
        { limit: 5, windowMs: 60 * 1000 },
        { limit: 20, windowMs: 60 * 60 * 1000 },
      ],
      api: [
        { limit: 100, windowMs: 60 * 1000 },
        { limit: 1000, windowMs: 60 * 60 * 1000 },
      ],
      web: [{ limit: 300, windowMs: 60 * 1000 }],
    },
    // Export for test access
    __mockCounts: mockCounts,
    __mockRateLimiter: mockRateLimiter,
  };
});

describe("Middleware", () => {
  // Import middleware after setting up mocks
  let middleware: (request: unknown) => Promise<unknown>;
  let mockCounts: Map<string, number>;

  beforeEach(async () => {
    // Reset modules to get fresh rate limit state
    jest.resetModules();

    // Get the mock counts map and clear it
    const utils = await import("@email/utils");
    mockCounts = (utils as unknown as { __mockCounts: Map<string, number> }).__mockCounts;
    mockCounts.clear();

    // Mock NextResponse with the global class
    jest.doMock("next/server", () => ({
      NextResponse: global.NextResponse,
      NextRequest: global.Request,
    }));

    // Import middleware
    const mod = await import("./middleware");
    middleware = mod.middleware;
  });

  describe("Rate Limiting", () => {
    it("allows requests within rate limit", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/test", {
        headers: { "x-real-ip": "192.168.1.1" },
      });

      const response = (await middleware(request)) as { status?: number };

      expect(response.status).not.toBe(429);
    });

    it("blocks requests exceeding auth rate limit", async () => {
      const ip = "192.168.1.100";

      // Auth endpoints have a 5 requests/minute limit
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest("http://localhost:3000/api/auth/login", {
          headers: { "x-real-ip": ip },
        });
        const response = (await middleware(request)) as { status?: number };

        if (i < 5) {
          expect(response.status || 200).not.toBe(429);
        } else {
          expect(response.status).toBe(429);
        }
      }
    });

    it("blocks requests exceeding API rate limit", async () => {
      const ip = "192.168.1.101";

      // API endpoints have a 100 requests/minute limit
      for (let i = 0; i < 101; i++) {
        const request = createMockNextRequest("http://localhost:3000/api/emails", {
          headers: { "x-real-ip": ip },
        });
        const response = (await middleware(request)) as { status?: number };

        if (i < 100) {
          expect(response.status || 200).not.toBe(429);
        } else {
          expect(response.status).toBe(429);
        }
      }
    });

    it("tracks different IPs separately", async () => {
      // Exhaust limit for IP1
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest("http://localhost:3000/api/auth/login", {
          headers: { "x-real-ip": "10.0.0.1" },
        });
        await middleware(request);
      }

      // IP2 should still be allowed
      const request = createMockNextRequest("http://localhost:3000/api/auth/login", {
        headers: { "x-real-ip": "10.0.0.2" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBe(429);
    });

    it("returns rate limit headers when rate limited", async () => {
      const ip = "192.168.1.102";

      // Exhaust limit
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest("http://localhost:3000/api/auth/login", {
          headers: { "x-real-ip": ip },
        });
        const response = (await middleware(request)) as {
          status?: number;
          headers: { get: (name: string) => string | null };
        };

        if (response.status === 429) {
          expect(response.headers.get("Retry-After")).toBeTruthy();
          expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
          expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
        }
      }
    });
  });

  describe("Security Headers", () => {
    it("sets HSTS header", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        const hsts = response.headers.get("Strict-Transport-Security");
        expect(hsts).toContain("max-age=");
        expect(hsts).toContain("includeSubDomains");
      }
    });

    it("sets X-Frame-Options to DENY", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      }
    });

    it("sets X-Content-Type-Options to nosniff", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      }
    });

    it("sets X-XSS-Protection", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
      }
    });

    it("sets Content-Security-Policy", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        const csp = response.headers.get("Content-Security-Policy");
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
      }
    });

    it("sets Referrer-Policy", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      }
    });

    it("sets Permissions-Policy to disable sensitive features", async () => {
      const request = createMockNextRequest("http://localhost:3000/");
      const response = (await middleware(request)) as {
        headers?: { get: (name: string) => string | null };
      };

      if (response.headers && response.headers.get) {
        const policy = response.headers.get("Permissions-Policy");
        expect(policy).toContain("camera=()");
        expect(policy).toContain("microphone=()");
        expect(policy).toContain("geolocation=()");
      }
    });
  });

  describe("CSRF Protection", () => {
    it("allows GET requests without CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/emails", {
        method: "GET",
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBe(403);
    });

    it("blocks POST requests without CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/emails", {
        method: "POST",
        headers: { "x-real-ip": "192.168.1.200" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status).toBe(403);
    });

    it("blocks POST requests with mismatched CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/emails", {
        method: "POST",
        headers: {
          "x-real-ip": "192.168.1.201",
          "x-csrf-token": "token-from-header",
        },
        cookies: { "csrf-token": "different-token-from-cookie" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status).toBe(403);
    });

    it("allows POST requests with valid CSRF token", async () => {
      const csrfToken = "valid-csrf-token";
      const request = createMockNextRequest("http://localhost:3000/api/emails", {
        method: "POST",
        headers: {
          "x-real-ip": "192.168.1.202",
          "x-csrf-token": csrfToken,
        },
        cookies: { "csrf-token": csrfToken },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBe(403);
    });

    it("skips CSRF check for webhook endpoints", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/webhook/stripe", {
        method: "POST",
        headers: { "x-real-ip": "192.168.1.203" },
        // No CSRF token
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBe(403);
    });

    it("blocks PUT requests without CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/settings", {
        method: "PUT",
        headers: { "x-real-ip": "192.168.1.204" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status).toBe(403);
    });

    it("blocks DELETE requests without CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/emails/123", {
        method: "DELETE",
        headers: { "x-real-ip": "192.168.1.205" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status).toBe(403);
    });

    it("blocks PATCH requests without CSRF token", async () => {
      const request = createMockNextRequest("http://localhost:3000/api/emails/123", {
        method: "PATCH",
        headers: { "x-real-ip": "192.168.1.206" },
      });
      const response = (await middleware(request)) as { status?: number };

      expect(response.status).toBe(403);
    });
  });

  describe("Path Matching", () => {
    it("applies different rate limits based on path", async () => {
      // Auth path should have stricter limits
      const authRequest = createMockNextRequest("http://localhost:3000/api/auth/login");
      const apiRequest = createMockNextRequest("http://localhost:3000/api/emails");
      const pageRequest = createMockNextRequest("http://localhost:3000/mail");

      // All should pass first request
      const authResponse = (await middleware(authRequest)) as { status?: number };
      const apiResponse = (await middleware(apiRequest)) as { status?: number };
      const pageResponse = (await middleware(pageRequest)) as { status?: number };

      expect(authResponse.status || 200).not.toBe(429);
      expect(apiResponse.status || 200).not.toBe(429);
      expect(pageResponse.status || 200).not.toBe(429);
    });
  });

  describe("Domain-based Routing", () => {
    it("redirects app routes from www to mail domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/mail/inbox", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      // Should be a redirect (307 or 308)
      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("mail.oonrumail.com");
      expect(location).toContain("/mail/inbox");
    });

    it("redirects /calendar from www to mail domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/calendar", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("mail.oonrumail.com");
      expect(location).toContain("/calendar");
    });

    it("allows marketing page on www domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as { status?: number };

      // Should NOT redirect — serve the marketing page
      expect(response.status || 200).not.toBeGreaterThanOrEqual(300);
    });

    it("allows login page on www domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/login", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBeGreaterThanOrEqual(300);
    });

    it("allows register page on www domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/register", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBeGreaterThanOrEqual(300);
    });

    it('redirects root "/" on mail domain to /mail/inbox', async () => {
      const request = createMockNextRequest("https://mail.oonrumail.com/", {
        headers: { host: "mail.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("/mail/inbox");
    });

    it("allows /mail/inbox on mail domain", async () => {
      const request = createMockNextRequest("https://mail.oonrumail.com/mail/inbox", {
        headers: { host: "mail.oonrumail.com" },
      });

      const response = (await middleware(request)) as { status?: number };

      expect(response.status || 200).not.toBeGreaterThanOrEqual(300);
    });

    it("redirects /settings from www to mail domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/settings", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("mail.oonrumail.com");
      expect(location).toContain("/settings");
    });

    it("redirects /chat from www to mail domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/chat", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("mail.oonrumail.com");
      expect(location).toContain("/chat");
    });

    it("redirects /contacts from www to mail domain", async () => {
      const request = createMockNextRequest("https://www.oonrumail.com/contacts", {
        headers: { host: "www.oonrumail.com" },
      });

      const response = (await middleware(request)) as {
        status?: number;
        headers: { get: (name: string) => string | null };
      };

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      const location = response.headers.get("location");
      expect(location).toContain("mail.oonrumail.com");
      expect(location).toContain("/contacts");
    });
  });
});

// Helper function to create mock NextRequest
function createMockNextRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
) {
  const { method = "GET", headers = {}, cookies = {} } = options;

  const parsedUrl = new URL(url);

  const cookieStore = {
    get: (name: string) => {
      const value = cookies[name];
      return value ? { name, value } : undefined;
    },
  };

  return {
    method,
    nextUrl: parsedUrl,
    url,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
      has: (name: string) => name.toLowerCase() in headers,
    },
    cookies: cookieStore,
  };
}
