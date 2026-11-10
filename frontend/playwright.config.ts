// Browser (end-to-end) tests: real backend, real built frontend, headless Chromium.
// Run from the frontend folder with: npm run e2e
//
// Each run starts both servers from scratch (e2e/servers/), so every run gets
// a brand new SQLite database with the demo data. Tests run one at a time on
// purpose: they share that one database, and a fixed order keeps results
// repeatable. Reports and traces go to the system temporary folder, never into
// the repository.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.E2E_API_PORT ?? "8765";
const webPort = process.env.E2E_WEB_PORT ?? "4317";
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: join(tmpdir(), "seatplan-e2e-results"),
  fullyParallel: false,
  workers: 1,
  // A retry would hide a flaky test; we want to see it fail instead.
  retries: 0,
  forbidOnly: ci,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // The attendee flow on a phone-sized screen, tapping instead of clicking.
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: "node e2e/servers/backend.mjs",
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: { E2E_API_PORT: apiPort, E2E_WEB_PORT: webPort },
      // Never reuse a server that is already running: its data would not be fresh.
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: "node e2e/servers/frontend.mjs",
      url: `http://127.0.0.1:${webPort}/`,
      env: { E2E_API_PORT: apiPort, E2E_WEB_PORT: webPort },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
