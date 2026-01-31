import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: React.ReactNode;
}

const AllTheProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Mock fetch utilities
export function mockFetch(response: unknown, options: { status?: number; ok?: boolean } = {}) {
  const { status = 200, ok = true } = options;

  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });

  return global.fetch;
}

export function mockFetchError(error: Error | string) {
  global.fetch = jest.fn().mockRejectedValue(
    error instanceof Error ? error : new Error(error)
  );

  return global.fetch;
}

export function mockFetchSequence(responses: Array<{ data: unknown; status?: number }>) {
  const mockFn = jest.fn();

  responses.forEach((response, index) => {
    mockFn.mockResolvedValueOnce({
      ok: (response.status || 200) < 400,
      status: response.status || 200,
      json: async () => response.data,
      text: async () => JSON.stringify(response.data),
    });
  });

  global.fetch = mockFn;
  return mockFn;
}

// Common test fixtures
export const testUser = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'member',
  organizationId: 'org-1',
};

export const testOrganization = {
  id: 'org-1',
  name: 'Test Organization',
  slug: 'test-org',
};

export const testDomain = {
  id: 'domain-1',
  name: 'example.com',
  isVerified: true,
  isPrimary: true,
};

export const testEmail = {
  id: 'email-1',
  threadId: 'thread-1',
  from: { address: 'sender@external.com', name: 'Sender' },
  to: [{ address: 'test@example.com', name: 'Test User' }],
  subject: 'Test Email',
  body: 'This is a test email body.',
  receivedAt: new Date().toISOString(),
  isRead: false,
  isStarred: false,
};

export const testThread = {
  id: 'thread-1',
  subject: 'Test Thread',
  snippet: 'This is a test thread snippet...',
  messageCount: 3,
  isRead: false,
  isStarred: false,
  lastMessageAt: new Date().toISOString(),
};

// Helper to wait for async operations
export const waitFor = async (callback: () => boolean | void, timeout = 5000) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = callback();
      if (result !== false) return;
    } catch {
      // Keep trying
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
};

// Helper to create mock Next.js request
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    ip?: string;
  } = {}
) {
  const { method = 'GET', headers = {}, ip = '127.0.0.1' } = options;

  return {
    url,
    method,
    headers: new Headers(headers),
    ip,
    nextUrl: new URL(url, 'http://localhost:3000'),
    geo: { country: 'US' },
    cookies: {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    },
  };
}
