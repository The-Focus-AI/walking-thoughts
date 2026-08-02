import { expect, test, type Page } from "@playwright/test";
import { railRow, seedPile, stubFilingTransport } from "./helpers/desk-pile";

/**
 * Some Threads are not to be filed — they are to be thrown away. Trashing
 * from the desk must not take the walker anywhere: the row leaves, the
 * working set they built stays exactly as it was, and Trash is recoverable
 * so it offers an Undo rather than a confirm.
 */

function focusedRow(page: Page) {
  return page.locator(".thread-row[data-focused='true']");
}

async function visibleThreadIds(page: Page): Promise<string[]> {
  return page
    .locator(".desk-stack .thread-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-thread-row")!),
    );
}

test("an opened row can throw a Thread away, and says how that differs from filing", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto("/days?state=open");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  await page.getByTestId(`expand-thread-${ids.goldin}`).click();
  const detail = page.getByTestId(`thread-detail-${ids.goldin}`);
  await expect(detail).toContainText("Reviewed files this Thread and keeps it");
  await expect(detail).toContainText("recoverable for 30 days");

  await detail.getByTestId(`trash-thread-${ids.goldin}`).click();

  // Nowhere: same URL, same facets, one row fewer.
  await expect(page).toHaveURL(/\/days\?state=open$/);
  await expect(railRow(page, "state", "open")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(2);
  expect(await visibleThreadIds(page)).not.toContain(ids.goldin);
  await expect(railRow(page, "state", "open")).toContainText("2");

  // Recoverable, and it comes back into the same working set.
  await expect(page.getByTestId("desk-trashed")).toContainText("Trash");
  await page.getByTestId("desk-undo-trash").click();
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);
  expect(await visibleThreadIds(page)).toContain(ids.goldin);
  await expect(page).toHaveURL(/\/days\?state=open$/);
});

test("# trashes the focused row and steps on, without leaving the queue", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open&lens=kind");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);
  const order = await visibleThreadIds(page);

  await page.keyboard.press("j");
  await expect(focusedRow(page)).toHaveAttribute("data-thread-row", order[0]);
  await page.keyboard.press("#");

  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(2);
  await expect(focusedRow(page)).toHaveAttribute("data-thread-row", order[1]);
  await expect(page).toHaveURL(/lens=kind/);
  await expect(page).toHaveURL(/state=open/);
});

test("the working set survives opening a Thread, filing it, and trashing it", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open&lens=kind");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // Opening a Thread from a row carries the facets and the Lens with it.
  await page
    .locator(`[data-thread-row="${ids.question}"] .thread-row-main`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/threads/${ids.question}`));
  await expect(page).toHaveURL(/state=open/);
  await expect(page).toHaveURL(/lens=kind/);
  await expect(page.getByTestId("thread-chat")).toBeVisible();

  // Trashing from the Thread page returns to the queue that was being
  // worked, not to a bare day list.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("thread-trash").click();
  await expect(page).toHaveURL(/\/days\?/);
  await expect(page).toHaveURL(/state=open/);
  await expect(page).toHaveURL(/lens=kind/);
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(2);
});
