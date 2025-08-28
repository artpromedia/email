import createClient from 'openapi-fetch';
import type { paths } from './types';

export type { paths, components } from './types';

export interface ClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}

export function createCeerionMailClient(config: ClientConfig = {}) {
  const { baseUrl = 'http://localhost:4000', headers = {} } = config;

  const client = createClient<paths>({
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  return {
    client,
    
    // Health endpoints
    health: {
      check: () => client.GET('/healthz'),
    },

    // Auth endpoints
    auth: {
      login: (body: { email: string; password: string }) =>
        client.POST('/api/v1/auth/login', { body }),
    },
  };
}

export default createCeerionMailClient;
