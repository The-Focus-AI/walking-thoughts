import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import {
  allowedEmail,
  clerkE2EConfigured,
  disallowedEmail,
} from "./clerk-test-config";

test.describe("single-user Clerk boundary", () => {
  test.skip(
    !clerkE2EConfigured,
    "Clerk preview keys, allowlist, and test identities are not configured",
  );

  test("sends an anonymous visitor to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("admits the allowed identity and retains a safe offline shell", async ({
    context,
    page,
  }) => {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: allowedEmail! });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Today's hike", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Offline Region map" }),
    ).toBeVisible();
    await expect(page.getByText("Ready offline")).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Today's hike", exact: true }),
    ).toBeVisible();
  });

  test("rejects a different signed-in identity", async ({ page }) => {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: disallowedEmail! });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "This account is not allowed." }),
    ).toBeVisible();
  });
});
