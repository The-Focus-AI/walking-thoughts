import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * Asking the desk a question. The walker is rarely looking for a Thread
 * they can already name — they are looking for something that was found
 * out, which the Enrichment wrote and they never typed. A search that reads
 * only their own words cannot answer that.
 */

test("search reads the reports, and answers with the line it matched", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");
  // The desk paints from the store before anything can be searched.
  await expect(page.locator(".desk-day-open").first()).toBeVisible();

  // "Frost heave" appears nowhere in the walker's own words — only in the
  // report written about the wall.
  await page.getByLabel("Search all Threads").fill("frost heave");

  const results = page.getByRole("list", { name: "Search results" });
  await expect(
    results.getByRole("link", { name: /reservoir wall/ }),
  ).toBeVisible();
  await expect(results.getByRole("link", { name: /Heron/ })).toHaveCount(0);

  // The result says what was found, not just where it lives.
  await expect(page.getByTestId("thread-row-snippet")).toContainText(
    "Frost heave",
  );

  // The walker's own words still find their Thread.
  await page.getByLabel("Search all Threads").fill("heron");
  await expect(results.getByRole("link", { name: /Heron/ })).toBeVisible();
});
