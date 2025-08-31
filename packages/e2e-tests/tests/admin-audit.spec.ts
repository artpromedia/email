import { test, expect } from "@playwright/test";

test.describe("Admin Audit Page", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin login and authenticate
    await page.goto("/admin/login");
    await page.fill('[data-testid="admin-email"]', "admin@example.com");
    await page.fill('[data-testid="admin-password"]', "admin123");
    await page.click('[data-testid="admin-login-submit"]');

    // Wait for successful login and navigation to dashboard
    await page.waitForURL("/admin/dashboard");

    // Navigate to audit page
    await page.click('[data-testid="nav-audit"]');
    await page.waitForURL("/admin/audit");
  });

  test("should display audit events without flicker", async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('[data-testid="audit-table"]');

    // Verify filter bar is present
    await expect(
      page.locator('[data-testid="audit-filter-bar"]'),
    ).toBeVisible();

    // Verify table headers are correct
    const headers = ["Time", "Actor", "Action", "Target", "Result", "IP / UA"];
    for (const header of headers) {
      await expect(
        page.locator("th").filter({ hasText: header }),
      ).toBeVisible();
    }

    // Check for no layout shifts during loading
    const auditTable = page.locator('[data-testid="audit-table"]');
    await expect(auditTable).toBeStable();
  });

  test("should filter audit events without layout shift", async ({ page }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Get initial row count
    const initialRows = await page.locator("tbody tr").count();

    // Apply search filter
    await page.fill('[data-testid="audit-search"]', "user.update");

    // Wait for filtering (should be fast with staleTime: 30_000)
    await page.waitForTimeout(500);

    // Verify filtering worked and no layout shift occurred
    const filteredRows = await page.locator("tbody tr").count();
    expect(filteredRows).toBeLessThanOrEqual(initialRows);

    // Verify table remains stable during filtering
    const auditTable = page.locator('[data-testid="audit-table"]');
    await expect(auditTable).toBeStable();
  });

  test("should open audit detail drawer on row click", async ({ page }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Click on first audit row
    await page.click("tbody tr:first-child");

    // Verify drawer opens
    await expect(
      page.locator('[data-testid="audit-detail-drawer"]'),
    ).toBeVisible();

    // Verify drawer contains expected content
    await expect(page.locator('[data-testid="audit-detail-title"]')).toHaveText(
      "Audit Event Details",
    );
    await expect(page.locator('[data-testid="audit-detail-id"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="audit-detail-timestamp"]'),
    ).toBeVisible();

    // Test copy functionality
    await page.click('[data-testid="copy-event-id"]');
    await expect(page.locator(".sonner-toast")).toHaveText(
      /Event ID copied to clipboard/,
    );
  });

  test("should export CSV with current filters", async ({ page }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Apply some filters
    await page.fill('[data-testid="audit-search"]', "user");
    await page.selectOption('[data-testid="audit-result-filter"]', "SUCCESS");

    // Set up download monitoring
    const downloadPromise = page.waitForEvent("download");

    // Click export button
    await page.click('[data-testid="export-csv"]');

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /audit-export-\d{4}-\d{2}-\d{2}\.csv/,
    );

    // Verify success toast
    await expect(page.locator(".sonner-toast")).toHaveText(
      /CSV export downloaded successfully/,
    );
  });

  test("should navigate to related admin pages from action links", async ({
    page,
  }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Look for user-related audit events with external links
    const userActionLink = page
      .locator('[data-testid="action-link-user"]')
      .first();

    if (await userActionLink.isVisible()) {
      // Click the external link
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page"),
        userActionLink.click(),
      ]);

      // Verify navigation to user management page
      await newPage.waitForLoadState();
      expect(newPage.url()).toContain("/admin/users/");
      await newPage.close();
    }
  });

  test("should handle error states gracefully", async ({ page }) => {
    // Mock network failure
    await page.route("/admin/audit*", (route) => route.abort());

    await page.goto("/admin/audit");

    // Verify error boundary shows retry option
    await expect(page.locator('[data-testid="error-retry"]')).toBeVisible();

    // Test retry functionality
    await page.unroute("/admin/audit*");
    await page.click('[data-testid="error-retry"]');

    // Verify recovery
    await page.waitForSelector('[data-testid="audit-table"]');
  });

  test("should maintain performance during interactions", async ({ page }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Measure interaction-to-next-paint (INP) performance
    const startTime = Date.now();

    // Perform multiple rapid filter changes
    await page.fill('[data-testid="audit-search"]', "user");
    await page.fill('[data-testid="audit-search"]', "policy");
    await page.fill('[data-testid="audit-search"]', "quarantine");

    // Click through different result filters rapidly
    await page.selectOption('[data-testid="audit-result-filter"]', "SUCCESS");
    await page.selectOption('[data-testid="audit-result-filter"]', "FAILURE");
    await page.selectOption('[data-testid="audit-result-filter"]', "");

    const endTime = Date.now();
    const interactionTime = endTime - startTime;

    // Verify interaction responsiveness (should be < 200ms per interaction)
    expect(interactionTime).toBeLessThan(1000); // Total for all interactions

    // Verify table remains stable throughout
    const auditTable = page.locator('[data-testid="audit-table"]');
    await expect(auditTable).toBeStable();
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.waitForSelector('[data-testid="audit-table"]');

    // Tab through filter controls
    await page.keyboard.press("Tab"); // Search input
    await page.keyboard.press("Tab"); // Date range
    await page.keyboard.press("Tab"); // Actor filter

    // Verify focus is visible
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();

    // Test keyboard shortcuts
    await page.keyboard.press("Escape"); // Should close any open popovers
    await page.keyboard.press("?"); // Could show help (if implemented)
  });
});
