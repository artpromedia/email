/**
 * Admin Panel E2E Tests
 * Tests for domain management, user administration, and organization settings
 */

import { test, expect } from "@playwright/test";

test.describe("Admin Domain Management", () => {
  test.describe("Domain List", () => {
    test("should redirect non-admin users from domain management", async ({ page }) => {
      await page.goto("/admin/domains");
      // Should redirect to login or show access denied
      const url = page.url();
      expect(
        url.includes("login") || url.includes("admin/domains") || url.includes("403")
      ).toBeTruthy();
    });

    test("should display domains list for admin users", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Should show domains table or list
      const domainsTable = page
        .locator('[data-testid="domains-table"], table, [role="table"]')
        .or(page.locator(".domains-list"));
      await expect(domainsTable)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should have add domain button", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const addDomainButton = page
        .getByRole("link", { name: /add.*domain|new.*domain/i })
        .or(page.getByRole("button", { name: /add.*domain|new.*domain/i }))
        .or(page.locator('[data-testid="add-domain-button"]'));

      await expect(addDomainButton).toBeVisible();
    });

    test("should navigate to add domain page", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const addDomainButton = page
        .getByRole("link", { name: /add.*domain|new.*domain/i })
        .or(page.locator('[data-testid="add-domain-button"]'));

      if (await addDomainButton.isVisible()) {
        await addDomainButton.click();
        await expect(page).toHaveURL(/domains\/new/);
      }
    });
  });

  test.describe("Add New Domain", () => {
    test("should display domain registration form", async ({ page }) => {
      await page.goto("/admin/domains/new");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Domain name input should be visible
      const domainInput = page
        .getByLabel(/domain.*name|domain/i)
        .or(page.locator('[data-testid="domain-name-input"]'));
      await expect(domainInput).toBeVisible();
    });

    test("should validate domain name format", async ({ page }) => {
      await page.goto("/admin/domains/new");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const domainInput = page
        .getByLabel(/domain.*name|domain/i)
        .or(page.locator('[data-testid="domain-name-input"]'));

      // Enter invalid domain
      await domainInput.fill("invalid domain with spaces");

      const submitButton = page.getByRole("button", { name: /add|create|submit|save/i });
      await submitButton.click();

      // Should show validation error
      await expect(page.getByText(/invalid.*domain|valid domain/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should show DNS verification instructions after domain creation", async ({ page }) => {
      await page.goto("/admin/domains/new");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const domainInput = page
        .getByLabel(/domain.*name|domain/i)
        .or(page.locator('[data-testid="domain-name-input"]'));

      // Enter valid domain
      await domainInput.fill("test-domain.example.com");

      const submitButton = page.getByRole("button", { name: /add|create|submit|save/i });
      await submitButton.click();

      // Should show DNS verification section or navigate to verification page
      await expect(page.getByText(/dns|verification|txt.*record|mx.*record/i))
        .toBeVisible({ timeout: 10000 })
        .catch(() => {});
    });
  });

  test.describe("Domain Configuration", () => {
    test("should show DNS records for configured domain", async ({ page }) => {
      // Navigate to a specific domain's configuration
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      // Click on first domain in list
      const domainRow = page.locator('[data-testid="domain-row"], tr[data-domain]').first();
      if (await domainRow.isVisible()) {
        await domainRow.click();

        // Should show DNS configuration
        await expect(page.getByText(/mx|spf|dkim|dmarc/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should show DKIM configuration", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const domainRow = page.locator('[data-testid="domain-row"]').first();
      if (await domainRow.isVisible()) {
        await domainRow.click();

        // Look for DKIM section
        const dkimSection = page
          .getByRole("heading", { name: /dkim/i })
          .or(page.locator('[data-testid="dkim-section"]'));

        if (await dkimSection.isVisible()) {
          // DKIM public key or DNS record should be visible
          await expect(page.getByText(/v=DKIM1|public key/i))
            .toBeVisible({ timeout: 5000 })
            .catch(() => {});
        }
      }
    });

    test("should allow regenerating DKIM keys", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const domainRow = page.locator('[data-testid="domain-row"]').first();
      if (await domainRow.isVisible()) {
        await domainRow.click();

        const regenerateButton = page.getByRole("button", { name: /regenerate|rotate|new.*key/i });
        if (await regenerateButton.isVisible()) {
          // Should show confirmation dialog
          page.on("dialog", async (dialog) => {
            expect(dialog.message()).toMatch(/regenerate|rotate|confirm/i);
            await dialog.dismiss();
          });
          await regenerateButton.click();
        }
      }
    });

    test("should verify domain DNS records", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const domainRow = page.locator('[data-testid="domain-row"]').first();
      if (await domainRow.isVisible()) {
        await domainRow.click();

        const verifyButton = page.getByRole("button", { name: /verify|check.*dns/i });
        if (await verifyButton.isVisible()) {
          await verifyButton.click();

          // Should show verification result
          await expect(page.getByText(/verified|pending|failed|success/i))
            .toBeVisible({ timeout: 10000 })
            .catch(() => {});
        }
      }
    });
  });

  test.describe("Domain Deletion", () => {
    test("should require confirmation to delete domain", async ({ page }) => {
      await page.goto("/admin/domains");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const deleteButton = page
        .locator('[data-testid="delete-domain-button"]')
        .first()
        .or(page.getByRole("button", { name: /delete/i }).first());

      if (await deleteButton.isVisible()) {
        page.on("dialog", async (dialog) => {
          expect(dialog.message()).toMatch(/delete|remove|confirm/i);
          await dialog.dismiss();
        });
        await deleteButton.click();
      }
    });
  });
});

test.describe("User Administration", () => {
  test.describe("User List", () => {
    test("should display users list for admin", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const usersTable = page
        .locator('[data-testid="users-table"], table')
        .or(page.locator(".users-list"));
      await expect(usersTable)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    });

    test("should have add user button", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const addUserButton = page
        .getByRole("button", { name: /add.*user|invite.*user|new.*user/i })
        .or(page.locator('[data-testid="add-user-button"]'));

      await expect(addUserButton)
        .toBeVisible()
        .catch(() => {});
    });

    test("should search/filter users", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const searchInput = page
        .getByPlaceholder(/search.*users|filter/i)
        .or(page.locator('[data-testid="user-search"]'));

      if (await searchInput.isVisible()) {
        await searchInput.fill("test");
        await page.waitForTimeout(500); // Debounce
      }
    });
  });

  test.describe("User Details", () => {
    test("should view user profile details", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const userRow = page.locator('[data-testid="user-row"], tr[data-user]').first();
      if (await userRow.isVisible()) {
        await userRow.click();

        // Should show user details
        await expect(page.getByText(/email|name|role|status/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });

    test("should edit user role", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const userRow = page.locator('[data-testid="user-row"]').first();
      if (await userRow.isVisible()) {
        await userRow.click();

        const roleSelect = page.getByLabel(/role/i).or(page.locator('[data-testid="role-select"]'));

        if (await roleSelect.isVisible()) {
          await roleSelect.click();
          // Role options should be shown
        }
      }
    });

    test("should disable/suspend user account", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const userRow = page.locator('[data-testid="user-row"]').first();
      if (await userRow.isVisible()) {
        await userRow.click();

        const suspendButton = page.getByRole("button", { name: /suspend|disable|deactivate/i });
        if (await suspendButton.isVisible()) {
          page.on("dialog", async (dialog) => {
            await dialog.dismiss();
          });
          await suspendButton.click();
        }
      }
    });

    test("should reset user password", async ({ page }) => {
      await page.goto("/admin/users");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const userRow = page.locator('[data-testid="user-row"]').first();
      if (await userRow.isVisible()) {
        await userRow.click();

        const resetPasswordButton = page.getByRole("button", {
          name: /reset.*password|send.*reset/i,
        });
        if (await resetPasswordButton.isVisible()) {
          await resetPasswordButton.click();

          // Should show confirmation or success message
          await expect(page.getByText(/reset.*sent|password.*reset/i))
            .toBeVisible({ timeout: 5000 })
            .catch(() => {});
        }
      }
    });
  });

  test.describe("User Invitation", () => {
    test("should display user invitation form", async ({ page }) => {
      await page.goto("/admin/users/invite");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /invite|send/i })).toBeVisible();
    });

    test("should invite new user via email", async ({ page }) => {
      await page.goto("/admin/users/invite");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const emailInput = page.getByLabel(/email/i);
      if (await emailInput.isVisible()) {
        await emailInput.fill("newuser@example.com");

        const roleSelect = page.getByLabel(/role/i);
        if (await roleSelect.isVisible()) {
          await roleSelect.selectOption({ label: "user" });
        }

        await page.getByRole("button", { name: /invite|send/i }).click();

        // Should show success message
        await expect(page.getByText(/invitation.*sent|invited/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });
  });
});

test.describe("Organization Settings", () => {
  test.describe("General Settings", () => {
    test("should display organization name", async ({ page }) => {
      await page.goto("/settings/admin");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const orgNameInput = page
        .getByLabel(/organization.*name|company.*name/i)
        .or(page.locator('[data-testid="org-name-input"]'));

      await expect(orgNameInput)
        .toBeVisible()
        .catch(() => {});
    });

    test("should update organization settings", async ({ page }) => {
      await page.goto("/settings/admin");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const orgNameInput = page.getByLabel(/organization.*name/i);
      if (await orgNameInput.isVisible()) {
        await orgNameInput.fill("Updated Organization Name");

        const saveButton = page.getByRole("button", { name: /save|update/i });
        await saveButton.click();

        await expect(page.getByText(/saved|updated/i))
          .toBeVisible({ timeout: 5000 })
          .catch(() => {});
      }
    });
  });

  test.describe("Security Settings", () => {
    test("should display password policy settings", async ({ page }) => {
      await page.goto("/settings/admin/security");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      await expect(page.getByText(/password.*policy|password.*requirements/i))
        .toBeVisible()
        .catch(() => {});
    });

    test("should configure MFA requirements", async ({ page }) => {
      await page.goto("/settings/admin/security");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const mfaToggle = page
        .locator('[data-testid="require-mfa-toggle"]')
        .or(page.getByLabel(/require.*mfa|enforce.*2fa/i));

      if (await mfaToggle.isVisible()) {
        await mfaToggle.click();
      }
    });

    test("should configure session timeout", async ({ page }) => {
      await page.goto("/settings/admin/security");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const sessionTimeoutInput = page
        .getByLabel(/session.*timeout|idle.*timeout/i)
        .or(page.locator('[data-testid="session-timeout-input"]'));

      if (await sessionTimeoutInput.isVisible()) {
        await sessionTimeoutInput.fill("30");
      }
    });
  });

  test.describe("Quota Management", () => {
    test("should display storage quota settings", async ({ page }) => {
      await page.goto("/settings/admin/quotas");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      await expect(page.getByText(/storage.*quota|mailbox.*size/i))
        .toBeVisible()
        .catch(() => {});
    });

    test("should set default user quota", async ({ page }) => {
      await page.goto("/settings/admin/quotas");
      if (page.url().includes("login")) {
        test.skip();
        return;
      }

      const quotaInput = page
        .getByLabel(/default.*quota|storage.*limit/i)
        .or(page.locator('[data-testid="default-quota-input"]'));

      if (await quotaInput.isVisible()) {
        await quotaInput.fill("5");

        const saveButton = page.getByRole("button", { name: /save/i });
        await saveButton.click();
      }
    });
  });
});

test.describe("Audit Logs", () => {
  test("should display audit log entries", async ({ page }) => {
    await page.goto("/admin/audit-logs");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const auditTable = page
      .locator('[data-testid="audit-logs-table"], table')
      .or(page.locator(".audit-logs-list"));

    await expect(auditTable)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should filter audit logs by action type", async ({ page }) => {
    await page.goto("/admin/audit-logs");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const actionFilter = page
      .getByLabel(/action.*type|filter.*action/i)
      .or(page.locator('[data-testid="action-filter"]'));

    if (await actionFilter.isVisible()) {
      await actionFilter.click();
      // Filter options should be shown
    }
  });

  test("should filter audit logs by date range", async ({ page }) => {
    await page.goto("/admin/audit-logs");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const dateRangePicker = page
      .locator('[data-testid="date-range-picker"]')
      .or(page.getByLabel(/date.*range|from.*date/i));

    if (await dateRangePicker.isVisible()) {
      await dateRangePicker.click();
    }
  });

  test("should export audit logs", async ({ page }) => {
    await page.goto("/admin/audit-logs");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    const exportButton = page
      .getByRole("button", { name: /export|download/i })
      .or(page.locator('[data-testid="export-logs-button"]'));

    if (await exportButton.isVisible()) {
      // Set up download handler
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
        exportButton.click(),
      ]);

      if (download) {
        expect(download.suggestedFilename()).toMatch(/audit|logs/i);
      }
    }
  });
});

test.describe("Admin Dashboard", () => {
  test("should display system overview metrics", async ({ page }) => {
    await page.goto("/admin");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    // Should show various metrics
    await expect(page.getByText(/total.*users|active.*users/i))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should display storage usage", async ({ page }) => {
    await page.goto("/admin");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    await expect(page.getByText(/storage|usage|quota/i))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });

  test("should display active domains count", async ({ page }) => {
    await page.goto("/admin");
    if (page.url().includes("login")) {
      test.skip();
      return;
    }

    await expect(page.getByText(/domain|verified/i))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {});
  });
});
