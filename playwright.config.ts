import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3103",
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
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
      CLERK_ALLOWED_USER_IDS: process.env.CLERK_ALLOWED_USER_IDS ?? "",
      CLERK_AUTHORIZED_PARTIES:
        process.env.CLERK_AUTHORIZED_PARTIES ?? "",
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3103",
    },
    url: "http://localhost:3103/offline",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
