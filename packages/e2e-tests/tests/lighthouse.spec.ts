import { test, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

/**
 * Lighthouse Performance Tests
 * Ensures Core Web Vitals meet strict budgets: LCP ≤ 2.2s, INP ≤ 200ms
 * Uses hard CI gates for performance regressions
 */

const performanceThresholds = {
  performance: 90,
  accessibility: 95,
  'best-practices': 85,
  seo: 90,
  // Core Web Vitals budgets
  'largest-contentful-paint': 2200, // 2.2s
  'first-contentful-paint': 1800,   // 1.8s
  'cumulative-layout-shift': 0.1,   // 0.1 CLS
  'interaction-to-next-paint': 200, // 200ms INP
  'speed-index': 3000,              // 3s
  'total-blocking-time': 200        // 200ms TBT
};

test.describe('Lighthouse Performance Audits', () => {
  test('Webmail - Desktop Performance', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const auditResult = await playAudit({
      page,
      port: 9222,
      thresholds: performanceThresholds,
      opts: {
        logLevel: 'error',
      },
    });

    expect(auditResult.lhr.categories.performance.score).toBeGreaterThan(0.9);
    expect(auditResult.lhr.audits['largest-contentful-paint'].numericValue).toBeLessThan(2200);
    expect(auditResult.lhr.audits['cumulative-layout-shift'].numericValue).toBeLessThan(0.1);
  });

  test('Admin - Dashboard Performance', async ({ page }) => {
    await page.goto('http://localhost:5174/admin');
    await page.waitForLoadState('networkidle');

    const auditResult = await playAudit({
      page,
      port: 9222,
      thresholds: performanceThresholds,
      opts: {
        logLevel: 'error',
      },
    });

    expect(auditResult.lhr.categories.performance.score).toBeGreaterThan(0.9);
    expect(auditResult.lhr.audits['largest-contentful-paint'].numericValue).toBeLessThan(2200);
  });
});
