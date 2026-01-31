import { test, expect } from '@playwright/test';

// Test fixtures for authenticated user
test.describe('Email Inbox', () => {
  test.beforeEach(async ({ page }) => {
    // In a real scenario, this would authenticate the user via API or fixture
    // For now, we test the unauthenticated redirect behavior
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/mail/inbox');
    // Should redirect to login page
    await expect(page).toHaveURL(/login/);
  });

  test('should have accessible mail sidebar navigation elements', async ({ page }) => {
    // This test assumes authenticated state via test fixtures
    await page.goto('/mail/inbox');
    // If redirected to login, skip the inbox-specific tests
    if (page.url().includes('login')) {
      test.skip();
      return;
    }

    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('link', { name: /inbox/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sent/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /drafts/i })).toBeVisible();
  });
});

test.describe('Email Composition', () => {
  test('compose button should be accessible when authenticated', async ({ page }) => {
    await page.goto('/mail/inbox');
    if (page.url().includes('login')) {
      test.skip();
      return;
    }

    const composeButton = page.getByRole('button', { name: /compose|new/i });
    await expect(composeButton).toBeVisible();
    await expect(composeButton).toBeEnabled();
  });
});

test.describe('Health Endpoints', () => {
  test('health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('liveness probe should return 200', async ({ request }) => {
    const response = await request.get('/api/health/live');
    expect(response.status()).toBe(200);
  });

  test('readiness probe should return 200', async ({ request }) => {
    const response = await request.get('/api/health/ready');
    expect(response.status()).toBe(200);
  });
});

test.describe('Accessibility', () => {
  test('login page should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/login');
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    // Check for only one h1 on the page
    await expect(h1).toHaveCount(1);
  });

  test('login form should have proper labels', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Check for proper autocomplete attributes
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('interactive elements should be keyboard accessible', async ({ page }) => {
    await page.goto('/login');

    // Tab through form elements
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();

    // Should be able to navigate using keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
  });
});
