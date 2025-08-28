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
      ready: () => client.GET('/readyz'),
    },

    // Auth endpoints
    auth: {
      login: (body: { email: string; password: string; rememberMe: boolean; mfaCode?: string }) =>
        client.POST('/auth/login', { body }),
      refresh: () => client.POST('/auth/refresh'),
      logout: () => client.POST('/auth/logout'),
    },

    // Mail endpoints
    mail: {
      getMessages: (params?: { 
        folder?: string; 
        label?: string; 
        search?: string; 
        limit?: number; 
        offset?: number; 
      }) => client.GET('/mail/messages', { params: { query: params } }),
      
      getMessage: (id: string) => client.GET('/mail/messages/{id}', { 
        params: { path: { id } } 
      }),
      
      send: (body: {
        to: string[];
        cc?: string[];
        bcc?: string[];
        subject: string;
        body: string;
        htmlBody?: string;
        attachments?: string[];
        priority: 'low' | 'normal' | 'high';
      }) => client.POST('/mail/send', { body }),
      
      saveDraft: (body: {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        body?: string;
        htmlBody?: string;
        attachments?: string[];
      }) => client.POST('/mail/drafts', { body }),
      
      // Note: Draft update endpoint may not be available, removing for now
      
      mark: (body: {
        messageIds: string[];
        action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive';
      }) => client.POST('/mail/mark', { body }),
      
      move: (body: {
        messageIds: string[];
        folder: string;
      }) => client.POST('/mail/move', { body }),
      
      snooze: (body: {
        messageIds: string[];
        snoozeUntil: string;
      }) => client.POST('/mail/snooze', { body }),
    },

    // Policy endpoints
    policy: {
      getTrustedSenders: () => client.GET('/policy/trusted-senders'),
      addTrustedSender: (body: { email: string; domain?: string }) => 
        client.POST('/policy/trusted-senders', { body }),
    },

    // Settings endpoints
    settings: {
      get: () => client.GET('/settings'),
      update: (body: Record<string, any>) => client.PUT('/settings', { body }),
    },
  };
}

export default createCeerionMailClient;
