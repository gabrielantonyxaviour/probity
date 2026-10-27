import { defineConfig, devices } from "@playwright/test";

// Foundation default (07 §2). Grok owns this file and the projects/webServer wiring. Chromium only.
export default defineConfig({
  testDir: "tests/e2e/ui",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.PAYEE_UI_URL ?? "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "medium", use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } } },
    { name: "wide", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
