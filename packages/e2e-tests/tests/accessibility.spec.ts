import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility Tests with axe-core
 * Tests critical user flows for WCAG 2.1 AA compliance
 */

test.describe('Accessibility (a11y) Tests', () => {
  test('Webmail - Inbox Accessibility', async ({ page }) => {
    await page.goto('/');
    
    // Login first
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="inbox-container"]');

    // Run accessibility scan on inbox
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);

    // Test keyboard navigation
    await page.keyboard.press('Tab'); // Should focus first email
    await page.keyboard.press('Enter'); // Should open email
    await expect(page.locator('[data-testid="email-content"]')).toBeVisible();

    // Test screen reader landmarks
    const landmarks = await page.locator('[role="main"], [role="navigation"], [role="banner"], [role="complementary"]').count();
    expect(landmarks).toBeGreaterThan(0);

    // Test ARIA labels
    const mailItems = await page.locator('[data-testid="email-item"]').count();
    for (let i = 0; i < Math.min(mailItems, 5); i++) {
      const item = page.locator('[data-testid="email-item"]').nth(i);
      await expect(item).toHaveAttribute('aria-label');
    }

    console.log('Inbox Accessibility Scan:', {
      violations: accessibilityScanResults.violations.length,
      passes: accessibilityScanResults.passes.length,
      incomplete: accessibilityScanResults.incomplete.length,
    });
  });

  test('Webmail - Email Thread Accessibility', async ({ page }) => {
    await page.goto('/');
    
    // Login and open email thread
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="inbox-container"]');
    
    // Open first email
    await page.click('[data-testid="email-item"]');
    await page.waitForSelector('[data-testid="email-content"]');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);

    // Test focus management
    await page.keyboard.press('Tab'); // Should focus reply button
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(['reply-button', 'forward-button', 'delete-button']).toContain(focusedElement);

    // Test email content accessibility
    const emailContent = page.locator('[data-testid="email-content"]');
    await expect(emailContent).toHaveAttribute('role', 'article');

    // Test attachment accessibility
    const attachments = page.locator('[data-testid="attachment-item"]');
    const attachmentCount = await attachments.count();
    for (let i = 0; i < attachmentCount; i++) {
      const attachment = attachments.nth(i);
      await expect(attachment).toHaveAttribute('aria-label');
      await expect(attachment).toHaveAttribute('role', 'button');
    }

    console.log('Email Thread Accessibility Scan:', {
      violations: accessibilityScanResults.violations.length,
      passes: accessibilityScanResults.passes.length,
    });
  });

  test('Webmail - Compose Accessibility', async ({ page }) => {
    await page.goto('/');
    
    // Login and open compose
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="inbox-container"]');
    
    await page.click('[data-testid="compose-button"]');
    await page.waitForSelector('[data-testid="compose-dialog"]');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);

    // Test form accessibility
    const toField = page.locator('[data-testid="compose-to"]');
    await expect(toField).toHaveAttribute('aria-label');
    await expect(toField).toHaveAttribute('aria-required', 'true');

    const subjectField = page.locator('[data-testid="compose-subject"]');
    await expect(subjectField).toHaveAttribute('aria-label');

    // Test rich text editor accessibility
    const editor = page.locator('[data-testid="compose-editor"]');
    await expect(editor).toHaveAttribute('role', 'textbox');
    await expect(editor).toHaveAttribute('aria-label');

    // Test keyboard shortcuts help
    await page.keyboard.press('F1'); // Should show keyboard shortcuts
    const helpDialog = page.locator('[data-testid="keyboard-shortcuts-dialog"]');
    if (await helpDialog.isVisible()) {
      await expect(helpDialog).toHaveAttribute('role', 'dialog');
      await expect(helpDialog).toHaveAttribute('aria-labelledby');
    }

    // Test attachment button accessibility
    const attachButton = page.locator('[data-testid="attach-file-button"]');
    await expect(attachButton).toHaveAttribute('aria-label');

    console.log('Compose Accessibility Scan:', {
      violations: accessibilityScanResults.violations.length,
      passes: accessibilityScanResults.passes.length,
    });
  });

  test('Admin - Users Management Accessibility', async ({ page }) => {
    await page.goto('/admin');
    
    // Admin login
    await page.fill('[data-testid="admin-email-input"]', 'admin@ceerion.com');
    await page.fill('[data-testid="admin-password-input"]', 'admin123');
    await page.click('[data-testid="admin-login-button"]');
    await page.waitForSelector('[data-testid="admin-dashboard"]');
    
    // Navigate to users management
    await page.click('[data-testid="users-nav-link"]');
    await page.waitForSelector('[data-testid="users-table"]');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);

    // Test table accessibility
    const usersTable = page.locator('[data-testid="users-table"]');
    await expect(usersTable).toHaveAttribute('role', 'table');
    
    // Check table headers
    const tableHeaders = page.locator('[data-testid="users-table"] th');
    const headerCount = await tableHeaders.count();
    for (let i = 0; i < headerCount; i++) {
      const header = tableHeaders.nth(i);
      await expect(header).toHaveAttribute('scope', 'col');
    }

    // Test search field accessibility
    const searchField = page.locator('[data-testid="search-users"]');
    await expect(searchField).toHaveAttribute('aria-label');
    await expect(searchField).toHaveAttribute('type', 'search');

    // Test action buttons accessibility
    const createButton = page.locator('[data-testid="create-user-button"]');
    await expect(createButton).toHaveAttribute('aria-label');

    // Test row actions accessibility
    const editButtons = page.locator('[data-testid="edit-user-button"]');
    const editButtonCount = await editButtons.count();
    for (let i = 0; i < Math.min(editButtonCount, 3); i++) {
      const button = editButtons.nth(i);
      await expect(button).toHaveAttribute('aria-label');
    }

    console.log('Admin Users Accessibility Scan:', {
      violations: accessibilityScanResults.violations.length,
      passes: accessibilityScanResults.passes.length,
    });
  });

  test('Admin - Deliverability Dashboard Accessibility', async ({ page }) => {
    await page.goto('/admin');
    
    // Admin login and navigate to deliverability
    await page.fill('[data-testid="admin-email-input"]', 'admin@ceerion.com');
    await page.fill('[data-testid="admin-password-input"]', 'admin123');
    await page.click('[data-testid="admin-login-button"]');
    await page.waitForSelector('[data-testid="admin-dashboard"]');
    
    await page.click('[data-testid="deliverability-nav-link"]');
    await page.waitForSelector('[data-testid="deliverability-dashboard"]');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);

    // Test status indicators accessibility
    const statusCards = page.locator('[data-testid*="status-card"]');
    const statusCount = await statusCards.count();
    for (let i = 0; i < statusCount; i++) {
      const card = statusCards.nth(i);
      await expect(card).toHaveAttribute('aria-label');
    }

    // Test DNS record copy buttons accessibility
    const copyButtons = page.locator('[data-testid*="copy-"][data-testid*="-record"]');
    const copyButtonCount = await copyButtons.count();
    for (let i = 0; i < copyButtonCount; i++) {
      const button = copyButtons.nth(i);
      await expect(button).toHaveAttribute('aria-label');
    }

    // Test DKIM rotation button accessibility
    const dkimButton = page.locator('[data-testid="rotate-dkim-button"]');
    if (await dkimButton.isVisible()) {
      await expect(dkimButton).toHaveAttribute('aria-label');
      await expect(dkimButton).toHaveAttribute('aria-describedby');
    }

    // Test chart accessibility (if present)
    const charts = page.locator('[role="img"], [data-testid*="chart"]');
    const chartCount = await charts.count();
    for (let i = 0; i < chartCount; i++) {
      const chart = charts.nth(i);
      await expect(chart).toHaveAttribute('aria-label');
    }

    console.log('Admin Deliverability Accessibility Scan:', {
      violations: accessibilityScanResults.violations.length,
      passes: accessibilityScanResults.passes.length,
    });
  });

  test('Color Contrast and Visual Accessibility', async ({ page }) => {
    await page.goto('/');
    
    // Login to access main UI
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="inbox-container"]');

    // Test with high contrast mode simulation
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .include('body')
      .analyze();

    // Check for color contrast violations specifically
    const contrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    );
    expect(contrastViolations).toEqual([]);

    // Test focus indicators
    await page.keyboard.press('Tab');
    const focusedElement = await page.locator(':focus').first();
    if (await focusedElement.isVisible()) {
      const focusOutline = await focusedElement.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow,
        };
      });
      
      // Should have visible focus indicator
      const hasVisibleFocus = 
        focusOutline.outline !== 'none' ||
        focusOutline.outlineWidth !== '0px' ||
        focusOutline.boxShadow !== 'none';
      
      expect(hasVisibleFocus).toBe(true);
    }

    console.log('Color Contrast Scan:', {
      contrastViolations: contrastViolations.length,
      totalViolations: accessibilityScanResults.violations.length,
    });
  });

  test('Screen Reader Navigation', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="inbox-container"]');

    // Test skip links
    await page.keyboard.press('Tab');
    const firstTabStop = await page.locator(':focus').first();
    const skipLinkText = await firstTabStop.textContent();
    expect(skipLinkText?.toLowerCase()).toContain('skip');

    // Test heading structure
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    expect(headings.length).toBeGreaterThan(0);

    // Verify proper heading hierarchy
    const headingLevels = await Promise.all(
      headings.map(async (heading) => {
        const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
        return parseInt(tagName.charAt(1));
      })
    );

    // Should start with h1 and not skip levels
    expect(headingLevels[0]).toBe(1);

    // Test landmark navigation
    const landmarks = await page.locator('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]').all();
    expect(landmarks.length).toBeGreaterThanOrEqual(2); // At least main and navigation

    // Test live regions for dynamic content
    const liveRegions = await page.locator('[aria-live]').count();
    expect(liveRegions).toBeGreaterThan(0); // Should have live regions for toasts/notifications

    console.log('Screen Reader Navigation Test:', {
      headingCount: headings.length,
      landmarkCount: landmarks.length,
      liveRegionCount: liveRegions,
      headingStructure: headingLevels,
    });
  });

  test('Keyboard Navigation Flow', async ({ page }) => {
    await page.goto('/');
    
    // Test login form keyboard navigation
    await page.keyboard.press('Tab'); // Skip link
    await page.keyboard.press('Tab'); // Email field
    await page.keyboard.type('user@ceerion.com');
    
    await page.keyboard.press('Tab'); // Password field
    await page.keyboard.type('password123');
    
    await page.keyboard.press('Tab'); // Login button
    await page.keyboard.press('Enter'); // Submit login
    
    await page.waitForSelector('[data-testid="inbox-container"]');

    // Test inbox navigation
    await page.keyboard.press('Tab'); // First focusable element
    
    // Navigate through several elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      
      const focusedElement = await page.locator(':focus').first();
      if (await focusedElement.isVisible()) {
        const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());
        const role = await focusedElement.getAttribute('role');
        
        // Should be interactive element
        const interactiveElements = ['button', 'input', 'select', 'textarea', 'a'];
        const interactiveRoles = ['button', 'link', 'tab', 'menuitem'];
        
        const isInteractive = 
          interactiveElements.includes(tagName) ||
          (role && interactiveRoles.includes(role)) ||
          await focusedElement.getAttribute('tabindex') === '0';
        
        expect(isInteractive).toBe(true);
      }
    }

    // Test escape key functionality
    await page.click('[data-testid="compose-button"]');
    await page.waitForSelector('[data-testid="compose-dialog"]');
    
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="compose-dialog"]')).not.toBeVisible();

    console.log('Keyboard Navigation Test: Passed');
  });
});
