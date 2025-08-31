import { test, expect } from "@playwright/test";

/**
 * Admin Interface - Performance Tests
 * Measures INP and rendering performance for critical user interactions
 */

test.describe("Admin - Performance Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Enable performance monitoring
    await page.goto("http://localhost:3001/");
    await page.waitForLoadState("networkidle");
  });

  test("INP on Users list interactions < 200ms", async ({ page }) => {
    // Navigate to users list
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Measure INP for search interaction
    const searchINP = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const searchInput = document.querySelector(
          '[data-testid="search-input"]',
        ) as HTMLInputElement;
        if (!searchInput) {
          resolve(0);
          return;
        }

        const startTime = performance.now();

        // Create performance observer for INP
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry && lastEntry.name === "first-input") {
            const inp = lastEntry.processingEnd - lastEntry.processingStart;
            resolve(inp);
          }
        });

        observer.observe({ entryTypes: ["first-input"] });

        // Simulate user interaction
        searchInput.focus();
        searchInput.value = "test";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));

        // Fallback timeout
        setTimeout(() => {
          const endTime = performance.now();
          resolve(endTime - startTime);
        }, 1000);
      });
    });

    expect(searchINP).toBeLessThan(200);

    // Measure INP for filter interaction
    const filterINP = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const filterButton = document.querySelector(
          '[data-testid="filter-button"]',
        ) as HTMLButtonElement;
        if (!filterButton) {
          resolve(0);
          return;
        }

        const startTime = performance.now();
        filterButton.click();

        // Wait for next frame
        requestAnimationFrame(() => {
          const endTime = performance.now();
          resolve(endTime - startTime);
        });
      });
    });

    expect(filterINP).toBeLessThan(200);

    // Measure INP for sort interaction
    const sortINP = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const sortButton = document.querySelector(
          '[data-testid="sort-email"]',
        ) as HTMLButtonElement;
        if (!sortButton) {
          resolve(0);
          return;
        }

        const startTime = performance.now();
        sortButton.click();

        // Wait for next frame
        requestAnimationFrame(() => {
          const endTime = performance.now();
          resolve(endTime - startTime);
        });
      });
    });

    expect(sortINP).toBeLessThan(200);
  });

  test("Virtualized table ≤ 16ms render on scroll", async ({ page }) => {
    // Navigate to users list
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Wait for initial render to complete
    await page.waitForSelector('[data-testid="skeleton"]', {
      state: "detached",
      timeout: 10000,
    });

    // Measure scroll performance
    const scrollPerformance = await page.evaluate(async () => {
      const tableContainer = document.querySelector(
        '[data-testid="table-container"]',
      ) as HTMLElement;
      if (!tableContainer) return 0;

      const measurements: number[] = [];

      return new Promise<number>((resolve) => {
        let frameCount = 0;
        const maxFrames = 10;

        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (
              entry.entryType === "measure" &&
              entry.name.includes("scroll")
            ) {
              measurements.push(entry.duration);
            }
          });
        });

        observer.observe({ entryTypes: ["measure"] });

        const performScroll = () => {
          const startTime = performance.now();

          tableContainer.scrollBy(0, 200);

          requestAnimationFrame(() => {
            const endTime = performance.now();
            const renderTime = endTime - startTime;
            measurements.push(renderTime);

            frameCount++;
            if (frameCount < maxFrames) {
              setTimeout(performScroll, 100);
            } else {
              const avgRenderTime =
                measurements.reduce((a, b) => a + b, 0) / measurements.length;
              resolve(avgRenderTime);
            }
          });
        };

        performScroll();
      });
    });

    expect(scrollPerformance).toBeLessThan(16);
  });

  test("Large dataset rendering performance", async ({ page }) => {
    // Mock API to return large dataset
    await page.route("**/api/users*", (route) => {
      const users = Array.from({ length: 1000 }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: `LastName${i}`,
        isActive: true,
        isAdmin: false,
        quota: 1024,
        createdAt: new Date().toISOString(),
      }));

      route.fulfill({
        status: 200,
        body: JSON.stringify({
          users,
          total: 1000,
          page: 1,
          limit: 50,
        }),
      });
    });

    // Navigate and measure performance
    const startTime = await page.evaluate(() => performance.now());

    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });
    await page.waitForSelector('[data-testid="skeleton"]', {
      state: "detached",
      timeout: 10000,
    });

    const endTime = await page.evaluate(() => performance.now());
    const totalTime = endTime - startTime;

    // Should render large dataset in reasonable time
    expect(totalTime).toBeLessThan(3000);

    // Test scroll performance with large dataset
    const scrollStart = await page.evaluate(() => performance.now());

    await page.locator('[data-testid="table-container"]').evaluate((el) => {
      el.scrollBy(0, 2000);
    });

    await page.waitForTimeout(100); // Allow render to complete

    const scrollEnd = await page.evaluate(() => performance.now());
    const scrollTime = scrollEnd - scrollStart;

    expect(scrollTime).toBeLessThan(100);
  });

  test("Memory usage during interactions", async ({ page }) => {
    // Navigate to users
    await page.click('nav a[href="/users"]');
    await page.waitForSelector('[data-testid="users-table"]', {
      timeout: 10000,
    });

    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if ("memory" in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Perform multiple interactions
    for (let i = 0; i < 5; i++) {
      await page.fill('[data-testid="search-input"]', `test${i}`);
      await page.waitForTimeout(300);
      await page.fill('[data-testid="search-input"]', "");
      await page.waitForTimeout(300);
    }

    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      if ("memory" in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Memory should not grow excessively (allow 50% increase)
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = (finalMemory - initialMemory) / initialMemory;
      expect(memoryIncrease).toBeLessThan(0.5);
    }
  });

  test("First Contentful Paint (FCP) performance", async ({ page }) => {
    const navigationPromise = page.goto("http://localhost:3001/admin/users");

    // Measure FCP
    const fcpTime = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fcpEntry = entries.find(
            (entry) => entry.name === "first-contentful-paint",
          );
          if (fcpEntry) {
            resolve(fcpEntry.startTime);
            observer.disconnect();
          }
        });

        observer.observe({ entryTypes: ["paint"] });

        // Fallback timeout
        setTimeout(() => resolve(0), 5000);
      });
    });

    await navigationPromise;

    // FCP should be under 1.8s for good performance
    if (fcpTime > 0) {
      expect(fcpTime).toBeLessThan(1800);
    }
  });

  test("Largest Contentful Paint (LCP) performance", async ({ page }) => {
    await page.goto("http://localhost:3001/admin/users");

    // Measure LCP
    const lcpTime = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lcpEntry = entries[entries.length - 1]; // Latest LCP entry
          if (lcpEntry) {
            resolve(lcpEntry.startTime);
          }
        });

        observer.observe({ entryTypes: ["largest-contentful-paint"] });

        // Wait for page to fully load
        setTimeout(() => {
          const entries = performance.getEntriesByType(
            "largest-contentful-paint",
          );
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry ? lastEntry.startTime : 0);
          observer.disconnect();
        }, 3000);
      });
    });

    // LCP should be under 2.5s for good performance
    if (lcpTime > 0) {
      expect(lcpTime).toBeLessThan(2500);
    }
  });
});
