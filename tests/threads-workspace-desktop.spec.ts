import { expect, test, type Page } from "@playwright/test";
import { commitCapture, newestThreadId } from "./helpers/capture-shell";

async function seedCapture(page: Page, text: string): Promise<string> {
  await commitCapture(page, text);
  return newestThreadId(page);
}

test("desktop Days is a split view: day list left, the day or Thread right", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  const firstId = await seedCapture(page, "Stone wall into the reservoir");
  const secondId = await seedCapture(page, "Fern colony on the north side");
  expect(secondId).not.toBe(firstId);

  await page.goto(`/threads/${firstId}`);

  // Both panes at once: the day list and the selected Thread's review.
  await expect(
    page.getByRole("heading", { name: "Days", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("thread-chat")).toBeVisible();
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Stone wall into the reservoir",
  );

  // The day the Thread belongs to is one row away, and opening it swaps the
  // detail pane without losing the list.
  await page.locator(".desk-day-open").first().click();
  await expect(page).toHaveURL(/\/days\/\d{4}-\d{2}-\d{2}/);
  await expect(page.getByTestId("daily-digest")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Days", exact: true }),
  ).toBeVisible();

  // Selecting a Thread from the day swaps it back.
  await page
    .getByRole("link", { name: /Fern colony on the north side/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/threads/${secondId}`));
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Fern colony on the north side",
  );
});

test("filing a Thread advances to the next unfiled one from the same day", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  const olderId = await seedCapture(page, "Fern colony on the north side");
  const newerId = await seedCapture(page, "Stone wall into the reservoir");
  expect(newerId).not.toBe(olderId);

  // Fake the server review endpoint: echo the decision. Globals do not
  // survive a page load, so it is re-injected after each navigation.
  const installReviewTransport = () =>
    page.evaluate(() => {
      (globalThis as Record<string, unknown>).__WT_REVIEW_TRANSPORT__ = {
        async setReviewed(threadId: string, reviewed: boolean) {
          return {
            threadId,
            reviewedAt: reviewed ? new Date().toISOString() : null,
          };
        },
      };
    });

  await page.goto(`/threads/${newerId}`);
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Stone wall into the reservoir",
  );

  await installReviewTransport();
  await page.getByTestId("thread-reviewed-toggle").click();

  // Inbox-zero for the day: selection advances to the next unfiled Thread.
  await expect(page).toHaveURL(new RegExp(`/threads/${olderId}`));
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Fern colony on the north side",
  );

  // The day still holds the filed Thread, marked Reviewed and settled.
  await page.locator(".desk-day-open").first().click();
  await expect(
    page.getByRole("link", { name: /Stone wall into the reservoir/ }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  // Search reaches it from anywhere.
  await page.getByLabel("Search all Threads").fill("stone wall");
  await expect(
    page.getByRole("link", { name: /Stone wall into the reservoir/ }).first(),
  ).toBeVisible();
});

test("a day's Threads step next and previous at the desk", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await seedCapture(page, "Stone wall into the reservoir");
  await seedCapture(page, "Fern colony on the north side");
  await seedCapture(page, "Beaver dam below the culvert");

  // Enter from the day, so stepping follows the order just read.
  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await expect(page.getByTestId("daily-digest")).toBeVisible();

  const rows = page.locator(".day-threads .thread-row-title");
  await expect(rows).toHaveCount(3);
  const titles = await rows.allInnerTexts();

  await page.locator(".day-threads .thread-row-main").first().click();
  const nav = page.getByTestId("desk-thread-nav");
  await expect(nav).toBeVisible();
  await expect(page.getByTestId("desk-thread-place")).toContainText("1 of 3");
  // Nothing before the first Thread of a day: a day has ends.
  await expect(page.getByTestId("desk-thread-previous")).toBeDisabled();

  await page.getByTestId("desk-thread-next").click();
  await expect(page.getByTestId("desk-thread-place")).toContainText("2 of 3");
  await expect(page.getByTestId("thread-capture-hero")).toContainText(titles[1]);

  await page.getByTestId("desk-thread-next").click();
  await expect(page.getByTestId("desk-thread-place")).toContainText("3 of 3");
  await expect(page.getByTestId("thread-capture-hero")).toContainText(titles[2]);
  // And nothing after the last.
  await expect(page.getByTestId("desk-thread-next")).toBeDisabled();

  // Previous walks back down the same order.
  await page.getByTestId("desk-thread-previous").click();
  await expect(page.getByTestId("desk-thread-place")).toContainText("2 of 3");
  await expect(page.getByTestId("thread-capture-hero")).toContainText(titles[1]);

  // The place reads as a way back to the day it belongs to.
  await page.getByTestId("desk-thread-place").click();
  await expect(page).toHaveURL(/\/days\/\d{4}-\d{2}-\d{2}/);
});

test("the step nav is desk chrome, not phone chrome", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  const first = await seedCapture(page, "Stone wall into the reservoir");
  await seedCapture(page, "Fern colony on the north side");

  await page.goto(`/threads/${first}`);
  await expect(page.getByTestId("thread-chat")).toBeVisible();
  // The phone steps with a swipe; the column spends no room on chrome.
  await expect(page.getByTestId("desk-thread-nav")).toHaveCount(0);
});
