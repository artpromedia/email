/**
 * Authentication fixtures for Playwright E2E tests
 * Provides helper functions for authenticated test scenarios
 */

import { test as base, type Page, type APIRequestContext } from "@playwright/test";

export { expect } from "@playwright/test";

// Test user credentials
export const TEST_USERS = {
  admin: {
    email: "admin@test.example.com",
    password: "AdminPassword123!",
    role: "admin",
    mfaEnabled: true,
  },
  user: {
    email: "user@test.example.com",
    password: "UserPassword123!",
    role: "user",
    mfaEnabled: false,
  },
  orgAdmin: {
    email: "orgadmin@test.example.com",
    password: "OrgAdminPassword123!",
    role: "org_admin",
    mfaEnabled: false,
  },
};

interface AuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthenticatedFixtures {
  authenticatedPage: Page;
  adminPage: Page;
  orgAdminPage: Page;
  authState: AuthState | null;
}

/**
 * Login helper that handles authentication
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");

  // Wait for the login form to be ready
  await page.waitForSelector(
    'input[type="email"], input[name="email"], [data-testid="email-input"]'
  );

  // Fill credentials
  const emailInput = page.getByLabel(/email/i).or(page.locator('[data-testid="email-input"]'));
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator('[data-testid="password-input"]'));

  await emailInput.fill(email);
  await passwordInput.fill(password);

  // Submit form
  await page.getByRole("button", { name: /sign in|log in|submit/i }).click();

  // Wait for navigation away from login
  await page
    .waitForURL((url: URL) => !url.pathname.includes("/login"), { timeout: 15000 })
    .catch(() => {
      // In test environment without backend, may not redirect
    });
}

/**
 * Login via API for faster test setup
 */
export async function loginViaAPI(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<AuthState | null> {
  try {
    const response = await request.post("/api/auth/login", {
      data: { email, password },
    });

    if (response.ok()) {
      const data = await response.json();
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      };
    }
  } catch {
    // API login not available in test environment
  }
  return null;
}

/**
 * Set authentication cookies/storage after API login
 */
export async function setAuthState(page: Page, authState: AuthState): Promise<void> {
  await page.evaluate((state: AuthState) => {
    localStorage.setItem("accessToken", state.accessToken);
    localStorage.setItem("refreshToken", state.refreshToken);
    localStorage.setItem("expiresAt", state.expiresAt.toString());
  }, authState);
}

/**
 * Logout helper
 */
export async function logout(page: Page): Promise<void> {
  // Try clicking logout button if visible
  const logoutButton = page.getByRole("button", { name: /logout|sign out/i });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  } else {
    // Navigate to logout endpoint directly
    await page.goto("/api/auth/logout");
  }

  // Clear storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<AuthenticatedFixtures>({
  authenticatedPage: async ({ page, request }, use) => {
    // Attempt API login first for speed
    const authState = await loginViaAPI(request, TEST_USERS.user.email, TEST_USERS.user.password);

    if (authState) {
      await setAuthState(page, authState);
      await page.goto("/");
    } else {
      // Fall back to UI login
      await login(page, TEST_USERS.user.email, TEST_USERS.user.password);
    }

    await use(page);

    // Cleanup
    await logout(page);
  },

  adminPage: async ({ page, request }, use) => {
    const authState = await loginViaAPI(request, TEST_USERS.admin.email, TEST_USERS.admin.password);

    if (authState) {
      await setAuthState(page, authState);
      await page.goto("/");
    } else {
      await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
    }

    await use(page);
    await logout(page);
  },

  orgAdminPage: async ({ page, request }, use) => {
    const authState = await loginViaAPI(
      request,
      TEST_USERS.orgAdmin.email,
      TEST_USERS.orgAdmin.password
    );

    if (authState) {
      await setAuthState(page, authState);
      await page.goto("/");
    } else {
      await login(page, TEST_USERS.orgAdmin.email, TEST_USERS.orgAdmin.password);
    }

    await use(page);
    await logout(page);
  },

  authState: async ({ request }, use) => {
    const state = await loginViaAPI(request, TEST_USERS.user.email, TEST_USERS.user.password);
    await use(state);
  },
});
