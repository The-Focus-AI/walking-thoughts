import { expect, test } from "@playwright/test";

/**
 * Public seams:
 * - A persistent bottom tab bar (Capture / Threads / Map) is the shared
 *   navigation on every product surface.
 * - Threads carries the glanceable sync pill.
 */

test.describe("streamlined navigation", () => {
  test("bottom tab bar reaches Capture, Threads, and Map from the shell", async ({
    page,
  }) => {
    await page.goto("/offline");
    const tabbar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabbar).toBeVisible();
    await expect(tabbar.getByRole("link", { name: "Capture" })).toBeVisible();

    await tabbar.getByRole("link", { name: "Threads" }).click();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(
      page.getByRole("heading", { name: "Threads", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("sync-pill")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Map", exact: true })
      .click();
    await expect(page).toHaveURL(/\/journal/);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });

  test("Thread view keeps the tab bar so it is never a dead end", async ({
    page,
  }) => {
    await page.goto("/offline");
    await expect(page.getByLabel("Capture text")).toBeVisible();
    await page.getByLabel("Capture text").fill("Juniper by the switchback");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /Juniper by the switchback/ }),
    ).toBeVisible();

    await page.goto("/threads");
    await page
      .getByRole("link", { name: /Juniper by the switchback/ })
      .first()
      .click();
    await expect(page.getByTestId("thread-chat")).toBeVisible();

    const tabbar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabbar).toBeVisible();
    await tabbar.getByRole("link", { name: "Threads" }).click();
    await expect(page).toHaveURL(/\/threads$/);
  });
});
