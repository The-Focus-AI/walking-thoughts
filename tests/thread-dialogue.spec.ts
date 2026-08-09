import { expect, test } from "@playwright/test";
import { seedPile, stubFilingTransport } from "./helpers/desk-pile";

/**
 * The Thread page reads as the conversation it already is: the walker on
 * the trail, the report that answered, the walker at the desk, the desk
 * answering back. Filing happens in the header, so settling a Thread never
 * means leaving the conversation.
 */

test("the Thread reads as a transcript, and files from its own header", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await stubFilingTransport(page);
  await page.goto(`/threads/${ids.question}`);

  // The walker's words, in the voice they were said in.
  await expect(page.getByTestId("role-trail").first()).toContainText(
    "You, on the trail",
  );
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Why does the reservoir wall bulge",
  );

  // The report that answered, named as the Enrichment turn.
  await expect(page.getByTestId("enrichment-report")).toContainText(
    "Frost heave",
  );

  // Filing without leaving: Keep research settles the Thread and says so.
  await page.getByTestId("thread-keep-research").click();
  await expect(page.getByTestId("thread-keep-research")).toContainText(
    "Research kept",
  );
  await expect(page.getByTestId("thread-reviewed-toggle")).toContainText(
    "Reviewed",
  );
});
