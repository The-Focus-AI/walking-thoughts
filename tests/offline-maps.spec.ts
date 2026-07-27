import { expect, test } from "@playwright/test";

test("shell readiness pill opens the dedicated Offline Region section", async ({
  page,
}) => {
  await page.goto("/offline");
  await page.getByRole("link", { name: /Shell ready|Preparing shell/ }).click();
  await expect(page).toHaveURL(/\/offline-maps$/);
  await expect(page.getByTestId("offline-maps-page")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trail maps on this phone" }),
  ).toBeVisible();

  await expect(
    page
      .getByRole("button", { name: "Download Offline Region" })
      .or(page.getByTestId("offline-maps-ready"))
      .or(page.getByTestId("offline-region-download-progress")),
  ).toBeVisible({ timeout: 30_000 });
});

test("Offline page can finish installing the Offline Region pack", async ({
  page,
}) => {
  // The pack comes over the network, and the wait below allows 60s for it —
  // which the default 30s test timeout cut short, failing the test on a slow
  // fetch rather than a broken one.
  test.setTimeout(90_000);
  await page.goto("/offline-maps");
  await expect(page.getByTestId("offline-maps-page")).toBeVisible();

  // The page checks device storage and fetches the manifest before it knows
  // which state to show — wait for a decided state instead of sampling the
  // "Looking for trail maps…" frame, where the button does not exist yet.
  const download = page.getByRole("button", { name: "Download Offline Region" });
  await expect(
    download
      .or(page.getByTestId("offline-maps-ready"))
      .or(page.getByTestId("offline-region-download-progress")),
  ).toBeVisible({ timeout: 30_000 });
  if (await download.isVisible().catch(() => false)) {
    await download.click();
  }

  await expect(page.getByTestId("offline-maps-ready")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("link", { name: "Open Map Journal" }),
  ).toBeVisible();
});
