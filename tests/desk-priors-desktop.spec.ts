import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * The walk has been here before, and the row says so before it is opened.
 * Shared mentions are exact and already on the device, so the chip needs no
 * request — which is also why it survives being offline.
 */

test("a row that shares a mention with an earlier Thread says how many", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto("/days?state=open");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // The photo Thread came after the wall Thread and names the same place,
  // so the later one carries the chip and the earlier one does not.
  await expect(page.getByTestId(`thread-prior-${ids.grate}`)).toContainText(
    "1 prior",
  );
  await expect(page.getByTestId(`thread-prior-${ids.question}`)).toHaveCount(0);

  // Opened, it names the Thread and what the two have in common.
  await page.getByTestId(`expand-thread-${ids.grate}`).click();
  const priors = page.getByTestId("thread-priors");
  await expect(priors).toContainText("reservoir wall");
  await expect(priors).toContainText("The reservoir");
});

test("a Thread with nothing behind it says so rather than showing an error", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto("/days?state=open");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // The Goldin Thread mentions nothing, so nothing came before it.
  await page.getByTestId(`expand-thread-${ids.goldin}`).click();
  await expect(page.getByTestId("thread-priors-none")).toContainText(
    "First time this has come up",
  );
});
