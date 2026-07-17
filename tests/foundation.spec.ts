import { expect, test } from "@playwright/test";
import { authConfiguration } from "@/lib/auth-config";
import { restorePassThroughForExactSelfRewrite } from "@/lib/clerk-middleware-response";
import { clerkRuntimeConfigured } from "./clerk-test-config";

test("production authentication requires live keys and one canonical origin", () => {
  const base = {
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://walking-thoughts.thefocus.ai",
    CLERK_ALLOWED_USER_IDS: "user_owner",
    CLERK_AUTHORIZED_PARTIES: "https://walking-thoughts.thefocus.ai",
  };

  expect(
    authConfiguration({
      ...base,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
    }).configured,
  ).toBe(false);
  expect(
    authConfiguration({
      ...base,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
      CLERK_SECRET_KEY: "sk_live_example",
      CLERK_AUTHORIZED_PARTIES: "https://untrusted.example",
    }).configured,
  ).toBe(false);
  expect(
    authConfiguration({
      ...base,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
      CLERK_SECRET_KEY: "sk_live_example",
    }).configured,
  ).toBe(true);
});

test("safe Clerk initialization does not unlock private access without an allowlist", () => {
  const configuration = authConfiguration({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    CLERK_SECRET_KEY: "sk_test_example",
  });

  expect(configuration.clerkReady).toBe(true);
  expect(configuration.configured).toBe(false);
});

test("Clerk self-rewrites remain pass-through requests on Next 16", () => {
  const requestUrl = new URL("http://localhost:3103/offline");
  const response = new Response(null, {
    headers: {
      "x-middleware-rewrite": requestUrl.href,
      "x-middleware-request-x-clerk-auth-status": "signed-out",
    },
  });

  restorePassThroughForExactSelfRewrite(response, requestUrl);

  expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(
    response.headers.get("x-middleware-request-x-clerk-auth-status"),
  ).toBe("signed-out");
});

test("installed shell remains useful when the network disappears", async ({
  context,
  page,
}) => {
  test.skip(
    clerkRuntimeConfigured,
    "The authenticated offline flow is covered by auth.spec.ts",
  );
  await page.goto("/");
  await expect(page).toHaveTitle("Walking Thoughts");
  await expect(
    page.getByRole("heading", { name: "Capture what matters out there." }),
  ).toBeVisible();

  const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifest).toBe("/manifest.webmanifest");

  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    name: "Walking Thoughts",
    display: "standalone",
    start_url: "/",
  });

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state;
      }),
    )
    .toBe("activated");
  await expect(page.getByText("Ready offline")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Capture what matters out there." }),
  ).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible();
});

test("health reports configuration without exposing secret values", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  const payload = await response.json();

  expect([200, 503]).toContain(response.status());
  expect(payload).toEqual({
    status: expect.stringMatching(/^(ok|configuration_required)$/),
    services: {
      clerkPublishableKey: expect.any(Boolean),
      clerkSecretKey: expect.any(Boolean),
      allowedUsers: expect.any(Boolean),
    },
  });
  expect(response.status()).toBe(payload.status === "ok" ? 200 : 503);
  expect(JSON.stringify(payload)).not.toMatch(/(?:pk|sk)_(?:test|live)_/);
});
