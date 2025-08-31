import { test, expect } from "@playwright/test";

/**
 * Admin Interface - No Flicker & Static Buttons Tests
 * Ensures smooth navigation and proper loading states without flickering
 */

test.describe("Admin - No Flicker & Static Buttons", () => {
  test.beforeEach(async ({ page }) => {
    // Start monitoring console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Store console errors for later assertion
    (page as any).consoleErrors = consoleErrors;

    // Navigate to admin and login
    await page.goto("http://localhost:3001/");

    // Wait for admin login or dashboard to load
    await page.waitForLoadState("networkidle");
  });

  test("Navigate list → detail → back with no console errors and proper skeletons", async ({
    page,
  }) => {
    // Navigate to Users list
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Wait for skeleton to disappear and data to load
    await page.waitForSelector('[data-testid="skeleton"]', {
      state: "detached",
      timeout: 5000,
    });

    // Click on first user row to go to detail
    await page.click('[data-testid="user-row"]:first-child');
    await page.waitForSelector('[data-testid="user-detail"]', {
      timeout: 10000,
    });

    // Ensure skeleton appears during loading, not a flash
    const skeletonVisible = await page.isVisible('[data-testid="skeleton"]');
    if (skeletonVisible) {
      // If skeleton is visible, wait for it to disappear
      await page.waitForSelector('[data-testid="skeleton"]', {
        state: "detached",
        timeout: 5000,
      });
    }

    // Navigate back to list
    await page.goBack();
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Assert no console errors occurred during navigation
    const consoleErrors = (page as any).consoleErrors;
    expect(consoleErrors).toHaveLength(0);
  });

  test("Row action: Toggle Admin (optimistic), rollback on forced 500", async ({
    page,
  }) => {
    // Navigate to Users list
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Intercept the API call and force a 500 error
    await page.route("**/api/users/*/admin", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    // Find a user row and get initial admin status
    const firstUserRow = page.locator('[data-testid="user-row"]').first();
    const adminToggle = firstUserRow.locator('[data-testid="admin-toggle"]');

    const initialState = await adminToggle.isChecked();

    // Click the toggle (optimistic update)
    await adminToggle.click();

    // Verify optimistic update happened immediately
    const optimisticState = await adminToggle.isChecked();
    expect(optimisticState).toBe(!initialState);

    // Wait for the API call to fail and rollback
    await page.waitForTimeout(2000);

    // Verify rollback occurred
    const finalState = await adminToggle.isChecked();
    expect(finalState).toBe(initialState);

    // Verify error toast appeared
    await expect(page.locator('[data-testid="toast-error"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("Detail: change quota, add alias, unlink OIDC, revoke sessions → network calls & toasts", async ({
    page,
  }) => {
    // Track network requests
    const networkCalls: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") {
        networkCalls.push(`${request.method()} ${request.url()}`);
      }
    });

    // Navigate to user detail
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });
    await page.click('[data-testid="user-row"]:first-child');
    await page.waitForSelector('[data-testid="user-detail"]', {
      timeout: 10000,
    });

    // Test quota change
    await page.click('[data-testid="security-tab"]');
    await page.fill('[data-testid="quota-input"]', "2048");
    await page.click('[data-testid="save-quota"]');

    // Verify network call and toast
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({
      timeout: 5000,
    });
    expect(networkCalls.some((call) => call.includes("quota"))).toBe(true);

    // Test add alias
    await page.fill('[data-testid="alias-input"]', "newalias@example.com");
    await page.click('[data-testid="add-alias"]');

    // Verify network call and toast
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({
      timeout: 5000,
    });
    expect(networkCalls.some((call) => call.includes("alias"))).toBe(true);

    // Test unlink OIDC
    const unlinkButton = page.locator('[data-testid="unlink-oidc"]');
    if (await unlinkButton.isVisible()) {
      await unlinkButton.click();
      await page.click('[data-testid="confirm-unlink"]');

      // Verify network call and toast
      await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({
        timeout: 5000,
      });
      expect(networkCalls.some((call) => call.includes("oidc"))).toBe(true);
    }

    // Test revoke sessions
    await page.click('[data-testid="revoke-sessions"]');
    await page.click('[data-testid="confirm-revoke"]');

    // Verify network call and toast
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({
      timeout: 5000,
    });
    expect(networkCalls.some((call) => call.includes("sessions"))).toBe(true);
  });

  test("Bulk import dry run → shows preview row errors; confirm → progress → success", async ({
    page,
  }) => {
    // Navigate to import page
    await page.click('nav a[href="/users/import"]');
    await page.waitForSelector('[data-testid="import-page"]', {
      timeout: 10000,
    });

    // Create a CSV with some invalid rows
    const csvContent = `email,firstName,lastName,role
valid@example.com,John,Doe,user
invalid-email,Jane,Smith,user
duplicate@example.com,Bob,Wilson,admin
duplicate@example.com,Alice,Johnson,user`;

    // Upload the CSV file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test-users.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Wait for validation to complete
    await page.waitForSelector('[data-testid="validation-complete"]', {
      timeout: 10000,
    });

    // Click preview to see errors
    await page.click('[data-testid="preview-import"]');
    await page.waitForSelector('[data-testid="import-preview-dialog"]', {
      timeout: 5000,
    });

    // Verify error rows are shown
    await expect(page.locator('[data-testid="error-row"]')).toHaveCount(2); // invalid email + duplicate
    await expect(page.locator('[data-testid="valid-row"]')).toHaveCount(2);

    // Close preview and start import
    await page.click('[data-testid="close-preview"]');
    await page.click('[data-testid="start-import"]');

    // Verify progress tracking
    await expect(page.locator('[data-testid="import-progress"]')).toBeVisible({
      timeout: 5000,
    });

    // Wait for completion
    await page.waitForSelector('[data-testid="import-complete"]', {
      timeout: 30000,
    });

    // Verify success message
    await expect(page.locator('[data-testid="import-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="imported-count"]')).toContainText(
      "2",
    ); // Only valid rows
  });

  test("Users table virtualization performance", async ({ page }) => {
    // Navigate to users page
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Measure initial render time
    const startTime = Date.now();
    await page.waitForSelector('[data-testid="skeleton"]', {
      state: "detached",
      timeout: 10000,
    });
    const loadTime = Date.now() - startTime;

    // Ensure initial load is reasonable (less than 3 seconds)
    expect(loadTime).toBeLessThan(3000);

    // Test scroll performance
    const scrollContainer = page.locator('[data-testid="table-container"]');

    // Perform scroll and measure render time
    const scrollStart = Date.now();
    await scrollContainer.evaluate((el) => el.scrollBy(0, 1000));

    // Wait for any loading states to complete
    await page.waitForTimeout(100);

    const scrollTime = Date.now() - scrollStart;

    // Ensure scroll renders within 16ms (60fps) or reasonable threshold
    expect(scrollTime).toBeLessThan(200); // More realistic threshold for E2E tests
  });

  test("No static buttons or loading flicker during state changes", async ({
    page,
  }) => {
    // Navigate to users
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Test filter application without flicker
    await page.fill('[data-testid="search-input"]', "test");

    // Wait a brief moment for debounce
    await page.waitForTimeout(500);

    // Verify no static content flash
    const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
    const tableRows = page.locator('[data-testid="user-row"]');

    // During loading, should show proper loading state, not empty flash
    if (await loadingIndicator.isVisible()) {
      // If loading indicator is visible, table should not show empty state
      const emptyState = page.locator('[data-testid="empty-state"]');
      expect(await emptyState.isVisible()).toBe(false);
    }

    // Clear search and verify smooth transition
    await page.fill('[data-testid="search-input"]', "");
    await page.waitForTimeout(500);

    // Verify table shows content without flicker
    await expect(tableRows.first()).toBeVisible({ timeout: 5000 });
  });

  test("Bulk actions with proper loading states", async ({ page }) => {
    // Navigate to users
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Select multiple users
    await page.click('[data-testid="select-all"]');

    // Trigger bulk action
    await page.click('[data-testid="bulk-actions-trigger"]');
    await page.click('[data-testid="bulk-disable"]');

    // Confirm action
    await page.click('[data-testid="confirm-bulk-action"]');

    // Verify loading state during bulk operation
    await expect(page.locator('[data-testid="bulk-progress"]')).toBeVisible({
      timeout: 5000,
    });

    // Wait for completion
    await page.waitForSelector('[data-testid="bulk-complete"]', {
      timeout: 30000,
    });

    // Verify success toast
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();

    // Verify no console errors
    const consoleErrors = (page as any).consoleErrors;
    expect(consoleErrors).toHaveLength(0);
  });
});
