import { expect, test } from "@playwright/test";
import { railRow, seedPile } from "./helpers/desk-pile";

/**
 * The frame the walker chose is the frame they stay in. Opening a Thread
 * out of a re-stacked or narrowed queue used to swap the left pane to that
 * Thread's day — a day nobody asked for — so the topic view they were
 * working simply vanished under them.
 */

test("opening a Thread from a Lens keeps the queue, not its day", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto("/days?reports=full&lens=topics");

  await expect(page.getByTestId("lens-topics")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page
    .locator(`[data-thread-row="${ids.question}"] .thread-row-main`)
    .click();
  await expect(page.getByTestId("thread-chat")).toBeVisible();

  // Still the working set: the Lens is still Topics, the facet is still on,
  // and the pane has not become that Thread's day.
  await expect(page.getByTestId("lens-topics")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(railRow(page, "reports", "full")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByTestId("desk-sidebar-day")).toHaveCount(0);
  await expect(page.locator(".desk-stack")).not.toHaveCount(0);

  // And the queue is still walkable from inside the Thread.
  await page.keyboard.press("j");
  await expect(page.locator(".thread-row[data-focused='true']")).toHaveCount(1);
});

test("a day the walker actually opened still frames what is inside it", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  // No facets, no Lens: the day list, and a day opens into its own Threads.
  await page.locator(".desk-day-open").first().click();
  await expect(page.getByTestId("desk-sidebar-day")).toBeVisible();

  // Narrowing inside a day keeps the day as the frame.
  await railRow(page, "kind", "question").click();
  await expect(page.getByTestId("desk-sidebar-day")).toBeVisible();
  await expect(page).toHaveURL(/kind=question/);
});

test("with nothing open, the queue has the whole width and no blank column", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  // The pane that would hold a Thread is not held open and empty.
  await expect(page.locator(".desk-detail-pane")).toBeHidden();
  const list = await page.locator(".desk-list-pane").boundingBox();
  const viewport = page.viewportSize()!;
  expect(list?.width ?? 0).toBeGreaterThan(viewport.width * 0.9);

  // Opening a day brings the detail pane back.
  await page.locator(".desk-day-open").first().click();
  await expect(page.locator(".desk-detail-pane")).toBeVisible();
});
