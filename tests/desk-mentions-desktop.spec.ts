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
  // The Mentions rows are read off the Enrichments, so wait for the queue
  // they come with before asking the rail anything.
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(3);

  // Two of the three open Threads mention the reservoir; one names the
  // frost heave. The rail says so.
  await expect(railRow(page, "mention", "the-reservoir")).toContainText("2");
  await expect(railRow(page, "mention", "frost-heave")).toContainText("1");

  // The row is a link into that working set. This is the one client
  // navigation the test makes — under two browser projects at once a
  // query-only route change can outlast the default deadline, and the rest
  // of the behaviour is provable without paying for it again.
  await railRow(page, "mention", "the-reservoir").click();
  await expect(page).toHaveURL(/mention=the-reservoir/, { timeout: 20_000 });
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(2);
});

test("a Mentions facet combines with the other groups and survives reload", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open&mention=the-reservoir&kind=question");

  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");
  await expect(railRow(page, "mention", "the-reservoir")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(railRow(page, "kind", "question")).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page.reload();
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
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
