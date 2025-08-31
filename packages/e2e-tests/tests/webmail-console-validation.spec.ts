import { test, expect, Page } from "@playwright/test";

/**
 * Console Error Detection and Performance Tests
 *  test('Zero console errors during email operations'  test('Zero console errors during settings operations', async () => {
  test('Zero console errors during help system operations', async () => {
    // Login
    await page.fill('#email', 'demo@ceerion.com');  
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');/ Login
    await page.fill('#email', 'demo@ceerion.com');  
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');nc () => {
    // Login
    await page.fill('#email', 'demo@ceerion.com');  
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');res zero console errors and validates performance metrics
 */

test.describe("Console & Performance Validation @performance", () => {
  let page: Page;
  let consoleErrors: string[] = [];
  let consoleWarnings: string[] = [];

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    consoleErrors = [];
    consoleWarnings = [];

    // Comprehensive console monitoring
    page.on("console", (msg) => {
      const text = msg.text();
      const type = msg.type();

      // Collect errors and warnings
      if (type === "error") {
        consoleErrors.push(`[ERROR] ${text}`);
      } else if (type === "warning") {
        consoleWarnings.push(`[WARNING] ${text}`);
      }

      // Log for debugging
      console.log(`[${type.toUpperCase()}] ${text}`);
    });

    // Monitor page errors
    page.on("pageerror", (error) => {
      consoleErrors.push(`[PAGE ERROR] ${error.message}`);
    });

    // Monitor response errors
    page.on("response", (response) => {
      if (response.status() >= 400) {
        consoleErrors.push(
          `[HTTP ERROR] ${response.status()} ${response.url()}`,
        );
      }
    });

    // Monitor failed requests
    page.on("requestfailed", (request) => {
      consoleErrors.push(
        `[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`,
      );
    });

    // Navigate to webmail
    await page.goto("/");
  });

  test.afterEach(async () => {
    // Report console issues
    if (consoleErrors.length > 0) {
      console.log("Console Errors Detected:", consoleErrors);
    }
    if (consoleWarnings.length > 0) {
      console.log("Console Warnings Detected:", consoleWarnings);
    }
  });

  test("Zero console errors during login flow", async () => {
    // Login
    await page.fill("#email", "demo@ceerion.com");
    await page.fill("#password", "demo");
    await page.click('button[type="submit"]'); // Wait for app to load
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible({
      timeout: 10000,
    });

    // Wait additional time for async operations
    await page.waitForTimeout(2000);

    // Assert no console errors
    expect(
      consoleErrors,
      `Console errors during login: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Zero console errors during navigation", async () => {
    // Login first
    await page.fill('[data-testid="email-input"]', "demo@ceerion.com");
    await page.fill('[data-testid="password-input"]', "demo");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible();

    // Clear any login-related errors
    consoleErrors.length = 0;

    // Navigate through all main routes
    const routes = [
      { testId: "folder-inbox", path: "/mail/inbox" },
      { testId: "folder-drafts", path: "/mail/drafts" },
      { testId: "folder-sent", path: "/mail/sent" },
      { testId: "folder-scheduled", path: "/mail/scheduled" },
      { testId: "folder-archive", path: "/mail/archive" },
      { testId: "folder-spam", path: "/mail/spam" },
      { testId: "folder-trash", path: "/mail/trash" },
      { testId: "help-link", path: "/help" },
      { testId: "settings-link", path: "/settings" },
    ];

    for (const route of routes) {
      await page.click(`[data-testid="${route.testId}"]`);
      await page.waitForTimeout(1000); // Allow time for route to load

      // Check for errors after each navigation
      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors found after navigating to ${route.path}: ${consoleErrors.join(", ")}`,
        );
      }
    }

    // Final assertion
    expect(
      consoleErrors,
      `Navigation console errors: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Zero console errors during email operations", async () => {
    // Login
    await page.fill('[data-testid="email-input"]', "demo@ceerion.com");
    await page.fill('[data-testid="password-input"]', "demo");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible();

    consoleErrors.length = 0;

    // Test composing email
    await page.click('[data-testid="compose-btn"]');
    await page.waitForTimeout(500);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors during compose: ${consoleErrors.join(", ")}`,
      );
    }

    // Fill compose form
    await page.fill('[data-testid="compose-to"]', "test@example.com");
    await page.fill('[data-testid="compose-subject"]', "Console Test Email");
    await page.fill(
      '[data-testid="compose-body"]',
      "Testing for console errors.",
    );

    await page.waitForTimeout(500);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors during compose filling: ${consoleErrors.join(", ")}`,
      );
    }

    // Save as draft
    await page.click('[data-testid="save-draft-btn"]');
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors during draft save: ${consoleErrors.join(", ")}`,
      );
    }

    // Test search functionality
    await page.fill('[data-testid="search-input"]', "test search");
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors during search: ${consoleErrors.join(", ")}`,
      );
    }

    // Final assertion
    expect(
      consoleErrors,
      `Email operations console errors: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Zero console errors during settings operations", async () => {
    // Login
    await page.fill('[data-testid="email-input"]', "demo@ceerion.com");
    await page.fill('[data-testid="password-input"]', "demo");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible();

    consoleErrors.length = 0;

    // Navigate to settings
    await page.click('[data-testid="settings-link"]');
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors navigating to settings: ${consoleErrors.join(", ")}`,
      );
    }

    // Test each settings tab
    const settingsTabs = [
      "tab-profile",
      "tab-account",
      "tab-appearance",
      "tab-email",
      "tab-notifications",
      "tab-privacy",
      "tab-security",
      "tab-rules",
      "tab-advanced",
    ];

    for (const tabId of settingsTabs) {
      await page.click(`[data-testid="${tabId}"]`);
      await page.waitForTimeout(500);

      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors in ${tabId}: ${consoleErrors.join(", ")}`,
        );
      }
    }

    // Test rules creation (most complex form)
    await page.click('[data-testid="tab-rules"]');

    const createRuleBtn = page.locator('[data-testid="create-rule-btn"]');
    if (await createRuleBtn.isVisible()) {
      await createRuleBtn.click();
      await page.waitForTimeout(500);

      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors opening rule editor: ${consoleErrors.join(", ")}`,
        );
      }

      // Fill rule form
      await page.fill('[data-testid="rule-name"]', "Console Test Rule");
      await page.selectOption('[data-testid="condition-field"]', "from");
      await page.fill('[data-testid="condition-value"]', "console@test.com");
      await page.selectOption('[data-testid="action-type"]', "label");

      await page.waitForTimeout(500);

      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors filling rule form: ${consoleErrors.join(", ")}`,
        );
      }
    }

    // Final assertion
    expect(
      consoleErrors,
      `Settings operations console errors: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Zero console errors during help system operations", async () => {
    // Login
    await page.fill('[data-testid="email-input"]', "demo@ceerion.com");
    await page.fill('[data-testid="password-input"]', "demo");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible();

    consoleErrors.length = 0;

    // Navigate to help
    await page.click('[data-testid="help-link"]');
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors navigating to help: ${consoleErrors.join(", ")}`,
      );
    }

    // Test search
    await page.fill('[data-testid="help-search"]', "email rules");
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors during help search: ${consoleErrors.join(", ")}`,
      );
    }

    // Test category filtering
    const categories = [
      "category-getting-started",
      "category-security",
      "category-deliverability",
      "category-calendar",
      "category-chat",
    ];

    for (const categoryId of categories) {
      const categoryElement = page.locator(`[data-testid="${categoryId}"]`);
      if (await categoryElement.isVisible()) {
        await categoryElement.click();
        await page.waitForTimeout(500);

        if (consoleErrors.length > 0) {
          throw new Error(
            `Console errors in help category ${categoryId}: ${consoleErrors.join(", ")}`,
          );
        }
      }
    }

    // Test article viewing
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    if (await firstArticle.isVisible()) {
      await firstArticle.click();
      await page.waitForTimeout(1000);

      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors viewing article: ${consoleErrors.join(", ")}`,
        );
      }
    }

    // Test release notes
    await page.click('[data-testid="back-btn"]');
    await page.click('[data-testid="release-notes-btn"]');
    await page.waitForTimeout(500);

    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors opening release notes: ${consoleErrors.join(", ")}`,
      );
    }

    // Final assertion
    expect(
      consoleErrors,
      `Help system console errors: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Performance metrics within acceptable thresholds", async () => {
    // Start performance monitoring
    await page.goto("/", { waitUntil: "networkidle" });

    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType("paint");

      return {
        domContentLoaded:
          navigation.domContentLoadedEventEnd -
          navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: paint.find((p) => p.name === "first-paint")?.startTime || 0,
        firstContentfulPaint:
          paint.find((p) => p.name === "first-contentful-paint")?.startTime ||
          0,
        totalLoadTime: navigation.loadEventEnd - navigation.fetchStart,
      };
    });

    // Assert performance thresholds
    expect(performanceMetrics.domContentLoaded).toBeLessThan(2000); // 2 seconds
    expect(performanceMetrics.firstContentfulPaint).toBeLessThan(3000); // 3 seconds
    expect(performanceMetrics.totalLoadTime).toBeLessThan(5000); // 5 seconds

    // Test login performance
    const loginStart = Date.now();

    await page.fill('[data-testid="email-input"]', "demo@ceerion.com");
    await page.fill('[data-testid="password-input"]', "demo");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible();

    const loginTime = Date.now() - loginStart;
    expect(loginTime).toBeLessThan(3000); // Login should complete within 3 seconds

    // Test navigation performance
    const navigationStart = Date.now();
    await page.click('[data-testid="folder-sent"]');
    await expect(page.locator('[data-testid="mail-list"]')).toBeVisible();
    const navigationTime = Date.now() - navigationStart;
    expect(navigationTime).toBeLessThan(1000); // Navigation should be instant

    // Assert no console errors during performance test
    expect(
      consoleErrors,
      `Performance test console errors: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });
});
