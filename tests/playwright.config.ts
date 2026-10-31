import { defineConfig, devices } from "@playwright/test";

// Runs only against the isolated QA stack started by support/qa-stack.sh (web :5300, API :3200, DB :5433).
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  outputDir: "test-results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 4,
  reporter: [["list"], ["json", { outputFile: process.env.QA_JSON ?? "results/raw/last-run.json" }]],
  use: { baseURL: process.env.QA_WEB ?? "http://localhost:5300", trace: "retain-on-failure", screenshot: "only-on-failure", navigationTimeout: 60_000, actionTimeout: 30_000 },
  projects: [
    { name: "security", testDir: "security", fullyParallel: true },
    { name: "concurrency", testDir: "concurrency", fullyParallel: false },
    { name: "desktop-chrome", testDir: "e2e", testMatch: /(lifecycle|elective|member|visibility)\.spec\.ts/, use: desktop },
    { name: "mobile-chrome", testDir: "e2e", testMatch: /journey\.spec\.ts/, use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
    { name: "firefox", testDir: "e2e", testMatch: /journey\.spec\.ts/, use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", testDir: "e2e", testMatch: /journey\.spec\.ts/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    { name: "chrome-journey", testDir: "e2e", testMatch: /journey\.spec\.ts/, use: desktop },
    { name: "a11y", testDir: "e2e", testMatch: /(a11y|keyboard)\.spec\.ts/, use: desktop },
    { name: "resilience", testDir: "e2e", testMatch: /resilience\.spec\.ts/, use: desktop },
  ],
});
