/**
 * Domain Schema Tests
 * Tests for domain-related types and schema definitions
 */

import { describe, it, expect } from 'vitest';
import type { DomainBranding, ContentFilterRule, BIMIConfig, MTASTSConfig } from './domains';

describe('Domain Schema Types', () => {
  describe('DomainBranding', () => {
    it('should accept valid branding configuration', () => {
      const branding: DomainBranding = {
        primaryColor: '#1a73e8',
        secondaryColor: '#0078d4',
        accentColor: '#4285f4',
        logoUrl: 'https://example.com/logo.png',
        logoDarkUrl: 'https://example.com/logo-dark.png',
        faviconUrl: 'https://example.com/favicon.ico',
        loginBackgroundUrl: 'https://example.com/bg.jpg',
        customCss: '.header { color: red; }',
      };

      expect(branding.primaryColor).toBe('#1a73e8');
      expect(branding.logoUrl).toBe('https://example.com/logo.png');
    });

    it('should allow null values for optional URLs', () => {
      const branding: DomainBranding = {
        primaryColor: '#ffffff',
        secondaryColor: '#000000',
        accentColor: '#ff0000',
        logoUrl: null,
        logoDarkUrl: null,
        faviconUrl: null,
        loginBackgroundUrl: null,
        customCss: null,
      };

      expect(branding.logoUrl).toBeNull();
      expect(branding.customCss).toBeNull();
    });
  });

  describe('ContentFilterRule', () => {
    it('should accept valid content filter rule', () => {
      const rule: ContentFilterRule = {
        id: 'rule-123',
        name: 'Block spam words',
        enabled: true,
        criteria: [
          {
            field: 'subject',
            operator: 'contains',
            value: 'viagra',
            caseSensitive: false,
          },
          {
            field: 'body',
            operator: 'regex',
            value: '\\b(?:free|winner)\\b',
            caseSensitive: false,
          },
        ],
        action: 'quarantine',
        actionParams: {
          reason: 'Suspected spam',
          notifyAdmin: 'true',
        },
      };

      expect(rule.id).toBe('rule-123');
      expect(rule.criteria).toHaveLength(2);
      expect(rule.action).toBe('quarantine');
    });

    it('should support all filter operators', () => {
      const operators: Array<'contains' | 'equals' | 'regex' | 'starts_with' | 'ends_with'> = [
        'contains',
        'equals',
        'regex',
        'starts_with',
        'ends_with',
      ];

      operators.forEach((operator) => {
        const rule: ContentFilterRule = {
          id: `rule-${operator}`,
          name: `Test ${operator}`,
          enabled: true,
          criteria: [
            {
              field: 'subject',
              operator,
              value: 'test',
              caseSensitive: false,
            },
          ],
          action: 'tag',
          actionParams: { tag: 'filtered' },
        };

        expect(rule.criteria[0].operator).toBe(operator);
      });
    });

    it('should support all filter actions', () => {
      const actions: Array<'quarantine' | 'reject' | 'tag' | 'redirect'> = [
        'quarantine',
        'reject',
        'tag',
        'redirect',
      ];

      actions.forEach((action) => {
        const rule: ContentFilterRule = {
          id: `rule-${action}`,
          name: `Test ${action}`,
          enabled: true,
          criteria: [],
          action,
          actionParams: {},
        };

        expect(rule.action).toBe(action);
      });
    });

    it('should support all filter fields', () => {
      const fields: Array<'subject' | 'body' | 'from' | 'to' | 'headers'> = [
        'subject',
        'body',
        'from',
        'to',
        'headers',
      ];

      fields.forEach((field) => {
        const rule: ContentFilterRule = {
          id: `rule-${field}`,
          name: `Test ${field}`,
          enabled: true,
          criteria: [
            {
              field,
              operator: 'contains',
              value: 'test',
              caseSensitive: false,
            },
          ],
          action: 'tag',
          actionParams: {},
        };

        expect(rule.criteria[0].field).toBe(field);
      });
    });
  });

  describe('BIMIConfig', () => {
    it('should accept valid BIMI configuration', () => {
      const bimi: BIMIConfig = {
        enabled: true,
        selector: 'default',
        logoUrl: 'https://example.com/logo.svg',
        vmcUrl: 'https://example.com/vmc.pem',
        lastVerifiedAt: '2024-01-15T10:30:00Z',
        logoValid: true,
        vmcValid: true,
      };

      expect(bimi.enabled).toBe(true);
      expect(bimi.logoUrl).toBe('https://example.com/logo.svg');
      expect(bimi.vmcValid).toBe(true);
    });

    it('should allow disabled BIMI configuration', () => {
      const bimi: BIMIConfig = {
        enabled: false,
        selector: 'default',
        logoUrl: null,
        vmcUrl: null,
        lastVerifiedAt: null,
        logoValid: false,
        vmcValid: false,
      };

      expect(bimi.enabled).toBe(false);
      expect(bimi.logoUrl).toBeNull();
    });

    it('should support custom selectors', () => {
      const bimi: BIMIConfig = {
        enabled: true,
        selector: 'brand2024',
        logoUrl: 'https://example.com/logo2024.svg',
        vmcUrl: null,
        lastVerifiedAt: null,
        logoValid: true,
        vmcValid: false,
      };

      expect(bimi.selector).toBe('brand2024');
    });
  });

  describe('MTASTSConfig', () => {
    it('should accept valid MTA-STS configuration', () => {
      const mtaSts: MTASTSConfig = {
        enabled: true,
        mode: 'enforce',
        mxHosts: ['*.mail.example.com', 'backup.mail.example.com'],
        maxAge: 604800,
        policyId: '1705320000',
        tlsRptEmail: 'tls-reports@example.com',
        lastVerifiedAt: '2024-01-15T10:30:00Z',
      };

      expect(mtaSts.enabled).toBe(true);
      expect(mtaSts.mode).toBe('enforce');
      expect(mtaSts.mxHosts).toHaveLength(2);
      expect(mtaSts.maxAge).toBe(604800);
    });

    it('should support all MTA-STS modes', () => {
      const modes: Array<'none' | 'testing' | 'enforce'> = ['none', 'testing', 'enforce'];

      modes.forEach((mode) => {
        const mtaSts: MTASTSConfig = {
          enabled: mode !== 'none',
          mode,
          mxHosts: ['mail.example.com'],
          maxAge: 86400,
          policyId: '123456',
          tlsRptEmail: null,
          lastVerifiedAt: null,
        };

        expect(mtaSts.mode).toBe(mode);
      });
    });

    it('should allow disabled MTA-STS configuration', () => {
      const mtaSts: MTASTSConfig = {
        enabled: false,
        mode: 'none',
        mxHosts: [],
        maxAge: 604800,
        policyId: '',
        tlsRptEmail: null,
        lastVerifiedAt: null,
      };

      expect(mtaSts.enabled).toBe(false);
      expect(mtaSts.mxHosts).toHaveLength(0);
    });
  });
});

describe('Domain Schema Validation Helpers', () => {
  describe('Color validation', () => {
    it('should validate hex color format', () => {
      const isValidHexColor = (color: string): boolean => {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
      };

      expect(isValidHexColor('#1a73e8')).toBe(true);
      expect(isValidHexColor('#fff')).toBe(true);
      expect(isValidHexColor('#FFFFFF')).toBe(true);
      expect(isValidHexColor('1a73e8')).toBe(false);
      expect(isValidHexColor('#gggggg')).toBe(false);
      expect(isValidHexColor('blue')).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('should validate HTTPS URLs for BIMI', () => {
      const isValidBIMIUrl = (url: string | null): boolean => {
        if (!url) return false;
        return url.startsWith('https://') && (url.endsWith('.svg') || url.endsWith('.pem'));
      };

      expect(isValidBIMIUrl('https://example.com/logo.svg')).toBe(true);
      expect(isValidBIMIUrl('https://example.com/vmc.pem')).toBe(true);
      expect(isValidBIMIUrl('http://example.com/logo.svg')).toBe(false);
      expect(isValidBIMIUrl('https://example.com/logo.png')).toBe(false);
      expect(isValidBIMIUrl(null)).toBe(false);
    });
  });

  describe('Email validation', () => {
    it('should validate TLS-RPT email format', () => {
      const isValidEmail = (email: string | null): boolean => {
        if (!email) return false;
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
      };

      expect(isValidEmail('tls-reports@example.com')).toBe(true);
      expect(isValidEmail('admin@mail.example.org')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });

  describe('Policy ID generation', () => {
    it('should generate valid MTA-STS policy IDs', () => {
      const generatePolicyId = (): string => {
        return Math.floor(Date.now() / 1000).toString();
      };

      const id = generatePolicyId();
      expect(id).toMatch(/^\d+$/);
      expect(parseInt(id)).toBeGreaterThan(0);
    });
  });
});
