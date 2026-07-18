import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { clerkE2EConfigured } from "./clerk-test-config";

setup.describe.configure({ mode: "serial" });
setup.skip(
  !clerkE2EConfigured,
  "Clerk preview keys, allowlist, and test identities are not configured",
);

setup("configure Clerk testing tokens", async () => {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  await clerkSetup();
});
