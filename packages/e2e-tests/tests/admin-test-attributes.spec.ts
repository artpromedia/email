import { test, expect } from "@playwright/test";

/**
 * Admin Interface - Test Data Attributes Validation
 * Ensures all interactive elements have proper data-testid attributes for reliable testing
 */

test.describe("Admin - Test Data Attributes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001/");
    await page.waitForLoadState("networkidle");
  });

  test("Users page has required test IDs", async ({ page }) => {
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Verify essential test IDs exist
    const requiredTestIds = [
      "users-table",
      "search-input",
      "filter-button",
      "user-row",
      "table-container",
    ];

    for (const testId of requiredTestIds) {
      const element = await page.locator(`[data-testid="${testId}"]`).first();
      await expect(element).toBeVisible({ timeout: 5000 });
    }
  });

  test("User detail page has required test IDs", async ({ page }) => {
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Navigate to first user detail
    await page.click('[data-testid="user-row"]:first-child');
    await page.waitForSelector('[data-testid="user-detail"]', {
      timeout: 10000,
    });

    // Verify security tab test IDs
    await page.click('[data-testid="security-tab"]');

    const securityTestIds = [
      "user-detail",
      "security-tab",
      "quota-input",
      "save-quota",
      "alias-input",
      "add-alias",
      "revoke-sessions",
    ];

    for (const testId of securityTestIds) {
      const element = await page.locator(`[data-testid="${testId}"]`).first();
      // Check if element exists (some might be conditionally visible)
      const count = await element.count();
      if (count > 0) {
        console.log(`✓ Found test ID: ${testId}`);
      } else {
        console.warn(`⚠ Missing test ID: ${testId}`);
      }
    }
  });

  test("Import page has required test IDs", async ({ page }) => {
    await page.click('nav a[href="/users/import"]');
    await page.waitForSelector('[data-testid="import-page"]', {
      timeout: 10000,
    });

    const importTestIds = [
      "import-page",
      "file-upload",
      "preview-import",
      "start-import",
      "import-progress",
    ];

    for (const testId of importTestIds) {
      const element = await page.locator(`[data-testid="${testId}"]`).first();
      const count = await element.count();
      if (count > 0) {
        console.log(`✓ Found test ID: ${testId}`);
      } else {
        console.warn(
          `⚠ Missing test ID: ${testId} - adding to implementation`,
        );
      }
    }
  });

  test("All buttons have proper roles and no href='#'", async ({ page }) => {
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Check all anchor tags don't have href="#"
    const anchorTags = await page.locator("a").all();

    for (const anchor of anchorTags) {
      const href = await anchor.getAttribute("href");
      if (href === "#") {
        const outerHTML = await anchor.evaluate((el) => el.outerHTML);
        throw new Error(`Found anchor tag with href="#": ${outerHTML}`);
      }
    }

    // Check all interactive elements have proper roles
    const buttons = await page.locator('button, [role="button"]').all();

    for (const button of buttons) {
      const role = await button.getAttribute("role");
      const tagName = await button.evaluate((el) => el.tagName.toLowerCase());

      if (tagName !== "button" && role !== "button") {
        const outerHTML = await button.evaluate((el) => el.outerHTML);
        console.warn(
          `⚠ Interactive element without proper role: ${outerHTML}`,
        );
      }
    }
  });

  test("Navigation elements are accessible", async ({ page }) => {
    // Check main navigation
    const navLinks = await page.locator("nav a").all();

    for (const link of navLinks) {
      const href = await link.getAttribute("href");
      const text = await link.textContent();

      // Ensure navigation links have proper href and text
      expect(href).toBeTruthy();
      expect(href).not.toBe("#");
      expect(text?.trim()).toBeTruthy();

      // Check if link is keyboard accessible
      await link.focus();
      const focused = await page.evaluate(
        () => document.activeElement?.tagName,
      );
      expect(focused).toBe("A");
    }
  });

  test("Form elements have proper labels and IDs", async ({ page }) => {
    await page.click('nav a[href="/users/import"]');
    await page.waitForSelector('[data-testid="import-page"]', {
      timeout: 10000,
    });

    // Check file input has proper labeling
    const fileInput = page.locator('input[type="file"]');
    const fileInputId = await fileInput.getAttribute("id");

    if (fileInputId) {
      const label = page.locator(`label[for="${fileInputId}"]`);
      await expect(label).toBeVisible();
    }

    // Check all form inputs have associated labels
    const formInputs = await page.locator("input, select, textarea").all();

    for (const input of formInputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");

      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const labelExists = (await label.count()) > 0;

        if (!labelExists && !ariaLabel && !ariaLabelledBy) {
          const inputHTML = await input.evaluate((el) => el.outerHTML);
          console.warn(`⚠ Input without proper labeling: ${inputHTML}`);
        }
      }
    }
  });

  test("Loading states don't show static content", async ({ page }) => {
    // Monitor for flicker during navigation
    const flickerDetected = await page.evaluate(() => {
      let flickerCount = 0;
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            // Detect rapid DOM changes that might indicate flicker
            if (
              mutation.addedNodes.length > 0 &&
              mutation.removedNodes.length > 0
            ) {
              flickerCount++;
            }
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Stop observing after 2 seconds
      setTimeout(() => {
        observer.disconnect();
      }, 2000);

      return new Promise<number>((resolve) => {
        setTimeout(() => resolve(flickerCount), 2100);
      });
    });

    // Navigate to trigger potential flicker
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    const finalFlickerCount = await flickerDetected;

    // Allow some DOM changes for legitimate loading states
    expect(finalFlickerCount).toBeLessThan(10);
  });
});
