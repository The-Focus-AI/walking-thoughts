import { expect, test, type Page } from "@playwright/test";

async function seedCapture(page: Page, text: string): Promise<string> {
  await page.getByLabel("Capture text").fill(text);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(
    page.getByRole("article", { name: new RegExp(text) }),
  ).toBeVisible();
  return page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listRecentThreads(): Promise<Array<{ id: string }>>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    const threads = await store!.listRecentThreads();
    return threads[0]!.id;
  });
}

test("desktop Threads is a split view: day list left, Thread review right", async ({
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
    page.getByRole("heading", { name: "Threads", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("thread-chat")).toBeVisible();
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Stone wall into the reservoir",
  );

  // Selecting another row swaps the detail pane without losing the list.
  await page
    .getByRole("link", { name: /Fern colony on the north side/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/threads/${secondId}`));
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Fern colony on the north side",
  );
  await expect(
    page.getByRole("heading", { name: "Threads", exact: true }),
  ).toBeVisible();
});

test("marking reviewed advances the queue; All and search still reach it", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  const olderId = await seedCapture(page, "Fern colony on the north side");
  const newerId = await seedCapture(page, "Stone wall into the reservoir");
  expect(newerId).not.toBe(olderId);

  // Fake the server review endpoint: echo the decision.
  await page.evaluate(() => {
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

  // Re-inject after navigation (globals do not survive page loads).
  await page.evaluate(() => {
    (globalThis as Record<string, unknown>).__WT_REVIEW_TRANSPORT__ = {
      async setReviewed(threadId: string, reviewed: boolean) {
        return {
          threadId,
          reviewedAt: reviewed ? new Date().toISOString() : null,
        };
      },
    };
  });
  await page.getByTestId("thread-reviewed-toggle").click();

  // Inbox-zero: selection advances to the next new Thread.
  await expect(page).toHaveURL(new RegExp(`/threads/${olderId}`));
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Fern colony on the north side",
  );

  // The reviewed Thread has left the New queue…
  await expect(
    page.getByRole("link", { name: /Stone wall into the reservoir/ }),
  ).toHaveCount(0);

  // …but All still shows it, marked Reviewed.
  await page.getByRole("tab", { name: "All" }).click();
  await expect(
    page.getByRole("link", { name: /Stone wall into the reservoir/ }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  // Search reaches reviewed Threads regardless of the queue chip.
  await page.getByRole("tab", { name: "New" }).click();
  await page.getByLabel("Search all Threads").fill("stone wall");
  await expect(
    page.getByRole("link", { name: /Stone wall into the reservoir/ }).first(),
  ).toBeVisible();
});
