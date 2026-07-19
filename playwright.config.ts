import { defineConfig, devices } from "@playwright/test";

const testOrigin = "http://localhost:3103";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: testOrigin,
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
      testIgnore: [/clerk\.setup\.ts/, /.*-desktop\.spec\.ts/],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: "desktop",
      dependencies: ["clerk-setup"],
      testMatch: /.*-desktop\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 820 },
      },
    },
  ],
  webServer: {
    command:
      "pnpm build && pnpm start --hostname 127.0.0.1 --port 3103",
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
      CLERK_ALLOWED_USER_IDS: process.env.CLERK_ALLOWED_USER_IDS ?? "",
      CLERK_AUTHORIZED_PARTIES: testOrigin,
      NEXT_PUBLIC_APP_URL: testOrigin,
      // Empty string forces the small committed fixture pack (not the ~87 MB home Blob).
      NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE: "",
    },
    url: `${testOrigin}/offline`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
