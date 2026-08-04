import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * The desk searches what the device holds. A report the phone never opened
 * is not in that, so the same query used to answer differently on two
 * devices of one walker — and on a fresh phone, often not at all. The server
 * holds the whole corpus and is asked too.
 */

test("a Thread only the server knows about still turns up in search", async ({
  page,
}) => {
  await seedPile(page);

  // The corpus holds a Thread this device has never seen.
  await page.route("**/api/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            threadId: "thread-elsewhere",
            title: "Remotion renders video from React",
            snippet: "…a programmatic edit is a code change…",
          },
        ],
      }),
    }),
  );

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toBeVisible();
  await page.getByLabel("Search all Threads").fill("remotion");

  const elsewhere = page.getByTestId("search-elsewhere");
  await expect(elsewhere).toContainText("Remotion renders video from React");
  await expect(elsewhere).toContainText("a programmatic edit is a code change");
  await expect(
    elsewhere.getByRole("link", { name: /Remotion/ }),
  ).toHaveAttribute("href", "/threads/thread-elsewhere");
});

test("the server never repeats what the device already found", async ({
  page,
}) => {
  const ids = await seedPile(page);

  await page.route("**/api/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            threadId: ids.heron,
            title: "Heron on the far bank at dusk",
            snippet: "Heron on the far bank",
          },
        ],
      }),
    }),
  );

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toBeVisible();
  await page.getByLabel("Search all Threads").fill("heron");

  // The device found it, so it is one row, not two.
  await expect(
    page.getByRole("list", { name: "Search results" }).getByRole("link", {
      name: /Heron/,
    }),
  ).toHaveCount(1);
  await expect(page.getByTestId("search-elsewhere")).toHaveCount(0);
});

test("a corpus that cannot be reached leaves the device's own search alone", async ({
  page,
}) => {
  await seedPile(page);
  await page.route("**/api/search**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toBeVisible();
  await page.getByLabel("Search all Threads").fill("heron");

  await expect(
    page.getByRole("list", { name: "Search results" }).getByRole("link", {
      name: /Heron/,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("search-elsewhere")).toHaveCount(0);
});
