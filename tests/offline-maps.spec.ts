import { expect, test } from "@playwright/test";

test("Maps topbar opens a dedicated Offline Region section", async ({
  page,
}) => {
  await page.goto("/offline");
  await page.getByRole("link", { name: "Maps", exact: true }).click();
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
  await page.goto("/offline-maps");
  await expect(page.getByTestId("offline-maps-page")).toBeVisible();

  const download = page.getByRole("button", { name: "Download Offline Region" });
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
