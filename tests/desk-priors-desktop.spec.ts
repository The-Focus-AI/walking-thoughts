import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * The walk has been here before, and the row says so before it is opened.
 *
 * The exact half of this — a shared mention, on the device already and so
 * readable offline — went with Mentions in ADR 0019. What remains is the
 * embedding link, which is resolved on the server and therefore absent from
 * a seeded local pile. So what a fixture can still hold the line on is the
 * empty case: a Thread with nothing behind it must say so rather than break.
 */

test("a Thread with nothing behind it says so rather than showing an error", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto("/days?state=open");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  await page.getByTestId(`expand-thread-${ids.goldin}`).click();
  await expect(page.getByTestId("thread-priors-none")).toContainText(
    "First time this has come up",
  );
});
