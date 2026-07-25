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
