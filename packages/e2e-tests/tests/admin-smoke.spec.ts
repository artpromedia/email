import { test, expect, Page } from '@playwright/test';

/**
 * Admin Console Smoke Tests - Click EVERY visible primary control and assert network calls + toasts
 * Tests admin-specific functionality including user management, deliverability, and system controls
 */

test.describe('Admin Console Smoke Tests @smoke', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Monitor admin API calls
    await page.route('**/api/**', (route) => {
      console.log(`Admin API Call: ${route.request().method()} ${route.request().url()}`);
      route.continue();
    });

    await page.goto('/');
  });

  test('Admin Authentication Flow', async () => {
    // Test admin login
    await expect(page.locator('[data-testid="admin-login-form"]')).toBeVisible();
    
    await page.fill('[data-testid="admin-email-input"]', 'admin@ceerion.com');
    await page.fill('[data-testid="admin-password-input"]', 'admin123');
    
    const loginPromise = page.waitForResponse('**/api/admin/auth/login');
    await page.click('[data-testid="admin-login-button"]');
    const loginResponse = await loginPromise;
    expect(loginResponse.status()).toBe(200);
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible();
  });

  test('Admin Dashboard - Overview & Stats', async () => {
    await loginAdmin(page);
    
    // Navigate to dashboard
    await page.goto('/admin/dashboard');
    
    // Expect dashboard stats API calls
    await page.waitForResponse('**/api/admin/stats/overview');
    await page.waitForResponse('**/api/admin/stats/users');
    await page.waitForResponse('**/api/admin/stats/mail');
    
    // Test refresh dashboard button
    const refreshPromise = page.waitForResponse('**/api/admin/stats/overview');
    await page.click('[data-testid="refresh-dashboard"]');
    await refreshPromise;
    
    await expect(page.locator('[data-testid="toast-info"]')).toBeVisible();
    
    // Test time range selector
    await page.selectOption('[data-testid="time-range-select"]', '7d');
    await page.waitForResponse('**/api/admin/stats/overview*');
    
    // Verify dashboard cards are visible
    await expect(page.locator('[data-testid="total-users-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-emails-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="storage-usage-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="system-health-card"]')).toBeVisible();
  });

  test('User Management - CRUD Operations', async () => {
    await loginAdmin(page);
    
    // Navigate to user management
    await page.click('[data-testid="users-nav-link"]');
    
    const usersListPromise = page.waitForResponse('**/api/admin/users');
    await page.waitForSelector('[data-testid="users-table"]');
    await usersListPromise;
    
    // Test create new user
    await page.click('[data-testid="create-user-button"]');
    await expect(page.locator('[data-testid="create-user-dialog"]')).toBeVisible();
    
    await page.fill('[data-testid="user-email"]', 'newuser@ceerion.com');
    await page.fill('[data-testid="user-name"]', 'New User');
    await page.fill('[data-testid="user-password"]', 'securepassword123');
    await page.selectOption('[data-testid="user-role"]', 'user');
    await page.fill('[data-testid="user-quota"]', '5000');
    
    const createUserPromise = page.waitForResponse('**/api/admin/users');
    await page.click('[data-testid="save-user-button"]');
    const createUserResponse = await createUserPromise;
    expect(createUserResponse.status()).toBe(201);
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test edit user
    const editButton = page.locator('[data-testid="edit-user-button"]').first();
    await editButton.click();
    
    await expect(page.locator('[data-testid="edit-user-dialog"]')).toBeVisible();
    
    await page.fill('[data-testid="user-quota"]', '10000');
    await page.selectOption('[data-testid="user-role"]', 'admin');
    
    const updateUserPromise = page.waitForResponse('**/api/admin/users/*');
    await page.click('[data-testid="save-user-button"]');
    await updateUserPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test suspend user
    const suspendPromise = page.waitForResponse('**/api/admin/users/*/suspend');
    await page.click('[data-testid="suspend-user-button"]');
    await page.click('[data-testid="confirm-suspend-button"]');
    await suspendPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test search users
    await page.fill('[data-testid="search-users"]', 'newuser@ceerion.com');
    await page.waitForResponse('**/api/admin/users*search*');
    
    // Test filter users
    await page.selectOption('[data-testid="filter-users-role"]', 'admin');
    await page.waitForResponse('**/api/admin/users*');
    
    await page.selectOption('[data-testid="filter-users-status"]', 'suspended');
    await page.waitForResponse('**/api/admin/users*');
  });

  test('Deliverability Dashboard - DNS & DKIM Management', async () => {
    await loginAdmin(page);
    
    // Navigate to deliverability
    await page.click('[data-testid="deliverability-nav-link"]');
    
    await page.waitForResponse('**/api/admin/deliverability/status');
    await page.waitForResponse('**/api/admin/dkim/status');
    
    // Test DNS status refresh
    const dnsRefreshPromise = page.waitForResponse('**/api/admin/dns/check');
    await page.click('[data-testid="refresh-dns-status"]');
    await dnsRefreshPromise;
    
    await expect(page.locator('[data-testid="toast-info"]')).toBeVisible();
    
    // Test copy DNS record buttons
    await page.click('[data-testid="copy-mx-record"]');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    await page.click('[data-testid="copy-spf-record"]');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    await page.click('[data-testid="copy-dmarc-record"]');
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test DKIM key rotation
    const dkimRotatePromise = page.waitForResponse('**/api/admin/dkim/rotate');
    await page.click('[data-testid="rotate-dkim-button"]');
    
    await expect(page.locator('[data-testid="dkim-rotate-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-dkim-rotate"]');
    
    const dkimResponse = await dkimRotatePromise;
    expect(dkimResponse.status()).toBe(200);
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test DMARC report analysis
    await page.click('[data-testid="dmarc-reports-tab"]');
    
    await page.waitForResponse('**/api/admin/dmarc/reports');
    
    // Test date range filter for reports
    await page.selectOption('[data-testid="dmarc-date-range"]', 'last-7-days');
    await page.waitForResponse('**/api/admin/dmarc/reports*');
    
    // Test TLS-RPT reports
    await page.click('[data-testid="tls-rpt-tab"]');
    await page.waitForResponse('**/api/admin/tls-rpt/reports');
    
    // Test export reports
    const exportPromise = page.waitForResponse('**/api/admin/reports/export');
    await page.click('[data-testid="export-reports-button"]');
    await exportPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Quarantine Management', async () => {
    await loginAdmin(page);
    
    // Navigate to quarantine
    await page.click('[data-testid="quarantine-nav-link"]');
    
    await page.waitForResponse('**/api/admin/quarantine');
    
    // Test quarantine search
    await page.fill('[data-testid="quarantine-search"]', 'suspicious');
    await page.waitForResponse('**/api/admin/quarantine*search*');
    
    // Test filter by reason
    await page.selectOption('[data-testid="quarantine-filter-reason"]', 'spam');
    await page.waitForResponse('**/api/admin/quarantine*');
    
    // Test release email from quarantine
    const releasePromise = page.waitForResponse('**/api/admin/quarantine/*/release');
    await page.click('[data-testid="release-email-button"]');
    await page.click('[data-testid="confirm-release-button"]');
    await releasePromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test delete quarantined email
    const deletePromise = page.waitForResponse('**/api/admin/quarantine/*/delete');
    await page.click('[data-testid="delete-quarantine-button"]');
    await page.click('[data-testid="confirm-delete-button"]');
    await deletePromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test bulk operations
    await page.check('[data-testid="select-all-quarantine"]');
    
    const bulkReleasePromise = page.waitForResponse('**/api/admin/quarantine/bulk/release');
    await page.click('[data-testid="bulk-release-button"]');
    await page.click('[data-testid="confirm-bulk-release"]');
    await bulkReleasePromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Policy Management', async () => {
    await loginAdmin(page);
    
    // Navigate to policies
    await page.click('[data-testid="policies-nav-link"]');
    
    await page.waitForResponse('**/api/admin/policies');
    
    // Test create new policy
    await page.click('[data-testid="create-policy-button"]');
    await expect(page.locator('[data-testid="create-policy-dialog"]')).toBeVisible();
    
    await page.fill('[data-testid="policy-name"]', 'Enhanced Security Policy');
    await page.selectOption('[data-testid="policy-type"]', 'content-filter');
    await page.fill('[data-testid="policy-description"]', 'Blocks suspicious attachments and links');
    
    // Configure policy rules
    await page.check('[data-testid="block-exe-attachments"]');
    await page.check('[data-testid="scan-links"]');
    await page.fill('[data-testid="max-attachment-size"]', '25');
    
    const createPolicyPromise = page.waitForResponse('**/api/admin/policies');
    await page.click('[data-testid="save-policy-button"]');
    const createPolicyResponse = await createPolicyPromise;
    expect(createPolicyResponse.status()).toBe(201);
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test enable/disable policy
    const togglePromise = page.waitForResponse('**/api/admin/policies/*/toggle');
    await page.click('[data-testid="toggle-policy-button"]');
    await togglePromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test policy priority reordering
    const reorderPromise = page.waitForResponse('**/api/admin/policies/reorder');
    await page.dragAndDrop('[data-testid="policy-item"]:first-child', '[data-testid="policy-item"]:last-child');
    await reorderPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });

  test('Audit Log & System Monitoring', async () => {
    await loginAdmin(page);
    
    // Navigate to audit log
    await page.click('[data-testid="audit-nav-link"]');
    
    await page.waitForResponse('**/api/admin/audit/logs');
    
    // Test audit log search
    await page.fill('[data-testid="audit-search"]', 'user_created');
    await page.waitForResponse('**/api/admin/audit/logs*search*');
    
    // Test audit log filtering
    await page.selectOption('[data-testid="audit-filter-action"]', 'user_management');
    await page.waitForResponse('**/api/admin/audit/logs*');
    
    await page.selectOption('[data-testid="audit-filter-user"]', 'admin@ceerion.com');
    await page.waitForResponse('**/api/admin/audit/logs*');
    
    // Test date range filter
    await page.click('[data-testid="audit-date-from"]');
    await page.fill('[data-testid="audit-date-from"]', '2024-01-01');
    
    await page.click('[data-testid="audit-date-to"]');
    await page.fill('[data-testid="audit-date-to"]', '2024-12-31');
    
    await page.click('[data-testid="apply-audit-filter"]');
    await page.waitForResponse('**/api/admin/audit/logs*');
    
    // Test export audit log
    const exportAuditPromise = page.waitForResponse('**/api/admin/audit/export');
    await page.click('[data-testid="export-audit-button"]');
    await exportAuditPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test system metrics
    await page.click('[data-testid="system-metrics-tab"]');
    
    await page.waitForResponse('**/api/admin/metrics/system');
    await page.waitForResponse('**/api/admin/metrics/performance');
    
    // Test metrics refresh
    const metricsRefreshPromise = page.waitForResponse('**/api/admin/metrics/system');
    await page.click('[data-testid="refresh-metrics"]');
    await metricsRefreshPromise;
    
    await expect(page.locator('[data-testid="toast-info"]')).toBeVisible();
  });

  test('System Settings & Configuration', async () => {
    await loginAdmin(page);
    
    // Navigate to system settings
    await page.click('[data-testid="settings-nav-link"]');
    
    await page.waitForResponse('**/api/admin/settings');
    
    // Test SMTP settings
    await page.click('[data-testid="smtp-settings-tab"]');
    
    await page.fill('[data-testid="smtp-host"]', 'smtp.ceerion.com');
    await page.fill('[data-testid="smtp-port"]', '587');
    await page.selectOption('[data-testid="smtp-security"]', 'tls');
    await page.fill('[data-testid="smtp-username"]', 'system@ceerion.com');
    
    // Test SMTP connection
    const testSmtpPromise = page.waitForResponse('**/api/admin/smtp/test');
    await page.click('[data-testid="test-smtp-button"]');
    await testSmtpPromise;
    
    await expect(page.locator('[data-testid="toast-info"]')).toBeVisible();
    
    const saveSmtpPromise = page.waitForResponse('**/api/admin/settings/smtp');
    await page.click('[data-testid="save-smtp-settings"]');
    await saveSmtpPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test security settings
    await page.click('[data-testid="security-settings-tab"]');
    
    await page.check('[data-testid="enable-two-factor"]');
    await page.fill('[data-testid="session-timeout"]', '60');
    await page.check('[data-testid="require-strong-passwords"]');
    
    const saveSecurityPromise = page.waitForResponse('**/api/admin/settings/security');
    await page.click('[data-testid="save-security-settings"]');
    await saveSecurityPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
    
    // Test backup settings
    await page.click('[data-testid="backup-settings-tab"]');
    
    await page.check('[data-testid="enable-auto-backup"]');
    await page.selectOption('[data-testid="backup-frequency"]', 'daily');
    await page.fill('[data-testid="backup-retention"]', '30');
    
    // Test manual backup
    const backupPromise = page.waitForResponse('**/api/admin/backup/create');
    await page.click('[data-testid="create-backup-button"]');
    await backupPromise;
    
    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible();
  });
});

// Helper function to login as admin
async function loginAdmin(page: Page) {
  await page.goto('/admin');
  
  if (await page.locator('[data-testid="admin-login-form"]').isVisible()) {
    await page.fill('[data-testid="admin-email-input"]', 'admin@ceerion.com');
    await page.fill('[data-testid="admin-password-input"]', 'admin123');
    await page.click('[data-testid="admin-login-button"]');
    await page.waitForResponse('**/api/admin/auth/login');
    await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible();
  }
}
