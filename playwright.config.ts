import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.(spec|setup)\.ts/,
  forbidOnly: isCI,
  fullyParallel: true,
  reporter: "html",
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: "playwright/.auth/user.json",
  },
  webServer: {
    command: `npm run dev -- --host localhost --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
