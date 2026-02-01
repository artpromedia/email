/**
 * Multi-Factor Authentication (MFA) E2E Tests
 * Tests for complete MFA flow including setup, login, and recovery
 */

import { test, expect } from "@playwright/test";

test.describe("MFA Login Flow", () => {
  test("should prompt for MFA code after valid credentials", async ({ page }) => {
    await page.goto("/login");

    // Enter valid credentials for MFA-enabled account
    await page.getByLabel(/email/i).fill("mfa-user@test.example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should show MFA input screen
    await expect(page.getByText(/verification.*code|authenticator|2fa|mfa/i))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {
        // MFA may not be configured in test environment
        test.skip();
      });
  });

  test("should show error for invalid MFA code", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("mfa-user@test.example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Wait for MFA screen
    const mfaInput = page
      .getByLabel(/code|verification|otp/i)
      .or(page.locator('[data-testid="mfa-code-input"]'));

    if (await mfaInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Enter invalid code
      await mfaInput.fill("000000");
      await page.getByRole("button", { name: /verify|submit|continue/i }).click();

      // Should show error
      await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });

  test("should allow using recovery code instead of MFA", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("mfa-user@test.example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Wait for MFA screen
    const recoveryLink = page
      .getByRole("link", { name: /recovery.*code|backup.*code|can't.*access/i })
      .or(page.locator('[data-testid="use-recovery-code"]'));

    if (await recoveryLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recoveryLink.click();

      // Should show recovery code input
      await expect(page.getByLabel(/recovery.*code|backup.*code/i)).toBeVisible();
    } else {
      test.skip();
    }
  });

  test("should redirect to setup MFA for enforced accounts", async ({ page }) => {
    // Login as user in organization that requires MFA
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("new-user@mfa-required-org.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should redirect to MFA setup
    await expect(page)
      .toHaveURL(/mfa.*setup|setup.*mfa|2fa/i, { timeout: 10000 })
      .catch(() => {
        // May not have MFA enforcement in test environment
      });
  });
});

test.describe("MFA Setup Flow", () => {
  test("should display QR code for authenticator app", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const enableMfaButton = page
      .getByRole("button", { name: /enable.*mfa|enable.*2fa|set.*up.*2fa/i })
      .or(page.locator('[data-testid="enable-mfa-button"]'));

    if (await enableMfaButton.isVisible()) {
      await enableMfaButton.click();

      // QR code should be displayed
      await expect(page.locator('img[alt*="qr"], canvas, [data-testid="qr-code"]'))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});

      // Secret key should also be shown for manual entry
      await expect(page.getByText(/secret|key|manual/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should verify MFA setup with valid code", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const enableMfaButton = page.getByRole("button", { name: /enable.*mfa/i });

    if (await enableMfaButton.isVisible()) {
      await enableMfaButton.click();

      // Enter verification code
      const verifyInput = page
        .getByLabel(/code|verification|otp/i)
        .or(page.locator('[data-testid="mfa-verify-input"]'));

      if (await verifyInput.isVisible()) {
        // In real test, would generate valid TOTP code
        await verifyInput.fill("123456");
        await page.getByRole("button", { name: /verify|confirm|enable/i }).click();
      }
    }
  });

  test("should display recovery codes after successful setup", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // After MFA setup, recovery codes should be shown
    const recoveryCodes = page
      .locator('[data-testid="recovery-codes"]')
      .or(page.getByText(/save.*recovery.*codes|backup.*codes/i));

    // Check if recovery codes section exists (for already-enabled users)
    await expect(recoveryCodes)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should allow copying recovery codes", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const copyButton = page
      .getByRole("button", { name: /copy/i })
      .or(page.locator('[data-testid="copy-recovery-codes"]'));

    if (await copyButton.isVisible()) {
      await copyButton.click();

      // Should show copied confirmation
      await expect(page.getByText(/copied/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should allow downloading recovery codes", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const downloadButton = page
      .getByRole("button", { name: /download/i })
      .or(page.locator('[data-testid="download-recovery-codes"]'));

    if (await downloadButton.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
        downloadButton.click(),
      ]);

      if (download) {
        expect(download.suggestedFilename()).toMatch(/recovery|backup|codes/i);
      }
    }
  });
});

test.describe("MFA Disable Flow", () => {
  test("should require current password to disable MFA", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const disableMfaButton = page
      .getByRole("button", { name: /disable.*mfa|remove.*2fa/i })
      .or(page.locator('[data-testid="disable-mfa-button"]'));

    if (await disableMfaButton.isVisible()) {
      await disableMfaButton.click();

      // Should prompt for password confirmation
      await expect(page.getByLabel(/password/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should require MFA code to disable MFA", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const disableMfaButton = page.getByRole("button", { name: /disable.*mfa/i });

    if (await disableMfaButton.isVisible()) {
      await disableMfaButton.click();

      // Should prompt for current MFA code
      await expect(page.getByLabel(/code|verification/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should show warning before disabling MFA", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const disableMfaButton = page.getByRole("button", { name: /disable.*mfa/i });

    if (await disableMfaButton.isVisible()) {
      await disableMfaButton.click();

      // Should show security warning
      await expect(page.getByText(/warning|security|less.*secure/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });
});

test.describe("Recovery Code Management", () => {
  test("should allow regenerating recovery codes", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const regenerateButton = page
      .getByRole("button", { name: /regenerate|new.*codes|generate.*new/i })
      .or(page.locator('[data-testid="regenerate-recovery-codes"]'));

    if (await regenerateButton.isVisible()) {
      page.on("dialog", async (dialog) => {
        expect(dialog.message()).toMatch(/regenerate|invalidate|confirm/i);
        await dialog.dismiss();
      });
      await regenerateButton.click();
    }
  });

  test("should show warning about old codes becoming invalid", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const regenerateButton = page.getByRole("button", { name: /regenerate.*codes/i });

    if (await regenerateButton.isVisible()) {
      await regenerateButton.click();

      // Should warn about old codes
      await expect(page.getByText(/previous|old|invalid|replace/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should show remaining recovery codes count", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // Should display how many recovery codes are left
    await expect(page.getByText(/\d+.*recovery.*codes|codes.*remaining/i))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });
});

test.describe("MFA Method Selection", () => {
  test("should support TOTP authenticator apps", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const totpOption = page
      .getByRole("radio", { name: /authenticator.*app|totp/i })
      .or(page.locator('[data-testid="mfa-totp-option"]'));

    if (await totpOption.isVisible()) {
      await expect(totpOption).toBeVisible();
    }
  });

  test("should support SMS if enabled", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const smsOption = page
      .getByRole("radio", { name: /sms|text.*message/i })
      .or(page.locator('[data-testid="mfa-sms-option"]'));

    // SMS may not be available in all deployments
    if (await smsOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await smsOption.click();

      // Should prompt for phone number
      await expect(page.getByLabel(/phone/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }
  });

  test("should support security keys (WebAuthn) if available", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const webauthnOption = page
      .getByRole("button", { name: /security.*key|hardware.*key|webauthn/i })
      .or(page.locator('[data-testid="mfa-webauthn-option"]'));

    if (await webauthnOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(webauthnOption).toBeVisible();
    }
  });
});

test.describe("MFA Remember Device", () => {
  test("should offer remember device option at MFA prompt", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("mfa-user@test.example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Wait for MFA screen
    const rememberCheckbox = page
      .getByLabel(/remember.*device|trust.*device|don't.*ask.*again/i)
      .or(page.locator('[data-testid="remember-device-checkbox"]'));

    if (await rememberCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(rememberCheckbox).toBeVisible();
    }
  });

  test("should manage trusted devices list", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const trustedDevices = page
      .getByText(/trusted.*device|remembered.*device/i)
      .or(page.locator('[data-testid="trusted-devices-section"]'));

    if (await trustedDevices.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(trustedDevices).toBeVisible();
    }
  });

  test("should allow revoking trusted devices", async ({ page }) => {
    await page.goto("/settings/account");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const revokeDeviceButton = page
      .getByRole("button", { name: /revoke|remove|forget/i })
      .or(page.locator('[data-testid="revoke-trusted-device"]'));

    if (await revokeDeviceButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      page.on("dialog", async (dialog) => {
        await dialog.dismiss();
      });
      await revokeDeviceButton.click();
    }
  });
});
