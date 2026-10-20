import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const e2eDir = path.dirname(fileURLToPath(import.meta.url));

// Ports are overridable so E2E can run when the defaults are occupied
// by unrelated local processes: E2E_API_PORT (default 3001), E2E_WEB_PORT (default 3000).
const apiPort = process.env.E2E_API_PORT || "3001";
const webPort = process.env.E2E_WEB_PORT || "3000";

export default defineConfig({
  globalSetup: "./globalSetup.ts",
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "tsx src/server.ts",
      cwd: path.resolve(e2eDir, "../api"),
      env: {
        DATABASE_URL: `file:${path.resolve(e2eDir, "../api/prisma/e2e.db")}`,
        REDIS_URL: "redis://mock",
        PORT: apiPort,
        NODE_ENV: "development",
        MOCK_REDIS: "1",
      },
      url: `http://localhost:${apiPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      cwd: path.resolve(e2eDir, "../web"),
      env: {
        PORT: webPort,
        E2E_WEB_PORT: webPort,
        E2E_API_PORT: apiPort,
      },
      url: `http://localhost:${webPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
