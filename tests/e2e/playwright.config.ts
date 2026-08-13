import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: ".",
  testMatch: "test_*.ts",
  timeout: 60_000,
  retries: 1,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
  },

  projects: [
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  webServer: {
    command: "bun run start --port 3100",
    cwd: "../next-app",
    port: 3100,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
