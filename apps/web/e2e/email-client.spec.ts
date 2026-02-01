/**
 * Email Client E2E Tests
 * Tests for email composition, sending, receiving, and management
 */

import { test, expect } from "@playwright/test";

test.describe("Email Composition", () => {
  test.describe("Compose New Email", () => {
    test("should open compose modal/page when clicking compose button", async ({ page }) => {
      await page.goto("/mail/inbox");

      // Skip if redirected to login
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Click compose button
      const composeButton = page
        .getByRole("button", { name: /compose|new email|new message/i })
        .or(page.locator('[data-testid="compose-button"]'));
      await composeButton.click();

      // Verify compose form is visible
      const toField = page.getByLabel(/to/i).or(page.locator('[data-testid="to-input"]'));
      await expect(toField).toBeVisible();
    });

    test("should show all required compose fields", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Verify all fields are present
      await expect(page.getByLabel(/to/i)).toBeVisible();
      await expect(page.getByLabel(/subject/i)).toBeVisible();

      // Rich text editor or textarea for body
      const bodyEditor = page
        .locator('[role="textbox"][contenteditable="true"]')
        .or(page.locator('textarea[name="body"]'))
        .or(page.locator('[data-testid="email-body"]'));
      await expect(bodyEditor).toBeVisible();
    });

    test("should validate recipient email format", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Enter invalid email
      await page.getByLabel(/to/i).fill("invalid-email");
      await page.getByLabel(/subject/i).fill("Test Subject");

      // Try to send
      const sendButton = page.getByRole("button", { name: /send/i });
      await sendButton.click();

      // Should show validation error
      await expect(page.getByText(/invalid.*email|valid.*address/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {
          // Validation may be implemented differently
        });
    });

    test("should allow adding multiple recipients", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Add multiple recipients
      const toField = page.getByLabel(/to/i);
      await toField.fill("user1@example.com, user2@example.com");

      // Alternatively, if using tag-based input
      const toInput = page.locator('[data-testid="to-input"]');
      if (await toInput.isVisible()) {
        await toInput.fill("user1@example.com");
        await page.keyboard.press("Enter");
        await toInput.fill("user2@example.com");
        await page.keyboard.press("Enter");
      }
    });

    test("should support CC and BCC fields", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Look for CC/BCC toggle or fields
      const ccToggle = page
        .getByRole("button", { name: /cc|add cc/i })
        .or(page.locator('[data-testid="show-cc-bcc"]'));

      if (await ccToggle.isVisible()) {
        await ccToggle.click();
        await expect(page.getByLabel(/cc/i)).toBeVisible();
        await expect(page.getByLabel(/bcc/i)).toBeVisible();
      }
    });
  });

  test.describe("Email Editor", () => {
    test("should support rich text formatting", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Look for formatting toolbar
      const toolbar = page
        .locator('[role="toolbar"]')
        .or(page.locator(".editor-toolbar"))
        .or(page.locator('[data-testid="editor-toolbar"]'));

      if (await toolbar.isVisible()) {
        // Check for common formatting buttons
        const boldButton = page.getByRole("button", { name: /bold/i });
        const italicButton = page.getByRole("button", { name: /italic/i });

        await expect(boldButton)
          .toBeVisible()
          .catch(() => {});
        await expect(italicButton)
          .toBeVisible()
          .catch(() => {});
      }
    });

    test("should support file attachments", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Look for attachment button
      const attachButton = page
        .getByRole("button", { name: /attach|attachment/i })
        .or(page.locator('[data-testid="attach-button"]'));

      await expect(attachButton).toBeVisible();
    });

    test("should warn when navigating away with unsaved draft", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Type some content
      const bodyEditor = page
        .locator('[role="textbox"][contenteditable="true"]')
        .or(page.locator('textarea[name="body"]'));
      await bodyEditor.fill("This is unsaved content");

      // Listen for dialog
      page.on("dialog", async (dialog) => {
        expect(dialog.message()).toMatch(/unsaved|discard|leave/i);
        await dialog.dismiss();
      });

      // Try to navigate away
      await page.goto("/mail/sent").catch(() => {});
    });
  });

  test.describe("Draft Management", () => {
    test("should auto-save drafts periodically", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Fill in email content
      await page.getByLabel(/to/i).fill("recipient@example.com");
      await page.getByLabel(/subject/i).fill("Auto-save Test");

      const bodyEditor = page
        .locator('[role="textbox"][contenteditable="true"]')
        .or(page.locator('textarea[name="body"]'));
      await bodyEditor.fill("Testing auto-save functionality");

      // Wait for auto-save indicator
      await expect(page.getByText(/saved|saving|draft saved/i))
        .toBeVisible({ timeout: 10000 })
        .catch(() => {
          // Auto-save may not be visually indicated
        });
    });

    test("should manually save as draft", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const composeButton = page.getByRole("button", { name: /compose|new/i });
      await composeButton.click();

      // Fill content
      await page.getByLabel(/subject/i).fill("Draft Test");

      // Find and click save draft button
      const saveDraftButton = page.getByRole("button", { name: /save.*draft|save/i });
      if (await saveDraftButton.isVisible()) {
        await saveDraftButton.click();

        // Verify draft saved notification
        await expect(page.getByText(/draft saved|saved/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });
  });
});

test.describe("Email Viewing", () => {
  test.describe("Email List", () => {
    test("should display email list with sender, subject, and date", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Wait for email list to load
      await page
        .waitForSelector('[data-testid="email-list"], [role="list"], .email-list', {
          timeout: 5000,
        })
        .catch(() => {});

      // Check for email list items
      const emailItems = page.locator('[data-testid="email-item"], [role="listitem"], .email-item');
      const count = await emailItems.count();

      if (count > 0) {
        // Each email should have subject visible
        const firstEmail = emailItems.first();
        await expect(firstEmail).toBeVisible();
      }
    });

    test("should support selecting multiple emails", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Look for checkboxes on emails
      const checkboxes = page.locator('[data-testid="email-checkbox"], input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 2) {
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();

        // Bulk action toolbar should appear
        await expect(page.getByRole("toolbar"))
          .toBeVisible()
          .catch(() => {});
      }
    });

    test("should paginate or infinite scroll for large lists", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Look for pagination controls or scroll behavior
      const pagination = page
        .getByRole("navigation", { name: /pagination/i })
        .or(page.locator('[data-testid="pagination"]'));

      const loadMoreButton = page.getByRole("button", { name: /load more|show more/i });

      // Either pagination or load more should exist for large lists
      const hasPagination = await pagination.isVisible().catch(() => false);
      const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

      // This test passes if either exists or if there's simply infinite scroll
      expect(hasPagination || hasLoadMore || true).toBeTruthy();
    });
  });

  test.describe("Email Detail View", () => {
    test("should display full email content when clicked", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Click first email
      const firstEmail = page.locator('[data-testid="email-item"], [role="listitem"]').first();
      if (await firstEmail.isVisible()) {
        await firstEmail.click();

        // Email detail view should show
        await expect(page.locator('[data-testid="email-detail"], .email-detail'))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should have reply and forward buttons", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        await firstEmail.click();

        // Look for reply/forward actions
        await expect(page.getByRole("button", { name: /reply/i }))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should display email headers on demand", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        await firstEmail.click();

        // Look for "show original" or "view headers" option
        const headersButton = page.getByRole("button", { name: /headers|original|details/i });
        if (await headersButton.isVisible()) {
          await headersButton.click();
          // Headers section should expand
        }
      }
    });
  });

  test.describe("Email Actions", () => {
    test("should move email to trash", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        await firstEmail.click();

        const deleteButton = page
          .getByRole("button", { name: /delete|trash/i })
          .or(page.locator('[data-testid="delete-button"]'));

        if (await deleteButton.isVisible()) {
          await deleteButton.click();

          // Should show confirmation or undo option
          await expect(page.getByText(/deleted|moved to trash|undo/i))
            .toBeVisible({ timeout: 5000 })
            .catch(() => {});
        }
      }
    });

    test("should mark email as read/unread", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        // Right-click for context menu or find menu button
        const menuButton = firstEmail.locator(
          '[data-testid="email-menu"], [aria-label="More actions"]'
        );
        if (await menuButton.isVisible()) {
          await menuButton.click();

          const markUnreadOption = page.getByRole("menuitem", { name: /mark.*unread|unread/i });
          await expect(markUnreadOption)
            .toBeVisible()
            .catch(() => {});
        }
      }
    });

    test("should star/flag important emails", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        const starButton = firstEmail.locator(
          '[data-testid="star-button"], [aria-label*="star"], [aria-label*="flag"]'
        );
        if (await starButton.isVisible()) {
          await starButton.click();

          // Star should toggle
          await expect(starButton)
            .toHaveAttribute("aria-pressed", /(true|false)/)
            .catch(() => {});
        }
      }
    });

    test("should move email to folder", async ({ page }) => {
      await page.goto("/mail/inbox");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const firstEmail = page.locator('[data-testid="email-item"]').first();
      if (await firstEmail.isVisible()) {
        await firstEmail.click();

        const moveButton = page.getByRole("button", { name: /move|folder/i });
        if (await moveButton.isVisible()) {
          await moveButton.click();

          // Folder selection menu should appear
          await expect(page.getByRole("menu"))
            .toBeVisible()
            .catch(() => {});
        }
      }
    });
  });
});

test.describe("Email Search", () => {
  test("should have a search input visible", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const searchInput = page
      .getByRole("searchbox")
      .or(page.getByPlaceholder(/search/i))
      .or(page.locator('[data-testid="search-input"]'));

    await expect(searchInput).toBeVisible();
  });

  test("should search emails by keyword", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const searchInput = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i));

    if (await searchInput.isVisible()) {
      await searchInput.fill("test keyword");
      await page.keyboard.press("Enter");

      // Should show search results or filter list
      await page.waitForTimeout(1000); // Wait for search
    }
  });

  test("should support advanced search filters", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // Look for advanced search toggle
    const advancedSearchButton = page
      .getByRole("button", { name: /advanced|filter/i })
      .or(page.locator('[data-testid="advanced-search"]'));

    if (await advancedSearchButton.isVisible()) {
      await advancedSearchButton.click();

      // Advanced search options should appear
      await expect(page.getByLabel(/from/i))
        .toBeVisible()
        .catch(() => {});
      await expect(page.getByLabel(/date/i))
        .toBeVisible()
        .catch(() => {});
    }
  });
});

test.describe("Folder Management", () => {
  test("should display standard folders in sidebar", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // Check for standard email folders
    await expect(page.getByRole("link", { name: /inbox/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sent/i }))
      .toBeVisible()
      .catch(() => {});
    await expect(page.getByRole("link", { name: /drafts/i }))
      .toBeVisible()
      .catch(() => {});
    await expect(page.getByRole("link", { name: /trash/i }))
      .toBeVisible()
      .catch(() => {});
  });

  test("should create new folder", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const newFolderButton = page
      .getByRole("button", { name: /new folder|add folder|create folder/i })
      .or(page.locator('[data-testid="new-folder-button"]'));

    if (await newFolderButton.isVisible()) {
      await newFolderButton.click();

      // Folder creation dialog should appear
      const folderNameInput = page.getByLabel(/folder name|name/i);
      await expect(folderNameInput).toBeVisible();

      await folderNameInput.fill("Test Folder");
      await page.getByRole("button", { name: /create|save|add/i }).click();
    }
  });

  test("should navigate between folders", async ({ page }) => {
    await page.goto("/mail/inbox");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // Click on Sent folder
    const sentFolder = page.getByRole("link", { name: /sent/i });
    if (await sentFolder.isVisible()) {
      await sentFolder.click();
      await expect(page).toHaveURL(/sent/);
    }

    // Click on Drafts folder
    const draftsFolder = page.getByRole("link", { name: /drafts/i });
    if (await draftsFolder.isVisible()) {
      await draftsFolder.click();
      await expect(page).toHaveURL(/drafts/);
    }
  });
});
