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

test("a suggested question is asked with one tap, as an ordinary Capture", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.goto(`/threads/${ids.question}`);

  const chips = page.getByTestId("thread-suggested");
  await expect(chips).toContainText("How deep does the frost line run here?");

  await chips
    .getByRole("button", { name: /How deep does the frost line run/ })
    .click();

  // It committed as a Capture into this Thread, exactly as typing it would.
  await expect
    .poll(async () =>
      page.evaluate(async (threadId) => {
        const store = (
          globalThis as typeof globalThis & {
            __WT_CAPTURE_STORE__?: {
              listThread(id: string): Promise<{
                captures: Array<{ text: string }>;
              }>;
            };
          }
        ).__WT_CAPTURE_STORE__!;
        const view = await store.listThread(threadId);
        return view.captures.map((capture) => capture.text);
      }, ids.question),
    )
    .toContain("How deep does the frost line run here?");

  // And it reads as the walker speaking from the desk this time.
  await expect(page.getByTestId("role-desk-you").first()).toContainText(
    "You, at the desk",
  );
});
