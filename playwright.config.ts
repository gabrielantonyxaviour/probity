import { defineConfig, devices } from "@playwright/test";

// Foundation default (07 §2). Grok owns this file and the projects/webServer wiring. Chromium only.
// @live is the one Nemotron verify. The other projects skip it so a full width pass does not start a second run.
const chrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "tests/e2e/ui",
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.PAYEE_UI_URL ?? "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "narrow", grepInvert: /@live/, use: { ...chrome, viewport: { width: 390, height: 844 } } },
    { name: "medium", grepInvert: /@live/, use: { ...chrome, viewport: { width: 834, height: 1112 } } },
    { name: "wide", grepInvert: /@live/, use: { ...chrome, viewport: { width: 1440, height: 900 } } },
    { name: "live", grep: /@live/, timeout: 360_000, use: { ...chrome, viewport: { width: 1440, height: 900 } } },
  ],
});
