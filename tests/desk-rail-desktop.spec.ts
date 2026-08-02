import { expect, test } from "@playwright/test";
import { railRow, seedPile, stubFilingTransport } from "./helpers/desk-pile";

/**
 * The desk's facet rail and Lens control. Everything here is built on what
 * the app already holds locally — kind, reviewed, media, reports — so the
 * seam is the browser: seed a pile, narrow it, re-stack it, file from a row.
 */

test("a Kind facet narrows the desk, the rail counts it, and the URL keeps it", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  const rail = page.getByTestId("desk-rail");
  await expect(rail).toBeVisible();
  await expect(railRow(page, "kind", "question")).toContainText("1");
  await expect(railRow(page, "kind", "task")).toContainText("1");

  await railRow(page, "kind", "question").click();
  await expect(page).toHaveURL(/kind=question/);

  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");
  // The rail says exactly what is on screen.
  await expect(railRow(page, "kind", "question")).toContainText("1");

  // The selection is the URL's, so a reload lands on the same working set.
  await page.reload();
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
  await expect(railRow(page, "kind", "question")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("groups combine, other groups recompute, and an empty row disables", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  // Three of the four are open; the heron is filed and its research kept.
  await expect(railRow(page, "state", "open")).toContainText("3");
  await expect(railRow(page, "state", "kept")).toContainText("1");

  await railRow(page, "state", "open").click();
  await expect(page).toHaveURL(/state=open/);
  // Kind counts now see only what is open — the heron's Kind falls to zero.
  await expect(railRow(page, "kind", "observation")).toContainText("0");
  await expect(railRow(page, "kind", "observation")).toBeDisabled();

  await railRow(page, "kind", "question").click();
  await expect(page).toHaveURL(/state=open/);
  await expect(page).toHaveURL(/kind=question/);
  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");

  // Nothing open with a question has a photo, and the rail still says so.
  await expect(railRow(page, "media", "photos")).toContainText("0");
  await expect(railRow(page, "media", "photos")).toBeDisabled();
});

test("the Lens re-stacks the same Threads without changing which they are", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open");

  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(3);
  // Days is the default: one stack, headed by the day.
  await expect(page.locator(".desk-stack")).toHaveCount(1);

  await page.getByTestId("lens-kind").click();
  await expect(page).toHaveURL(/lens=kind/);
  // Same three Threads, now stacked by what they are.
  await expect(rows).toHaveCount(3);
  await expect(page.locator(".desk-stack")).toHaveCount(3);
  await expect(page.locator(".desk-stack-title").first()).toContainText(
    "To do",
  );
  // The facet is still doing the filtering; the Lens only re-stacks.
  await expect(railRow(page, "state", "open")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("a row opens in place: the words, the Enrichment, the media, the filing", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open");

  await expect(railRow(page, "state", "open")).toContainText("3");

  await page.getByTestId(`expand-thread-${ids.question}`).click();
  const detail = page.getByTestId(`thread-detail-${ids.question}`);
  await expect(detail).toContainText("Why does the reservoir wall bulge");
  await expect(detail.getByTestId("thread-detail-enrichment")).toContainText(
    "Frost heave",
  );
  await expect(detail.getByTestId("thread-filing")).toBeVisible();

  // The photo Thread carries its media into the open row.
  await page.getByTestId(`expand-thread-${ids.grate}`).click();
  await expect(
    page
      .getByTestId(`thread-detail-${ids.grate}`)
      .locator(".thread-row-thumbs"),
  ).toBeVisible();

  // Filing from the row settles the Thread, and the rail counts it out of
  // Open and into Research kept without leaving the queue.
  await detail.getByTestId("file-keep-research").click();
  await expect(railRow(page, "state", "open")).toContainText("2");
  await expect(railRow(page, "state", "kept")).toContainText("2");
});

test("a link written before the rail existed lands on the same working set", async ({
  page,
}) => {
  await seedPile(page);

  await page.goto("/days?f=media");
  // The old "Has media" chip is the union of the media rows; the pile it
  // opens is the same one it always was.
  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("culvert grate");

  await page.goto("/days?f=reports");
  await expect(railRow(page, "reports", "full")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
  await expect(page.locator(".desk-stack .thread-row").first()).toContainText(
    "reservoir wall",
  );
});
