import { test, expect, Page } from "@playwright/test";

/**
 * Webmail Email Actions & Workflows Tests
 * Tests draft management, sending, scheduling, and message interactions
 */

test.describe("Webmail Email Workflows @workflows", () => {
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

    (page as any).consoleErrors = consoleErrors;

    // Navigate to webmail and login
    await page.goto("/");
    await page.fill("#email", "demo@ceerion.com");
    await page.fill("#password", "demo");
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="mail-shell"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test.afterEach(async () => {
    const consoleErrors = (page as any).consoleErrors || [];
    expect(
      consoleErrors,
      `Console errors found: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Drafts workflow: open → edit → autosave → schedule → cancel to drafts", async () => {
    // Navigate to drafts
    await page.click('[data-testid="folder-drafts"]');
    await expect(page).toHaveURL(/\/mail\/drafts/);

    // Create a new draft if none exist
    const draftExists = await page
      .locator('[data-testid="email-item"]')
      .first()
      .isVisible({ timeout: 3000 });
    if (!draftExists) {
      await page.click('[data-testid="compose-btn"]');
      await page.fill('[data-testid="compose-to"]', "test@example.com");
      await page.fill('[data-testid="compose-subject"]', "Test Draft Subject");
      await page.fill(
        '[data-testid="compose-body"]',
        "This is a test draft message.",
      );

      // Save as draft
      await page.click('[data-testid="save-draft-btn"]');
      await expect(
        page.locator('[data-testid="draft-saved-toast"]'),
      ).toBeVisible();

      // Close composer
      await page.click('[data-testid="close-composer-btn"]');
      await page.click('[data-testid="folder-drafts"]');
    }

    // Open existing draft
    await page.click('[data-testid="email-item"]');
    await expect(page.locator('[data-testid="draft-editor"]')).toBeVisible();

    // Edit draft content
    const originalSubject = await page
      .locator('[data-testid="compose-subject"]')
      .inputValue();
    const newSubject = `${originalSubject} - Edited`;
    await page.fill('[data-testid="compose-subject"]', newSubject);

    // Test autosave
    await page.fill(
      '[data-testid="compose-body"]',
      "Updated draft content with autosave test.",
    );
    await page.waitForTimeout(2000); // Wait for autosave
    await expect(
      page.locator('[data-testid="autosave-indicator"]'),
    ).toContainText("Saved");

    // Convert to scheduled message
    await page.click('[data-testid="schedule-btn"]');
    await expect(page.locator('[data-testid="schedule-dialog"]')).toBeVisible();

    // Set schedule time (1 hour from now)
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    const dateString = futureDate.toISOString().split("T")[0];
    const timeString = futureDate.toTimeString().split(" ")[0].slice(0, 5);

    await page.fill('[data-testid="schedule-date"]', dateString);
    await page.fill('[data-testid="schedule-time"]', timeString);
    await page.click('[data-testid="confirm-schedule-btn"]');

    // Verify moved to scheduled
    await expect(page.locator('[data-testid="scheduled-toast"]')).toBeVisible();
    await expect(page).toHaveURL(/\/mail\/scheduled/);

    // Cancel back to drafts
    await page.click('[data-testid="email-item"]'); // Open scheduled message
    await page.click('[data-testid="cancel-schedule-btn"]');
    await expect(page.locator('[data-testid="cancel-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-cancel-btn"]');

    // Verify back in drafts
    await expect(page.locator('[data-testid="cancelled-toast"]')).toBeVisible();
    await expect(page).toHaveURL(/\/mail\/drafts/);

    // Verify draft content preserved
    await page.click('[data-testid="email-item"]');
    await expect(page.locator('[data-testid="compose-subject"]')).toHaveValue(
      newSubject,
    );
  });

  test("Sent workflow: open message → Resend → draft prefilled", async () => {
    // Navigate to sent folder
    await page.click('[data-testid="folder-sent"]');
    await expect(page).toHaveURL(/\/mail\/sent/);

    // Create a sent message if none exist (send a quick email)
    const sentExists = await page
      .locator('[data-testid="email-item"]')
      .first()
      .isVisible({ timeout: 3000 });
    if (!sentExists) {
      await page.click('[data-testid="compose-btn"]');
      await page.fill('[data-testid="compose-to"]', "test@example.com");
      await page.fill('[data-testid="compose-subject"]', "Test Sent Message");
      await page.fill(
        '[data-testid="compose-body"]',
        "This is a test message for resend.",
      );
      await page.click('[data-testid="send-btn"]');
      await expect(page.locator('[data-testid="sent-toast"]')).toBeVisible();
      await page.click('[data-testid="folder-sent"]');
    }

    // Open sent message
    await page.click('[data-testid="email-item"]');
    await expect(page.locator('[data-testid="message-view"]')).toBeVisible();

    // Get original message details
    const originalSubject = await page
      .locator('[data-testid="message-subject"]')
      .textContent();
    const originalBody = await page
      .locator('[data-testid="message-body"]')
      .textContent();
    const originalTo = await page
      .locator('[data-testid="message-to"]')
      .textContent();

    // Click resend
    await page.click('[data-testid="resend-btn"]');
    await expect(page.locator('[data-testid="compose-view"]')).toBeVisible();

    // Verify draft is prefilled with original content
    await expect(page.locator('[data-testid="compose-to"]')).toHaveValue(
      originalTo || "",
    );
    await expect(page.locator('[data-testid="compose-subject"]')).toHaveValue(
      `Re: ${originalSubject}`,
    );
    await expect(page.locator('[data-testid="compose-body"]')).toContainText(
      originalBody || "",
    );

    // Verify resend indicator
    await expect(
      page.locator('[data-testid="resend-indicator"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="resend-indicator"]'),
    ).toContainText("Resending message");

    // Test saving resend as draft
    await page.click('[data-testid="save-draft-btn"]');
    await expect(
      page.locator('[data-testid="draft-saved-toast"]'),
    ).toBeVisible();

    // Verify appears in drafts
    await page.click('[data-testid="folder-drafts"]');
    const draftSubject = await page
      .locator('[data-testid="email-item"] [data-testid="subject"]')
      .first()
      .textContent();
    expect(draftSubject).toContain("Re:");
  });

  test("Scheduled/Outbox workflow: edit schedule, send now, retry, cancel", async () => {
    // Create a scheduled message first
    await page.click('[data-testid="compose-btn"]');
    await page.fill('[data-testid="compose-to"]', "scheduled@example.com");
    await page.fill(
      '[data-testid="compose-subject"]',
      "Scheduled Test Message",
    );
    await page.fill(
      '[data-testid="compose-body"]',
      "This is a scheduled message for testing.",
    );

    // Schedule for future
    await page.click('[data-testid="schedule-btn"]');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const dateString = futureDate.toISOString().split("T")[0];

    await page.fill('[data-testid="schedule-date"]', dateString);
    await page.fill('[data-testid="schedule-time"]', "10:00");
    await page.click('[data-testid="confirm-schedule-btn"]');

    await expect(page).toHaveURL(/\/mail\/scheduled/);

    // Test editing schedule
    await page.click('[data-testid="email-item"]');
    await page.click('[data-testid="edit-schedule-btn"]');
    await expect(page.locator('[data-testid="schedule-dialog"]')).toBeVisible();

    // Change schedule time
    await page.fill('[data-testid="schedule-time"]', "14:00");
    await page.click('[data-testid="update-schedule-btn"]');
    await expect(
      page.locator('[data-testid="schedule-updated-toast"]'),
    ).toBeVisible();

    // Verify schedule time updated
    await expect(
      page.locator('[data-testid="schedule-time-display"]'),
    ).toContainText("14:00");

    // Test send now
    await page.click('[data-testid="send-now-btn"]');
    await expect(page.locator('[data-testid="send-now-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-send-now-btn"]');
    await expect(page.locator('[data-testid="sent-now-toast"]')).toBeVisible();

    // Verify moved to sent folder
    await page.click('[data-testid="folder-sent"]');
    const sentSubject = await page
      .locator('[data-testid="email-item"] [data-testid="subject"]')
      .first()
      .textContent();
    expect(sentSubject).toContain("Scheduled Test Message");

    // Test outbox functionality (simulate failed send)
    await page.click('[data-testid="compose-btn"]');
    await page.fill('[data-testid="compose-to"]', "outbox@example.com");
    await page.fill('[data-testid="compose-subject"]', "Outbox Test Message");
    await page.fill('[data-testid="compose-body"]', "This will go to outbox.");

    // Mock network failure for send
    await page.route("**/api/mail/send", (route) => {
      route.abort("failed");
    });

    await page.click('[data-testid="send-btn"]');
    await expect(
      page.locator('[data-testid="send-failed-toast"]'),
    ).toBeVisible();

    // Verify moved to outbox
    await page.click('[data-testid="folder-outbox"]');
    await expect(page.locator('[data-testid="email-item"]')).toBeVisible();

    // Test retry sending
    await page.click('[data-testid="email-item"]');

    // Remove network mock
    await page.unroute("**/api/mail/send");

    await page.click('[data-testid="retry-send-btn"]');
    await expect(page.locator('[data-testid="retry-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-retry-btn"]');
    await expect(
      page.locator('[data-testid="retry-sent-toast"]'),
    ).toBeVisible();

    // Test cancel from outbox (move to drafts)
    await page.click('[data-testid="compose-btn"]');
    await page.fill('[data-testid="compose-to"]', "cancel@example.com");
    await page.fill('[data-testid="compose-subject"]', "Cancel Test Message");
    await page.fill('[data-testid="compose-body"]', "This will be cancelled.");

    // Mock failure again
    await page.route("**/api/mail/send", (route) => {
      route.abort("failed");
    });

    await page.click('[data-testid="send-btn"]');
    await page.click('[data-testid="folder-outbox"]');

    // Cancel sending
    await page.click('[data-testid="email-item"]');
    await page.click('[data-testid="cancel-send-btn"]');
    await expect(
      page.locator('[data-testid="cancel-send-dialog"]'),
    ).toBeVisible();
    await page.click('[data-testid="confirm-cancel-send-btn"]');
    await expect(
      page.locator('[data-testid="cancelled-send-toast"]'),
    ).toBeVisible();

    // Verify moved to drafts
    await page.click('[data-testid="folder-drafts"]');
    const draftSubject = await page
      .locator('[data-testid="email-item"] [data-testid="subject"]')
      .first()
      .textContent();
    expect(draftSubject).toContain("Cancel Test Message");
  });

  test("Unread counts change appropriately after archive/delete/mark read", async () => {
    // Navigate to inbox and get initial unread count
    await page.click('[data-testid="folder-inbox"]');

    const getUnreadCount = async (folder: string): Promise<number> => {
      const badge = page.locator(
        `[data-testid="folder-${folder}"] [data-testid="unread-count"]`,
      );
      if (await badge.isVisible()) {
        const text = await badge.textContent();
        return parseInt(text || "0");
      }
      return 0;
    };

    const initialInboxCount = await getUnreadCount("inbox");
    const initialArchiveCount = await getUnreadCount("archive");
    const initialTrashCount = await getUnreadCount("trash");

    // Create unread test emails if none exist
    if (initialInboxCount === 0) {
      // Simulate receiving new emails
      await page.evaluate(() => {
        // Mock receiving emails via WebSocket or API
        window.dispatchEvent(
          new CustomEvent("new-email", {
            detail: {
              count: 3,
              messages: [
                {
                  id: "test1",
                  subject: "Test Unread 1",
                  from: "sender1@test.com",
                  unread: true,
                },
                {
                  id: "test2",
                  subject: "Test Unread 2",
                  from: "sender2@test.com",
                  unread: true,
                },
                {
                  id: "test3",
                  subject: "Test Unread 3",
                  from: "sender3@test.com",
                  unread: true,
                },
              ],
            },
          }),
        );
      });

      // Wait for emails to appear
      await expect(page.locator('[data-testid="email-item"]')).toHaveCount(3, {
        timeout: 5000,
      });
    }

    const updatedInboxCount = await getUnreadCount("inbox");
    expect(updatedInboxCount).toBeGreaterThan(0);

    // Test marking as read
    await page.click(
      '[data-testid="email-item"]:first-child [data-testid="unread-indicator"]',
    );
    await page.click('[data-testid="mark-read-btn"]');
    await expect(
      page.locator('[data-testid="marked-read-toast"]'),
    ).toBeVisible();

    // Verify unread count decreased
    await page.waitForTimeout(500);
    const afterReadCount = await getUnreadCount("inbox");
    expect(afterReadCount).toBe(updatedInboxCount - 1);

    // Test archiving unread email
    await page.click(
      '[data-testid="email-item"]:first-child [data-testid="unread-indicator"]',
    );
    await page.click('[data-testid="archive-btn"]');
    await expect(page.locator('[data-testid="archived-toast"]')).toBeVisible();

    // Verify counts updated
    await page.waitForTimeout(500);
    const afterArchiveInboxCount = await getUnreadCount("inbox");
    const afterArchiveArchiveCount = await getUnreadCount("archive");

    expect(afterArchiveInboxCount).toBe(afterReadCount - 1);
    expect(afterArchiveArchiveCount).toBe(initialArchiveCount + 1);

    // Test deleting unread email
    await page.click(
      '[data-testid="email-item"]:first-child [data-testid="unread-indicator"]',
    );
    await page.click('[data-testid="delete-btn"]');
    await expect(page.locator('[data-testid="delete-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-delete-btn"]');
    await expect(page.locator('[data-testid="deleted-toast"]')).toBeVisible();

    // Verify counts updated
    await page.waitForTimeout(500);
    const afterDeleteInboxCount = await getUnreadCount("inbox");
    const afterDeleteTrashCount = await getUnreadCount("trash");

    expect(afterDeleteInboxCount).toBe(afterArchiveInboxCount - 1);
    expect(afterDeleteTrashCount).toBe(initialTrashCount + 1);

    // Test bulk operations
    if (afterDeleteInboxCount > 1) {
      // Select multiple emails
      await page.click('[data-testid="select-all-checkbox"]');
      await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible();

      // Bulk mark as read
      await page.click('[data-testid="bulk-mark-read-btn"]');
      await expect(
        page.locator('[data-testid="bulk-marked-read-toast"]'),
      ).toBeVisible();

      // Verify all unread counts cleared
      await page.waitForTimeout(500);
      const finalInboxCount = await getUnreadCount("inbox");
      expect(finalInboxCount).toBe(0);
    }

    // Test restoring from trash (should restore unread status)
    await page.click('[data-testid="folder-trash"]');
    if (
      await page
        .locator('[data-testid="email-item"] [data-testid="unread-indicator"]')
        .first()
        .isVisible()
    ) {
      await page.click(
        '[data-testid="email-item"] [data-testid="unread-indicator"]',
      );
      await page.click('[data-testid="restore-btn"]');
      await expect(
        page.locator('[data-testid="restored-toast"]'),
      ).toBeVisible();

      // Verify unread status preserved
      await page.click('[data-testid="folder-inbox"]');
      const restoredInboxCount = await getUnreadCount("inbox");
      expect(restoredInboxCount).toBe(1);
    }
  });
});
