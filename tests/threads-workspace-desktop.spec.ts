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
