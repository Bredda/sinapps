import { defineConfig, devices } from "@playwright/test";

const PORT = 3000; // the Keycloak dev client only allows http://localhost:3000/*
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://sinapps:sinapps@localhost:5433/sinapps_e2e";

/**
 * End-to-end tests: real app, PostgreSQL and Keycloak (`pnpm infra:up`), but a scripted
 * model and a mock MCP server. Stop `pnpm dev` first: the test server needs port 3000.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/bob.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-mcp-server.ts",
      port: 3398,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: "pnpm dev",
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        SINAPPS_CONFIG: "e2e/sinapps.e2e.config.yaml",
        SINAPPS_E2E_MOCK_LLM: "true",
        OTEL_SDK_DISABLED: "true",
        LOG_LEVEL: "warn",
      },
    },
  ],
});
