import { test, expect, Page } from '@playwright/test';

/**
 * Webmail Smoke Tests - Click EVERY visible primary control and assert network calls + toasts
 * These tests ensure core functionality works end-to-end
 */

test.describe('Webmail Smoke Tests @smoke', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Start monitoring network requests
    await page.route('**/api/**', (route) => {
      console.log(`API Call: ${route.request().method()} ${route.request().url()}`);
      route.continue();
    });

    // Navigate to webmail
    await page.goto('/');
  });

  test('Authentication Flow - Login & Logout', async () => {
    // Test login form
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // Fill login credentials
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    
    // Click login and expect network call
    const loginPromise = page.waitForResponse('**/api/auth/login');
    await page.click('[data-testid="login-button"]');
    const loginResponse = await loginPromise;
    expect(loginResponse.status()).toBe(200);
    
    // Expect success toast
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Should navigate to inbox
    await expect(page.locator('[data-testid="inbox-container"]')).toBeVisible();
    
    // Test logout
    await page.click('[data-testid="user-menu-trigger"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should return to login
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('Inbox - List & Read Operations', async () => {
    // Login first
    await loginUser(page);
    
    // Expect mail list API call
    const mailListPromise = page.waitForResponse('**/api/mail/list');
    await page.goto('/inbox');
    const mailListResponse = await mailListPromise;
    expect(mailListResponse.status()).toBe(200);
    
    // Click refresh button
    const refreshPromise = page.waitForResponse('**/api/mail/list');
    await page.click('[data-testid="refresh-button"]');
    await refreshPromise;
    
    // Expect toast notification
    await expect(page.locator('[data-testid="toast-info"]')).toBeVisible();
    
    // Click first email to read
    const firstEmail = page.locator('[data-testid="email-item"]').first();
    await expect(firstEmail).toBeVisible();
    
    const readPromise = page.waitForResponse('**/api/mail/*/read');
    await firstEmail.click();
    const readResponse = await readPromise;
    expect(readResponse.status()).toBe(200);
    
    // Expect email content to load
    await expect(page.locator('[data-testid="email-content"]')).toBeVisible();
    
    // Test mark as read/unread
    await page.click('[data-testid="mark-unread-button"]');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test star/unstar
    const starPromise = page.waitForResponse('**/api/mail/*/star');
    await page.click('[data-testid="star-button"]');
    await starPromise;
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Compose - Send Email Flow', async () => {
    await loginUser(page);
    
    // Click compose button
    await page.click('[data-testid="compose-button"]');
    
    // Expect compose dialog/sheet to open
    await expect(page.locator('[data-testid="compose-dialog"]')).toBeVisible();
    
    // Fill email form
    await page.fill('[data-testid="compose-to"]', 'recipient@example.com');
    await page.fill('[data-testid="compose-subject"]', 'Test Email Subject');
    
    // Fill email body (rich text editor)
    const editorFrame = page.frameLocator('[data-testid="compose-editor"] iframe').first();
    await editorFrame.locator('body').fill('This is a test email body content.');
    
    // Test attachment upload
    const fileInput = page.locator('[data-testid="attachment-input"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Test file content'),
    });
    
    // Expect attachment to appear
    await expect(page.locator('[data-testid="attachment-item"]')).toBeVisible();
    
    // Test save draft
    const draftPromise = page.waitForResponse('**/api/mail/draft');
    await page.click('[data-testid="save-draft-button"]');
    await draftPromise;
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test send email
    const sendPromise = page.waitForResponse('**/api/mail/send');
    await page.click('[data-testid="send-button"]');
    const sendResponse = await sendPromise;
    expect(sendResponse.status()).toBe(200);
    
    // Expect success toast and dialog close
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="compose-dialog"]')).not.toBeVisible();
  });

  test('Search & Filter Operations', async () => {
    await loginUser(page);
    
    // Test search functionality
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('important meeting');
    
    const searchPromise = page.waitForResponse('**/api/mail/search*');
    await page.press('[data-testid="search-input"]', 'Enter');
    const searchResponse = await searchPromise;
    expect(searchResponse.status()).toBe(200);
    
    // Expect search results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    
    // Test advanced search
    await page.click('[data-testid="advanced-search-button"]');
    await expect(page.locator('[data-testid="advanced-search-form"]')).toBeVisible();
    
    // Fill advanced search fields
    await page.fill('[data-testid="search-from"]', 'boss@company.com');
    await page.selectOption('[data-testid="search-date-range"]', 'last-week');
    await page.check('[data-testid="search-has-attachments"]');
    
    const advancedSearchPromise = page.waitForResponse('**/api/mail/search*');
    await page.click('[data-testid="apply-advanced-search"]');
    await advancedSearchPromise;
    
    // Test filter buttons
    await page.click('[data-testid="filter-unread"]');
    await page.waitForResponse('**/api/mail/list*');
    
    await page.click('[data-testid="filter-starred"]');
    await page.waitForResponse('**/api/mail/list*');
    
    await page.click('[data-testid="filter-attachments"]');
    await page.waitForResponse('**/api/mail/list*');
  });

  test('Folder & Label Management', async () => {
    await loginUser(page);
    
    // Test creating new folder
    await page.click('[data-testid="create-folder-button"]');
    await expect(page.locator('[data-testid="create-folder-dialog"]')).toBeVisible();
    
    await page.fill('[data-testid="folder-name-input"]', 'New Project Folder');
    
    const createFolderPromise = page.waitForResponse('**/api/folders');
    await page.click('[data-testid="create-folder-confirm"]');
    const createFolderResponse = await createFolderPromise;
    expect(createFolderResponse.status()).toBe(201);
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test moving email to folder
    const firstEmail = page.locator('[data-testid="email-item"]').first();
    await firstEmail.click({ button: 'right' }); // Right-click context menu
    
    await page.click('[data-testid="move-to-folder"]');
    await page.click('[data-testid="folder-option"]:has-text("New Project Folder")');
    
    await page.waitForResponse('**/api/mail/*/move');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test label operations
    await page.click('[data-testid="select-email-checkbox"]');
    await page.click('[data-testid="add-label-button"]');
    
    await page.selectOption('[data-testid="label-select"]', 'important');
    
    const labelPromise = page.waitForResponse('**/api/mail/*/labels');
    await page.click('[data-testid="apply-label-button"]');
    await labelPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Settings & Preferences', async () => {
    await loginUser(page);
    
    // Navigate to settings
    await page.click('[data-testid="user-menu-trigger"]');
    await page.click('[data-testid="settings-link"]');
    
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    
    // Test general settings
    await page.click('[data-testid="general-settings-tab"]');
    
    await page.selectOption('[data-testid="emails-per-page"]', '50');
    await page.check('[data-testid="enable-desktop-notifications"]');
    await page.selectOption('[data-testid="theme-select"]', 'dark');
    
    const saveSettingsPromise = page.waitForResponse('**/api/user/settings');
    await page.click('[data-testid="save-settings-button"]');
    await saveSettingsPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test signature settings
    await page.click('[data-testid="signature-settings-tab"]');
    
    const signatureEditor = page.frameLocator('[data-testid="signature-editor"] iframe');
    await signatureEditor.locator('body').fill('Best regards,\\nJohn Doe\\nCEERION User');
    
    await page.check('[data-testid="enable-signature"]');
    
    const saveSignaturePromise = page.waitForResponse('**/api/user/signature');
    await page.click('[data-testid="save-signature-button"]');
    await saveSignaturePromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test filter rules
    await page.click('[data-testid="filters-settings-tab"]');
    
    await page.click('[data-testid="create-filter-button"]');
    await page.fill('[data-testid="filter-name"]', 'Important Emails');
    await page.selectOption('[data-testid="filter-condition"]', 'from');
    await page.fill('[data-testid="filter-value"]', 'boss@company.com');
    await page.selectOption('[data-testid="filter-action"]', 'add-label');
    await page.selectOption('[data-testid="filter-label"]', 'important');
    
    const createFilterPromise = page.waitForResponse('**/api/user/filters');
    await page.click('[data-testid="save-filter-button"]');
    await createFilterPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Bulk Operations', async () => {
    await loginUser(page);
    
    // Select multiple emails
    await page.check('[data-testid="select-all-checkbox"]');
    
    // Test bulk mark as read
    const bulkReadPromise = page.waitForResponse('**/api/mail/bulk/mark-read');
    await page.click('[data-testid="bulk-mark-read"]');
    await bulkReadPromise;
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test bulk delete
    await page.check('[data-testid="select-all-checkbox"]');
    
    const bulkDeletePromise = page.waitForResponse('**/api/mail/bulk/delete');
    await page.click('[data-testid="bulk-delete"]');
    
    // Confirm deletion dialog
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-delete-button"]');
    
    await bulkDeletePromise;
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test bulk move
    await page.check('[data-testid="select-all-checkbox"]');
    await page.click('[data-testid="bulk-move"]');
    await page.click('[data-testid="folder-option"]:has-text("Trash")');
    
    await page.waitForResponse('**/api/mail/bulk/move');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });
});

// Helper function to login
async function loginUser(page: Page) {
  await page.goto('/');
  
  if (await page.locator('[data-testid="login-form"]').isVisible()) {
    await page.fill('[data-testid="email-input"]', 'user@ceerion.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForResponse('**/api/auth/login');
    await expect(page.locator('[data-testid="inbox-container"]')).toBeVisible();
  }
}
