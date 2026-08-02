import { expect, test, type Page } from "@playwright/test";
import {
  railRow,
  readThread,
  seedPile,
  stubFilingTransport,
} from "./helpers/desk-pile";

/**
 * Processing at the desk with hands on the keyboard: j/k walk the rows the
 * facets and Lens are showing, r/n/x file the focused one and step on, g
 * cycles the Lens. Clearing a day never requires the mouse.
 */

function focusedRow(page: Page) {
  return page.locator(".thread-row[data-focused='true']");
}

test("j and k walk exactly the rows the facets are showing, in display order", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open&lens=kind");

  // Three open Threads, stacked by Kind: task, question, media.
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  await page.keyboard.press("j");
  await expect(focusedRow(page)).toContainText("Goldin");
  await page.keyboard.press("j");
  await expect(focusedRow(page)).toContainText("reservoir wall");
  await page.keyboard.press("j");
  await expect(focusedRow(page)).toContainText("culvert grate");
  // The end of the queue is the end; focus does not wrap into what the
  // facets are hiding.
  await page.keyboard.press("j");
  await expect(focusedRow(page)).toContainText("culvert grate");

  await page.keyboard.press("k");
  await expect(focusedRow(page)).toContainText("reservoir wall");

  // Narrowing further leaves only what the facet allows, and the walk
  // follows it rather than the old set.
  await railRow(page, "kind", "media").click();
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
  await page.keyboard.press("j");
  await expect(focusedRow(page)).toContainText("culvert grate");
  await expect(focusedRow(page)).toHaveCount(1);
});

test("r keeps the research, files the Thread, and steps to the next open row", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open");

  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);
  await expect(railRow(page, "state", "open")).toContainText("3");

  // The keys walk the queue as it is displayed, whatever that order is.
  const order = await page
    .locator(".desk-stack .thread-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-thread-row")!),
    );

  await page.keyboard.press("j");
  await expect(focusedRow(page)).toHaveAttribute("data-thread-row", order[0]);
  await page.keyboard.press("r");

  // Filed and kept, and the rail counts it out of Open.
  await expect
    .poll(async () => (await readThread(page, order[0])).researchVerdict)
    .toBe("kept");
  await expect(railRow(page, "state", "open")).toContainText("2");
  await expect(railRow(page, "state", "kept")).toContainText("2");

  // Focus advanced to the next open row rather than dangling on a Thread
  // the State facet has just taken away.
  await expect(focusedRow(page)).toHaveAttribute("data-thread-row", order[1]);
  expect(order[1]).not.toBe(ids.heron);
});

test("n files without a verdict and x dismisses; both mark the Thread Reviewed", async ({
  page,
}) => {
  await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open");

  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);
  const order = await page
    .locator(".desk-stack .thread-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-thread-row")!),
    );

  await page.keyboard.press("j");
  await page.keyboard.press("n");
  await expect
    .poll(async () => (await readThread(page, order[0])).reviewedAt)
    .not.toBeNull();
  // Just reviewed: the research question is left unanswered, not settled.
  expect((await readThread(page, order[0])).researchVerdict).toBeNull();

  await expect(focusedRow(page)).toHaveAttribute("data-thread-row", order[1]);
  await page.keyboard.press("x");
  await expect
    .poll(async () => (await readThread(page, order[1])).researchVerdict)
    .toBe("dismissed");
  await expect
    .poll(async () => (await readThread(page, order[1])).reviewedAt)
    .not.toBeNull();
});

test("clearing the queue from the keyboard alone ends in a clear done state", async ({
  page,
}) => {
  await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // Filed at speed: each press lands, even before the last one has settled.
  await page.keyboard.press("j");
  await page.keyboard.press("n");
  await page.keyboard.press("n");
  await page.keyboard.press("n");

  // The last open row filed: the queue says so instead of leaving focus on
  // nothing.
  await expect(railRow(page, "state", "open")).toContainText("0");
  await expect(page.getByTestId("desk-queue-done")).toBeVisible();
  await expect(focusedRow(page)).toHaveCount(0);
});

test("g cycles the Lens, and typing in a filing control is never a shortcut", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await stubFilingTransport(page);
  await page.goto("/days?state=open");

  await expect(page.getByTestId("lens-days")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.keyboard.press("g");
  await expect(page).toHaveURL(/lens=topics/);
  await page.keyboard.press("g");
  await expect(page).toHaveURL(/lens=kind/);

  // Open a row and type a Project name: the keys are the walker's letters,
  // not the desk's shortcuts, and nothing files.
  await page.getByTestId(`expand-thread-${ids.goldin}`).click();
  const filing = page.getByTestId(`thread-detail-${ids.goldin}`);
  await filing.getByLabel("New project name").fill("Reservoir jrnx");
  await expect(filing.getByLabel("New project name")).toHaveValue(
    "Reservoir jrnx",
  );
  expect((await readThread(page, ids.goldin)).reviewedAt).toBeNull();
  await expect(page).toHaveURL(/lens=kind/);
});
