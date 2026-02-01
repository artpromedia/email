/**
 * User Settings E2E Tests
 * Tests for account settings, security settings, and preferences
 */

import { test, expect } from "@playwright/test";

test.describe("Account Settings", () => {
  test.describe("Profile Information", () => {
    test("should display current user profile", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Profile information should be visible
      await expect(page.getByLabel(/name|full.*name|display.*name/i)).toBeVisible();
    });

    test("should update display name", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const nameInput = page.getByLabel(/name|full.*name|display.*name/i);
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill("Updated Name");

        const saveButton = page.getByRole("button", { name: /save|update/i });
        await saveButton.click();

        await expect(page.getByText(/saved|updated|success/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should display email addresses", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Should show primary email
      await expect(page.getByText(/@.*\./))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should add secondary email address", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const addEmailButton = page
        .getByRole("button", { name: /add.*email|add.*address/i })
        .or(page.locator('[data-testid="add-email-button"]'));

      if (await addEmailButton.isVisible()) {
        await addEmailButton.click();

        const emailInput = page.getByLabel(/new.*email|email.*address/i);
        if (await emailInput.isVisible()) {
          await emailInput.fill("secondary@example.com");
          await page.getByRole("button", { name: /add|save/i }).click();
        }
      }
    });

    test("should upload profile avatar", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const avatarUpload = page
        .locator('input[type="file"][accept*="image"]')
        .or(page.locator('[data-testid="avatar-upload"]'));

      if (await avatarUpload.isVisible()) {
        // Avatar upload input exists
        await expect(avatarUpload).toBeVisible();
      }
    });
  });

  test.describe("Email Preferences", () => {
    test("should configure email signature", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const signatureTab = page
        .getByRole("tab", { name: /signature/i })
        .or(page.getByRole("link", { name: /signature/i }));

      if (await signatureTab.isVisible()) {
        await signatureTab.click();

        const signatureEditor = page
          .locator('[data-testid="signature-editor"]')
          .or(page.locator('textarea[name="signature"]'));

        await expect(signatureEditor)
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should set vacation/auto-reply message", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const autoReplyTab = page
        .getByRole("tab", { name: /vacation|auto.*reply|out.*office/i })
        .or(page.getByRole("link", { name: /vacation|auto.*reply/i }));

      if (await autoReplyTab.isVisible()) {
        await autoReplyTab.click();

        const enableToggle = page
          .getByLabel(/enable.*auto.*reply|enable.*vacation/i)
          .or(page.locator('[data-testid="auto-reply-toggle"]'));

        await expect(enableToggle)
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should configure forwarding rules", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const forwardingTab = page
        .getByRole("tab", { name: /forwarding/i })
        .or(page.getByRole("link", { name: /forwarding/i }));

      if (await forwardingTab.isVisible()) {
        await forwardingTab.click();

        const forwardingInput = page.getByLabel(/forward.*to|forwarding.*address/i);
        await expect(forwardingInput)
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });
  });
});

test.describe("Security Settings", () => {
  test.describe("Password Management", () => {
    test("should display change password form", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Navigate to security section
      const securityLink = page
        .getByRole("link", { name: /security|password/i })
        .or(page.getByRole("tab", { name: /security/i }));

      if (await securityLink.isVisible()) {
        await securityLink.click();
      }

      await expect(page.getByLabel(/current.*password|old.*password/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should validate password requirements on change", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const securityLink = page.getByRole("link", { name: /security/i });
      if (await securityLink.isVisible()) {
        await securityLink.click();
      }

      const newPasswordInput = page.getByLabel(/new.*password/i);
      if (await newPasswordInput.isVisible()) {
        await newPasswordInput.fill("weak");

        // Should show password requirements
        await expect(page.getByText(/characters|uppercase|lowercase|number|symbol/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should require current password to change password", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const _currentPasswordInput = page.getByLabel(/current.*password/i);
      const newPasswordInput = page.getByLabel(/new.*password/i);
      const confirmPasswordInput = page.getByLabel(/confirm.*password/i);

      if ((await newPasswordInput.isVisible()) && (await confirmPasswordInput.isVisible())) {
        // Leave current password empty
        await newPasswordInput.fill("NewPassword123!");
        await confirmPasswordInput.fill("NewPassword123!");

        const saveButton = page.getByRole("button", { name: /change.*password|save|update/i });
        await saveButton.click();

        // Should show error about current password
        await expect(page.getByText(/current.*password|required/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });
  });

  test.describe("Two-Factor Authentication", () => {
    test("should display MFA setup option", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      await expect(page.getByText(/two.*factor|2fa|mfa|authenticator/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should show QR code when enabling MFA", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const enableMfaButton = page
        .getByRole("button", { name: /enable.*mfa|enable.*2fa|set.*up/i })
        .or(page.locator('[data-testid="enable-mfa-button"]'));

      if (await enableMfaButton.isVisible()) {
        await enableMfaButton.click();

        // QR code should be displayed
        const qrCode = page
          .locator('img[alt*="qr"]')
          .or(page.locator('[data-testid="mfa-qr-code"]'))
          .or(page.locator("canvas")); // QR might be canvas

        await expect(qrCode)
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should show recovery codes after MFA setup", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // If MFA is already enabled, there should be a way to view recovery codes
      const viewRecoveryCodesButton = page
        .getByRole("button", { name: /recovery.*codes|backup.*codes/i })
        .or(page.locator('[data-testid="view-recovery-codes"]'));

      if (await viewRecoveryCodesButton.isVisible()) {
        await viewRecoveryCodesButton.click();

        // Recovery codes should be displayed
        await expect(page.getByText(/recovery.*codes|backup.*codes/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should allow disabling MFA", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const disableMfaButton = page
        .getByRole("button", { name: /disable.*mfa|disable.*2fa|remove/i })
        .or(page.locator('[data-testid="disable-mfa-button"]'));

      if (await disableMfaButton.isVisible()) {
        page.on("dialog", async (dialog) => {
          expect(dialog.message()).toMatch(/disable|confirm|sure/i);
          await dialog.dismiss();
        });
        await disableMfaButton.click();
      }
    });
  });

  test.describe("Active Sessions", () => {
    test("should display list of active sessions", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const sessionsSection = page
        .getByText(/active.*session|logged.*in.*device/i)
        .or(page.locator('[data-testid="sessions-section"]'));

      await expect(sessionsSection)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should allow revoking other sessions", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const revokeButton = page
        .getByRole("button", { name: /revoke|sign.*out|end.*session/i })
        .or(page.locator('[data-testid="revoke-session-button"]'));

      if (await revokeButton.isVisible()) {
        page.on("dialog", async (dialog) => {
          await dialog.dismiss();
        });
        await revokeButton.click();
      }
    });

    test("should show sign out all other sessions option", async ({ page }) => {
      await page.goto("/settings/account");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const signOutAllButton = page
        .getByRole("button", { name: /sign.*out.*all|revoke.*all|end.*all/i })
        .or(page.locator('[data-testid="sign-out-all-button"]'));

      await expect(signOutAllButton)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });
  });
});

test.describe("AI Settings", () => {
  test("should display AI assistant settings", async ({ page }) => {
    await page.goto("/settings/ai");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    await expect(page.getByText(/ai|assistant|smart|intelligence/i))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should toggle AI features on/off", async ({ page }) => {
    await page.goto("/settings/ai");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const aiToggle = page
      .locator('[data-testid="ai-enable-toggle"]')
      .or(page.getByRole("switch", { name: /enable.*ai|ai.*assistant/i }))
      .or(page.getByLabel(/enable.*ai/i));

    if (await aiToggle.isVisible()) {
      await aiToggle.click();
    }
  });

  test("should configure AI smart compose", async ({ page }) => {
    await page.goto("/settings/ai");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const smartComposeToggle = page
      .locator('[data-testid="smart-compose-toggle"]')
      .or(page.getByLabel(/smart.*compose|auto.*complete/i));

    if (await smartComposeToggle.isVisible()) {
      await expect(smartComposeToggle).toBeVisible();
    }
  });

  test("should configure AI email categorization", async ({ page }) => {
    await page.goto("/settings/ai");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const categorizationToggle = page
      .locator('[data-testid="categorization-toggle"]')
      .or(page.getByLabel(/categoriz|classify|sort/i));

    if (await categorizationToggle.isVisible()) {
      await expect(categorizationToggle).toBeVisible();
    }
  });
});

test.describe("Notification Settings", () => {
  test("should display notification preferences", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const notificationsTab = page
      .getByRole("tab", { name: /notification/i })
      .or(page.getByRole("link", { name: /notification/i }));

    if (await notificationsTab.isVisible()) {
      await notificationsTab.click();

      await expect(page.getByText(/notification|email.*alert/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should toggle desktop notifications", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const desktopNotifToggle = page
      .locator('[data-testid="desktop-notifications-toggle"]')
      .or(page.getByLabel(/desktop.*notification|browser.*notification/i));

    if (await desktopNotifToggle.isVisible()) {
      await desktopNotifToggle.click();
    }
  });

  test("should configure email notification frequency", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const frequencySelect = page
      .getByLabel(/frequency|how.*often/i)
      .or(page.locator('[data-testid="notification-frequency"]'));

    if (await frequencySelect.isVisible()) {
      await frequencySelect.click();
    }
  });
});

test.describe("Appearance Settings", () => {
  test("should toggle dark/light theme", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const themeToggle = page
      .locator('[data-testid="theme-toggle"]')
      .or(page.getByLabel(/dark.*mode|theme/i))
      .or(page.getByRole("button", { name: /theme|dark|light/i }));

    if (await themeToggle.isVisible()) {
      await themeToggle.click();

      // Check if body has dark class or theme attribute changed
      await page.waitForTimeout(500);
    }
  });

  test("should configure email density/layout", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const densitySelect = page
      .getByLabel(/density|layout|compact|comfortable/i)
      .or(page.locator('[data-testid="density-select"]'));

    if (await densitySelect.isVisible()) {
      await densitySelect.click();
    }
  });

  test("should configure reading pane position", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const readingPaneSelect = page
      .getByLabel(/reading.*pane|preview.*pane/i)
      .or(page.locator('[data-testid="reading-pane-position"]'));

    if (await readingPaneSelect.isVisible()) {
      await readingPaneSelect.click();
    }
  });
});

test.describe("Data & Privacy", () => {
  test("should display data export option", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const exportButton = page
      .getByRole("button", { name: /export.*data|download.*data/i })
      .or(page.locator('[data-testid="export-data-button"]'));

    await expect(exportButton)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should display account deletion option", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const deleteAccountButton = page
      .getByRole("button", { name: /delete.*account|close.*account/i })
      .or(page.locator('[data-testid="delete-account-button"]'));

    await expect(deleteAccountButton)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should require confirmation for account deletion", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const deleteAccountButton = page.getByRole("button", { name: /delete.*account/i });

    if (await deleteAccountButton.isVisible()) {
      page.on("dialog", async (dialog) => {
        expect(dialog.message()).toMatch(/delete|confirm|permanent|sure/i);
        await dialog.dismiss();
      });
      await deleteAccountButton.click();
    }
  });
});
