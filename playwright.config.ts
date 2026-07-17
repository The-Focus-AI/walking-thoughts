import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3103",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "pixel-9",
      dependencies: ["clerk-setup"],
      testIgnore: /clerk\.setup\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
  webServer: {
    command:
      "pnpm build && pnpm start --hostname 127.0.0.1 --port 3103",
    url: "http://127.0.0.1:3103/offline",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
