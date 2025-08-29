import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['json', { outputFile: './test-results/results.json' }],
    ['junit', { outputFile: './test-results/junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Webmail - Chromium',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.WEBMAIL_URL || 'http://localhost:5173',
      },
      testMatch: '**/webmail-*.spec.ts',
    },
    {
      name: 'Admin - Chromium', 
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.ADMIN_URL || 'http://localhost:5174',
      },
      testMatch: '**/admin-*.spec.ts',
    },
    {
      name: 'Mobile - Safari',
      use: { 
        ...devices['iPhone 13'],
        baseURL: process.env.WEBMAIL_URL || 'http://localhost:5173',
      },
      testMatch: '**/webmail-*.spec.ts',
    },
    {
      name: 'Lighthouse',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/lighthouse.spec.ts',
    },
    {
      name: 'Accessibility',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/accessibility.spec.ts',
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @ceerion/api dev',
      port: 4000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @ceerion/webmail dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @ceerion/admin dev',
      port: 5174,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
