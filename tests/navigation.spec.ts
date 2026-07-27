import { expect, test } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./helpers/capture-shell";

/**
 * Public seams:
 * - A persistent bottom tab bar (Capture / Days / Map / You) is the shared
 *   navigation on every product surface.
 * - Days carries the glanceable sync pill.
 * - You reaches the Interview / Memory desk surface.
 */

test.describe("streamlined navigation", () => {
  test("bottom tab bar reaches Capture, Days, Map, and You from the shell", async ({
    page,
  }) => {
    await page.goto("/offline");
    const tabbar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabbar).toBeVisible();
    await expect(tabbar.getByRole("link", { name: "Capture" })).toBeVisible();

    await tabbar.getByRole("link", { name: "Days" }).click();
    await expect(page).toHaveURL(/\/days$/);
    await expect(
      page.getByRole("heading", { name: "Days", exact: true }),
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

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "You", exact: true })
      .click();
    await expect(page).toHaveURL(/\/interview/);
    await expect(page.getByTestId("interview-panel")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
        name: "You",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("bottom tab bar keeps working in airplane mode", async ({
    context,
    page,
  }) => {
    // One online visit prepares the shell: the service worker plus every
    // tab destination's page and chunks.
    await openCaptureShell(page);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active?.state;
        }),
      )
      .toBe("activated");

    await context.setOffline(true);

    const tabbar = () => page.getByRole("navigation", { name: "Primary" });

    await tabbar().getByRole("link", { name: "Days" }).click();
    await expect(page).toHaveURL(/\/days$/);
    await expect(
      page.getByRole("heading", { name: "Days", exact: true }),
    ).toBeVisible();

    await tabbar().getByRole("link", { name: "You", exact: true }).click();
    await expect(page).toHaveURL(/\/interview/);
    await expect(page.getByTestId("interview-panel")).toBeVisible();

    await tabbar().getByRole("link", { name: "Map", exact: true }).click();
    await expect(page).toHaveURL(/\/journal/);
    await expect(tabbar()).toBeVisible();

    // "/" needs Clerk in a configured install, so the composer itself lives
    // on /offline here — the point is that the tab lands on a page at all.
    await tabbar().getByRole("link", { name: "Capture" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(tabbar()).toBeVisible();
  });

  test("Thread view keeps the tab bar so it is never a dead end", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Juniper by the switchback");

    await page.goto("/days");
    await page.locator(".desk-day-open").first().click();
    await page
      .getByRole("link", { name: /Juniper by the switchback/ })
      .first()
      .click();
    await expect(page.getByTestId("thread-chat")).toBeVisible();

    const tabbar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabbar).toBeVisible();
    await tabbar.getByRole("link", { name: "Days" }).click();
    await expect(page).toHaveURL(/\/days$/);
  });
});
