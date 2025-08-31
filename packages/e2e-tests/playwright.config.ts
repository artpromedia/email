import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "./playwright-report" }],
    ["json", { outputFile: "./test-results/results.json" }],
    ["junit", { outputFile: "./test-results/junit.xml" }],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3003",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "Webmail Navigation - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-navigation.spec.ts",
    },
    {
      name: "Webmail Workflows - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-workflows.spec.ts",
    },
    {
      name: "Webmail Console Validation - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-console-validation.spec.ts",
    },
    {
      name: "Webmail Connectivity - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-connectivity.spec.ts",
    },
    {
      name: "Webmail Smoke - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-smoke.spec.ts",
    },
    {
      name: "Admin - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_URL || "http://localhost:3001",
      },
      testMatch: "**/admin-*.spec.ts",
    },
    {
      name: "Admin No-Flicker - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_URL || "http://localhost:3001",
      },
      testMatch: "**/admin-no-flicker.spec.ts",
    },
    {
      name: "Admin Performance - Chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_URL || "http://localhost:3001",
      },
      testMatch: "**/admin-performance.spec.ts",
    },
    {
      name: "Mobile - Safari",
      use: {
        ...devices["iPhone 13"],
        baseURL: process.env.WEBMAIL_URL || "http://localhost:3003",
      },
      testMatch: "**/webmail-navigation.spec.ts",
    },
    {
      name: "Lighthouse",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/lighthouse.spec.ts",
    },
    {
      name: "Accessibility",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/accessibility.spec.ts",
    },
  ],
  // webServer configuration removed - run servers manually
  // webServer: [...],
});
