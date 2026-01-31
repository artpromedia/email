import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test('should redirect unauthenticated users to login from settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/login/);
  });

  test('should redirect unauthenticated users from account settings', async ({ page }) => {
    await page.goto('/settings/account');
    await expect(page).toHaveURL(/login/);
  });

  test('should redirect unauthenticated users from AI settings', async ({ page }) => {
    await page.goto('/settings/ai');
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Admin Pages', () => {
  test('should redirect unauthenticated users from admin domains', async ({ page }) => {
    await page.goto('/admin/domains');
    await expect(page).toHaveURL(/login/);
  });

  test('should redirect unauthenticated users from new domain page', async ({ page }) => {
    await page.goto('/admin/domains/new');
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Navigation', () => {
  test('should handle 404 for non-existent routes', async ({ page }) => {
    const response = await page.goto('/non-existent-route-xyz');
    // Should either show 404 or redirect to home/login
    const status = response?.status();
    expect([200, 302, 404]).toContain(status);
  });
});

test.describe('Responsive Design', () => {
  test('should be usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');

    // Form should still be visible and usable on mobile
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('should be usable on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('should be usable on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('login page should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe('Security Headers', () => {
  test('should have appropriate security headers', async ({ request }) => {
    const response = await request.get('/login');
    const headers = response.headers();

    // Check for common security headers (may not all be present in dev)
    // These tests verify headers are properly configured in production
    if (process.env.CI) {
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/);
    }
  });
});
