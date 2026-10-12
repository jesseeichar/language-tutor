import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real API and Vite dev server against tests/e2e/data
 * and a throwaway database, on ports that do not clash with `bun run dev`.
 */
const API_PORT = 3101;
const WEB_PORT = 5199;
const env = {
  LT_DATA_DIR: "tests/e2e/data",
  LT_DB_PATH: "storage/e2e.sqlite",
  LT_API_PORT: String(API_PORT),
  LT_WEB_PORT: String(WEB_PORT),
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Fresh database on every run.
      command: "rm -f storage/e2e.sqlite storage/e2e.sqlite-wal storage/e2e.sqlite-shm && bun src/server/main.ts",
      url: `http://localhost:${API_PORT}/api/health`,
      env,
      reuseExistingServer: false,
    },
    {
      command: "bun --bun vite",
      url: `http://localhost:${WEB_PORT}`,
      env,
      reuseExistingServer: false,
    },
  ],
});
