import { test, expect, Page } from "@playwright/test";

/**
 * Comprehensive Webmail Navigation Tests
 * Tests all routes, folders, categories, labels, quarantine, help, and settings
 */

test.describe("Webmail Navigation & Routes @navigation", () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Store console errors for assertions
    (page as any).consoleErrors = consoleErrors;

    // Navigate to webmail and login
    await page.goto("/");

    // Login with demo credentials
    await page.fill("#email", "demo@ceerion.com");
    await page.fill("#password", "demo");
    await page.click('button[type="submit"]');

    // Wait for successful login
    await expect(page.locator(".flex.h-screen")).toBeVisible({
      timeout: 10000,
    });
  });

  test.afterEach(async () => {
    // Assert no console errors occurred (warnings are okay in development)
    const consoleErrors = (page as any).consoleErrors || [];
    const actualErrors = consoleErrors.filter(
      (error: string) =>
        !error.includes("[WARNING]") &&
        !error.includes("hydration error") &&
        !error.includes("React DevTools") &&
        !error.includes("Future Flag Warning") &&
        !error.includes("cannot contain a nested") &&
        !error.includes("button <button>"),
    );
    expect(
      actualErrors,
      `Console errors found: ${actualErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Navigate to all system folders", async () => {
    const systemFolders = [
      { name: "Inbox", path: "/mail/inbox", testId: "folder-inbox" },
      { name: "Drafts", path: "/mail/drafts", testId: "folder-drafts" },
      { name: "Sent", path: "/mail/sent", testId: "folder-sent" },
      {
        name: "Scheduled",
        path: "/mail/scheduled",
        testId: "folder-scheduled",
      },
      { name: "Outbox", path: "/mail/outbox", testId: "folder-outbox" },
      { name: "Archive", path: "/mail/archive", testId: "folder-archive" },
      { name: "Spam", path: "/mail/spam", testId: "folder-spam" },
      { name: "Trash", path: "/mail/trash", testId: "folder-trash" },
    ];

    for (const folder of systemFolders) {
      // Navigate to folder
      await page.click(`[data-testid="${folder.testId}"]`);

      // Wait for navigation
      await expect(page).toHaveURL(new RegExp(folder.path));

      // Assert folder content loads
      await expect(page.locator('[data-testid="mail-list"]')).toBeVisible();

      // Assert folder header shows correct name
      await expect(page.locator('[data-testid="folder-header"]')).toContainText(
        folder.name,
      );

      // Assert unread count badge if present
      const unreadBadge = page.locator(
        `[data-testid="${folder.testId}"] [data-testid="unread-count"]`,
      );
      if (await unreadBadge.isVisible()) {
        await expect(unreadBadge).toHaveText(/\\d+/);
      }
    }
  });

  test("Navigate to custom categories and labels", async () => {
    // Test custom categories
    const categories = [
      { name: "Work", testId: "category-work" },
      { name: "Personal", testId: "category-personal" },
      { name: "Finance", testId: "category-finance" },
    ];

    for (const category of categories) {
      const categoryElement = page.locator(
        `[data-testid="${category.testId}"]`,
      );
      if (await categoryElement.isVisible()) {
        await categoryElement.click();

        // Assert category view loads
        await expect(page.locator('[data-testid="mail-list"]')).toBeVisible();
        await expect(
          page.locator('[data-testid="category-header"]'),
        ).toContainText(category.name);
      }
    }

    // Test labels
    const labels = [
      { name: "Important", testId: "label-important", color: "red" },
      { name: "Action Required", testId: "label-action", color: "orange" },
      { name: "Follow Up", testId: "label-followup", color: "blue" },
    ];

    for (const label of labels) {
      const labelElement = page.locator(`[data-testid="${label.testId}"]`);
      if (await labelElement.isVisible()) {
        await labelElement.click();

        // Assert label view loads
        await expect(page.locator('[data-testid="mail-list"]')).toBeVisible();
        await expect(
          page.locator('[data-testid="label-header"]'),
        ).toContainText(label.name);
      }
    }
  });

  test("Navigate to quarantine and security features", async () => {
    // Navigate to quarantine
    await page.click('[data-testid="folder-quarantine"]');
    await expect(page).toHaveURL(/\/mail\/quarantine/);

    // Assert quarantine view loads
    await expect(page.locator('[data-testid="quarantine-list"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="quarantine-header"]'),
    ).toContainText("Quarantine");

    // Test quarantine actions
    const quarantineActions = [
      '[data-testid="release-all-btn"]',
      '[data-testid="delete-all-btn"]',
      '[data-testid="whitelist-sender-btn"]',
    ];

    for (const action of quarantineActions) {
      const actionElement = page.locator(action);
      if (await actionElement.isVisible()) {
        await expect(actionElement).toBeEnabled();
      }
    }
  });

  test("Navigate to help system and test all features", async () => {
    // Navigate to help
    await page.click('[data-testid="help-link"]');
    await expect(page).toHaveURL(/\/help/);

    // Assert help center loads
    await expect(page.locator('[data-testid="help-center"]')).toBeVisible();
    await expect(page.locator("h1")).toContainText("Help Center");

    // Test search functionality
    const searchInput = page.locator('[data-testid="help-search"]');
    await searchInput.fill("email rules");
    await page.waitForTimeout(500); // Wait for search debounce

    // Assert search results appear
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="search-results"] [data-testid="article-card"]',
      ),
    ).toHaveCount(1, { timeout: 5000 });

    // Clear search
    await searchInput.fill("");

    // Test category browsing
    const categories = [
      { name: "Getting Started", testId: "category-getting-started" },
      { name: "Security", testId: "category-security" },
      { name: "Deliverability", testId: "category-deliverability" },
      { name: "Calendar", testId: "category-calendar" },
      { name: "Chat", testId: "category-chat" },
    ];

    for (const category of categories) {
      await page.click(`[data-testid="${category.testId}"]`);

      // Assert category filter works
      await expect(
        page.locator('[data-testid="category-articles"]'),
      ).toBeVisible();
      await expect(page.locator("h2")).toContainText(
        `${category.name} Articles`,
      );

      // Reset filter
      await page.click('[data-testid="view-all-btn"]');
    }

    // Test article viewing
    await page.click('[data-testid="article-card"]:first-child');
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="article-title"]')).toBeVisible();

    // Test article feedback
    await page.click('[data-testid="helpful-yes-btn"]');
    await expect(page.locator('[data-testid="feedback-toast"]')).toBeVisible();

    // Test contact support
    await page.click('[data-testid="contact-support-btn"]');
    await expect(page.locator('[data-testid="support-toast"]')).toBeVisible();

    // Test release notes
    await page.click('[data-testid="back-btn"]'); // Go back to help home
    await page.click('[data-testid="release-notes-btn"]');
    await expect(
      page.locator('[data-testid="release-notes-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="changelog-content"]'),
    ).toBeVisible();
  });

  test("Navigate to all settings tabs and test persistence", async () => {
    // Navigate to settings
    await page.click('[data-testid="settings-link"]');
    await expect(page).toHaveURL(/\/settings/);

    // Assert settings page loads
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

    const settingsTabs = [
      {
        name: "Profile",
        testId: "tab-profile",
        fields: [
          {
            field: '[data-testid="display-name"]',
            value: "Updated Name",
            type: "input",
          },
          {
            field: '[data-testid="job-title"]',
            value: "Senior Developer",
            type: "input",
          },
        ],
      },
      {
        name: "Account",
        testId: "tab-account",
        fields: [
          {
            field: '[data-testid="timezone"]',
            value: "America/New_York",
            type: "select",
          },
          { field: '[data-testid="language"]', value: "en-US", type: "select" },
        ],
      },
      {
        name: "Appearance",
        testId: "tab-appearance",
        fields: [
          { field: '[data-testid="theme"]', value: "dark", type: "select" },
          {
            field: '[data-testid="font-size"]',
            value: "large",
            type: "select",
          },
        ],
      },
      {
        name: "Email",
        testId: "tab-email",
        fields: [
          {
            field: '[data-testid="signature"]',
            value: "Best regards,\\nTest User",
            type: "textarea",
          },
          {
            field: '[data-testid="auto-reply"]',
            value: "true",
            type: "checkbox",
          },
        ],
      },
      {
        name: "Notifications",
        testId: "tab-notifications",
        fields: [
          {
            field: '[data-testid="email-notifications"]',
            value: "true",
            type: "checkbox",
          },
          {
            field: '[data-testid="push-notifications"]',
            value: "false",
            type: "checkbox",
          },
        ],
      },
      {
        name: "Privacy",
        testId: "tab-privacy",
        fields: [
          {
            field: '[data-testid="read-receipts"]',
            value: "false",
            type: "checkbox",
          },
          {
            field: '[data-testid="tracking-protection"]',
            value: "true",
            type: "checkbox",
          },
        ],
      },
      {
        name: "Security",
        testId: "tab-security",
        fields: [
          {
            field: '[data-testid="two-factor-auth"]',
            value: "true",
            type: "checkbox",
          },
          {
            field: '[data-testid="session-timeout"]',
            value: "30",
            type: "select",
          },
        ],
      },
      {
        name: "Filters & Rules",
        testId: "tab-rules",
        fields: [], // Rules have special handling below
      },
      {
        name: "Advanced",
        testId: "tab-advanced",
        fields: [
          {
            field: '[data-testid="imap-enabled"]',
            value: "true",
            type: "checkbox",
          },
          {
            field: '[data-testid="debug-mode"]',
            value: "false",
            type: "checkbox",
          },
        ],
      },
    ];

    for (const tab of settingsTabs) {
      // Navigate to tab
      await page.click(`[data-testid="${tab.testId}"]`);
      await expect(page.locator('[data-testid="tab-content"]')).toBeVisible();

      // Test special case for rules tab
      if (tab.name === "Filters & Rules") {
        // Test rule creation
        await page.click('[data-testid="create-rule-btn"]');
        await expect(page.locator('[data-testid="rule-editor"]')).toBeVisible();

        // Fill rule details
        await page.fill('[data-testid="rule-name"]', "Test Rule");
        await page.selectOption('[data-testid="condition-field"]', "from");
        await page.fill('[data-testid="condition-value"]', "test@example.com");
        await page.selectOption('[data-testid="action-type"]', "move");
        await page.selectOption('[data-testid="action-folder"]', "archive");

        // Save rule
        await page.click('[data-testid="save-rule-btn"]');
        await expect(
          page.locator('[data-testid="rule-list"] [data-testid="rule-item"]'),
        ).toHaveCount(1, { timeout: 5000 });

        // Test rule toggle
        await page.click('[data-testid="rule-toggle"]');
        await expect(
          page.locator('[data-testid="rule-disabled"]'),
        ).toBeVisible();

        continue;
      }

      // Update fields and test persistence
      for (const fieldConfig of tab.fields) {
        const field = page.locator(fieldConfig.field);
        if (await field.isVisible()) {
          switch (fieldConfig.type) {
            case "input":
              await field.fill(fieldConfig.value);
              break;
            case "textarea":
              await field.fill(fieldConfig.value);
              break;
            case "select":
              await field.selectOption(fieldConfig.value);
              break;
            case "checkbox":
              if (fieldConfig.value === "true") {
                await field.check();
              } else {
                await field.uncheck();
              }
              break;
          }
        }
      }

      // Save settings
      const saveButton = page.locator('[data-testid="save-settings-btn"]');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await expect(
          page.locator('[data-testid="save-success-toast"]'),
        ).toBeVisible();
      }
    }

    // Navigate away and back to verify persistence
    await page.click('[data-testid="folder-inbox"]');
    await page.waitForTimeout(1000);
    await page.click('[data-testid="settings-link"]');

    // Verify settings persisted
    for (const tab of settingsTabs) {
      if (tab.fields.length === 0) continue;

      await page.click(`[data-testid="${tab.testId}"]`);

      for (const fieldConfig of tab.fields) {
        const field = page.locator(fieldConfig.field);
        if (await field.isVisible()) {
          switch (fieldConfig.type) {
            case "input":
            case "textarea":
              await expect(field).toHaveValue(fieldConfig.value);
              break;
            case "select":
              await expect(field).toHaveValue(fieldConfig.value);
              break;
            case "checkbox":
              if (fieldConfig.value === "true") {
                await expect(field).toBeChecked();
              } else {
                await expect(field).not.toBeChecked();
              }
              break;
          }
        }
      }
    }
  });
});
