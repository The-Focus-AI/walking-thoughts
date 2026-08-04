import { expect, test } from "@playwright/test";
import { railRow, seedPile } from "./helpers/desk-pile";

/**
 * With mentions in hand the desk stops saying "unfiled" about a Thread it
 * can perfectly well name: the Topics Lens stacks an unfiled Thread under
 * its leading mention, and the rail grows a Mentions group over whatever
 * the pile is actually talking about.
 */

test("the Mentions rail counts the nouns the pile keeps returning to", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open");
  // The Mentions rows do not exist until the Enrichments they are read from
  // have loaded, so wait for the queue itself before asking the rail.
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // Two of the three open Threads mention the reservoir; one names the
  // frost heave. The rail says so.
  await expect(railRow(page, "mention", "the-reservoir")).toContainText("2");
  await expect(railRow(page, "mention", "frost-heave")).toContainText("1");

  await railRow(page, "mention", "the-reservoir").click();
  // A rail row only changes the query, so the router still fetches — on a
  // machine running both browser projects at once that can outlast the
  // default deadline, and a lost second here is not a lost facet.
  await expect(page).toHaveURL(/mention=the-reservoir/, { timeout: 20_000 });
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(2);

  // Mentions combine with the other groups like any facet.
  await railRow(page, "kind", "question").click();
  await expect(page).toHaveURL(/kind=question/, { timeout: 20_000 });
  await expect(page).toHaveURL(/mention=the-reservoir/);
  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");

  // The selection round-trips like every other facet.
  await page.reload();
  await expect(railRow(page, "mention", "the-reservoir")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("the Topics Lens stacks an unfiled Thread under what it is about", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open&lens=topics");
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // No Projects on this pile, so before mentions every row landed under
  // "Unfiled". Now the two that name the reservoir stack under it.
  const reservoir = page
    .locator(".desk-stack")
    .filter({ hasText: "The reservoir" });
  await expect(reservoir.locator(".thread-row")).toHaveCount(2);

  // A Thread the Enrichment never named still has somewhere to go.
  await expect(
    page.locator(".desk-stack-title").filter({ hasText: "Unfiled" }),
  ).toHaveCount(1);
});

test("a Thread shows what was mentioned and what could be asked next", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto(`/threads/${ids.question}`);

  await expect(page.getByTestId("enrichment-mentions")).toContainText(
    "The reservoir",
  );
  await expect(page.getByTestId("enrichment-mentions")).toContainText("place");
  await expect(page.getByTestId("enrichment-questions")).toContainText(
    "How deep does the frost line run here?",
  );
});
