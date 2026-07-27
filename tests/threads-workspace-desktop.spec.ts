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

  // Inside a Thread, the sidebar is its day: the day's name opens the day
  // itself, swapping the detail pane without losing the list.
  await page.getByTestId("desk-sidebar-day").click();
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

  // The day still holds the filed Thread: the sidebar keeps it in the
  // day's list, marked Reviewed and settled.
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

test("inside a day the sidebar is that day's Threads, media in reach", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();

  // A Capture with a photo, straight through the store like the shell would.
  const threadId = await page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          commit(
            text: string,
            location: null,
            options: object,
          ): Promise<unknown>;
          listRecentThreads(): Promise<Array<{ id: string }>>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    await store!.commit("Culvert photo below the beaver dam", null, {
      destination: { type: "new_thread" },
      attachments: [
        {
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "culvert.jpg",
          bytes: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
        },
      ],
    });
    const threads = await store!.listRecentThreads();
    return threads[0]!.id;
  });

  await page.goto(`/threads/${threadId}`);
  await expect(page.getByTestId("thread-chat")).toBeVisible();

  // The sidebar swapped: this day's Threads, not the day list.
  await expect(page.getByTestId("desk-sidebar-day")).toBeVisible();
  await expect(page.locator(".desk-day")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Culvert photo below the beaver dam/ }),
  ).toBeVisible();

  // The row's photo opens in the lightbox without leaving the day.
  await page.getByTestId("thread-thumb").first().click();
  const lightbox = page.getByTestId("media-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox).toContainText("culvert.jpg");
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);

  // ← Days returns to the day list.
  await page.getByRole("link", { name: "← Days" }).click();
  await expect(page).toHaveURL(/\/days$/);
  await expect(page.locator(".desk-day")).toHaveCount(1);
});
