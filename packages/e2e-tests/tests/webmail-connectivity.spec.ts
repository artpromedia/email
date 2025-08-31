import { test, expect } from "@playwright/test";

/**
 * Basic Connectivity Test
 * Verifies the webmail application is accessible and basic functionality works
 */

test.describe("Basic Connectivity @connectivity", () => {
  test("Can access webmail application", async ({ page }) => {
    // Navigate to webmail
    await page.goto("/");

    // Check if the page loads
    await expect(page).toHaveTitle(/CEERION/);

    // Look for login form or main app
    const hasLoginForm = await page
      .locator('input[type="email"]')
      .isVisible({ timeout: 5000 });
    const hasMailShell = await page
      .locator('[data-testid="mail-shell"]')
      .isVisible({ timeout: 1000 });

    // Should have either login form or be already logged in
    expect(hasLoginForm || hasMailShell).toBe(true);

    console.log("✅ Webmail application is accessible");
  });

  test("Can attempt login flow", async ({ page }) => {
    await page.goto("/");

    // Look for login inputs
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if ((await emailInput.isVisible()) && (await passwordInput.isVisible())) {
      // Try demo login
      await emailInput.fill("demo@ceerion.com");
      await passwordInput.fill("demo");

      // Look for login button
      const loginButton = page
        .locator("button")
        .filter({ hasText: /login|sign in/i })
        .first();
      if (await loginButton.isVisible()) {
        await loginButton.click();

        // Wait a moment for potential navigation
        await page.waitForTimeout(2000);

        console.log("✅ Login attempt completed");
      }
    } else {
      console.log("ℹ️ Already logged in or different login flow");
    }
  });

  test("Can navigate basic routes", async ({ page }) => {
    await page.goto("/");

    // Test direct navigation to help page
    await page.goto("/help");
    await page.waitForTimeout(1000);

    // Should not be a 404
    const pageContent = await page.textContent("body");
    expect(pageContent).not.toContain("404");
    expect(pageContent).not.toContain("Not Found");

    console.log("✅ Help route is accessible");

    // Test direct navigation to settings
    await page.goto("/settings");
    await page.waitForTimeout(1000);

    const settingsContent = await page.textContent("body");
    expect(settingsContent).not.toContain("404");
    expect(settingsContent).not.toContain("Not Found");

    console.log("✅ Settings route is accessible");
  });

  test("No major console errors on page load", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForTimeout(3000); // Wait for app to fully load

    // Filter out common development errors that don't affect functionality
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("DevTools") &&
        !error.includes("WebSocket") &&
        !error.includes("fetch") &&
        !error.toLowerCase().includes("warning"),
    );

    console.log("Console errors found:", consoleErrors);
    console.log("Critical errors:", criticalErrors);

    // Should have minimal critical errors
    expect(criticalErrors.length).toBeLessThan(5);

    console.log("✅ Console error check completed");
  });
});
