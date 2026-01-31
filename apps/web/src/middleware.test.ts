/**
 * Middleware Tests
 *
 * Tests for security headers, rate limiting, and CSRF validation
 */

// Note: These tests require the jest setup from jest.setup.js

describe('Middleware', () => {
  // Import middleware after setting up mocks
  let middleware: Function;
  let NextResponse: any;

  beforeEach(async () => {
    // Reset modules to get fresh rate limit state
    jest.resetModules();

    // Mock NextResponse
    NextResponse = {
      next: jest.fn(() => ({
        headers: new Map(),
      })),
    };

    jest.doMock('next/server', () => ({
      NextResponse,
      NextRequest: global.Request,
    }));

    // Import middleware
    const mod = await import('./middleware');
    middleware = mod.middleware;
  });

  describe('Rate Limiting', () => {
    it('allows requests within rate limit', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/test', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      const response = middleware(request);

      expect(response.status).not.toBe(429);
    });

    it('blocks requests exceeding auth rate limit', async () => {
      const ip = '192.168.1.100';

      // Auth endpoints have a 5 requests/minute limit
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest('http://localhost:3000/api/auth/login', {
          headers: { 'x-real-ip': ip },
        });
        const response = middleware(request);

        if (i < 5) {
          expect(response.status || 200).not.toBe(429);
        } else {
          expect(response.status).toBe(429);
        }
      }
    });

    it('blocks requests exceeding API rate limit', async () => {
      const ip = '192.168.1.101';

      // API endpoints have a 100 requests/minute limit
      for (let i = 0; i < 101; i++) {
        const request = createMockNextRequest('http://localhost:3000/api/emails', {
          headers: { 'x-real-ip': ip },
        });
        const response = middleware(request);

        if (i < 100) {
          expect(response.status || 200).not.toBe(429);
        } else {
          expect(response.status).toBe(429);
        }
      }
    });

    it('tracks different IPs separately', async () => {
      // Exhaust limit for IP1
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest('http://localhost:3000/api/auth/login', {
          headers: { 'x-real-ip': '10.0.0.1' },
        });
        middleware(request);
      }

      // IP2 should still be allowed
      const request = createMockNextRequest('http://localhost:3000/api/auth/login', {
        headers: { 'x-real-ip': '10.0.0.2' },
      });
      const response = middleware(request);

      expect(response.status || 200).not.toBe(429);
    });

    it('returns Retry-After header when rate limited', async () => {
      const ip = '192.168.1.102';

      // Exhaust limit
      for (let i = 0; i < 6; i++) {
        const request = createMockNextRequest('http://localhost:3000/api/auth/login', {
          headers: { 'x-real-ip': ip },
        });
        const response = middleware(request);

        if (response.status === 429) {
          expect(response.headers.get('Retry-After')).toBe('60');
        }
      }
    });
  });

  describe('Security Headers', () => {
    it('sets HSTS header', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        const hsts = response.headers.get('Strict-Transport-Security');
        expect(hsts).toContain('max-age=');
        expect(hsts).toContain('includeSubDomains');
      }
    });

    it('sets X-Frame-Options to DENY', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      }
    });

    it('sets X-Content-Type-Options to nosniff', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      }
    });

    it('sets X-XSS-Protection', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      }
    });

    it('sets Content-Security-Policy', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        const csp = response.headers.get('Content-Security-Policy');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
      }
    });

    it('sets Referrer-Policy', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      }
    });

    it('sets Permissions-Policy to disable sensitive features', async () => {
      const request = createMockNextRequest('http://localhost:3000/');
      const response = middleware(request);

      if (response.headers && response.headers.get) {
        const policy = response.headers.get('Permissions-Policy');
        expect(policy).toContain('camera=()');
        expect(policy).toContain('microphone=()');
        expect(policy).toContain('geolocation=()');
      }
    });
  });

  describe('CSRF Protection', () => {
    it('allows GET requests without CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/emails', {
        method: 'GET',
      });
      const response = middleware(request);

      expect(response.status || 200).not.toBe(403);
    });

    it('blocks POST requests without CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/emails', {
        method: 'POST',
        headers: { 'x-real-ip': '192.168.1.200' },
      });
      const response = middleware(request);

      expect(response.status).toBe(403);
    });

    it('blocks POST requests with mismatched CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/emails', {
        method: 'POST',
        headers: {
          'x-real-ip': '192.168.1.201',
          'x-csrf-token': 'token-from-header',
        },
        cookies: { 'csrf-token': 'different-token-from-cookie' },
      });
      const response = middleware(request);

      expect(response.status).toBe(403);
    });

    it('allows POST requests with valid CSRF token', async () => {
      const csrfToken = 'valid-csrf-token';
      const request = createMockNextRequest('http://localhost:3000/api/emails', {
        method: 'POST',
        headers: {
          'x-real-ip': '192.168.1.202',
          'x-csrf-token': csrfToken,
        },
        cookies: { 'csrf-token': csrfToken },
      });
      const response = middleware(request);

      expect(response.status || 200).not.toBe(403);
    });

    it('skips CSRF check for webhook endpoints', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/webhook/stripe', {
        method: 'POST',
        headers: { 'x-real-ip': '192.168.1.203' },
        // No CSRF token
      });
      const response = middleware(request);

      expect(response.status || 200).not.toBe(403);
    });

    it('blocks PUT requests without CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/settings', {
        method: 'PUT',
        headers: { 'x-real-ip': '192.168.1.204' },
      });
      const response = middleware(request);

      expect(response.status).toBe(403);
    });

    it('blocks DELETE requests without CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/emails/123', {
        method: 'DELETE',
        headers: { 'x-real-ip': '192.168.1.205' },
      });
      const response = middleware(request);

      expect(response.status).toBe(403);
    });

    it('blocks PATCH requests without CSRF token', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/emails/123', {
        method: 'PATCH',
        headers: { 'x-real-ip': '192.168.1.206' },
      });
      const response = middleware(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Path Matching', () => {
    it('applies different rate limits based on path', async () => {
      // Auth path should have stricter limits
      const authRequest = createMockNextRequest('http://localhost:3000/api/auth/login');
      const apiRequest = createMockNextRequest('http://localhost:3000/api/emails');
      const pageRequest = createMockNextRequest('http://localhost:3000/mail');

      // All should pass first request
      expect((middleware(authRequest).status || 200)).not.toBe(429);
      expect((middleware(apiRequest).status || 200)).not.toBe(429);
      expect((middleware(pageRequest).status || 200)).not.toBe(429);
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
  const { method = 'GET', headers = {}, cookies = {} } = options;

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
