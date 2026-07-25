import { expect, test } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./helpers/capture-shell";

/**
 * Public seam: asking a day digest must POST /api/digest even when
 * Enrichment network fetches never resolve (cache/local Captures only).
 */
test("day digest Ask reaches /api/digest without waiting on hung Enrichments", async ({
  page,
}) => {
  await openCaptureShell(page);
  await commitCapture(page, "Ridge wall question for digest");

  let digestPosted = false;
  await page.route("**/api/digest", async (route) => {
    digestPosted = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: "## Checklist\n- [ ] Check the ridge wall",
        model: "test-model",
      }),
    });
  });

  // Hang Enrichment reads after the Capture exists — Ask must not wait on them.
  await page.route("**/api/enrichment/threads/**", () => {});

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await expect(page.getByTestId("daily-digest")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ridge wall/ })).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByRole("button", { name: "Create a task checklist of the day" })
    .click();

  await expect.poll(() => digestPosted, { timeout: 8_000 }).toBe(true);
  await expect(page.getByTestId("digest-result")).toContainText(
    "Check the ridge wall",
    { timeout: 8_000 },
  );
});

/**
 * Public seam: the day chat is an ongoing conversation — each ask carries
 * the turns so far, and the transcript survives a reload.
 */
test("day chat keeps history across asks and reloads", async ({ page }) => {
  await openCaptureShell(page);
  await commitCapture(page, "Mossy ledge by the spring");

  const histories: unknown[][] = [];
  await page.route("**/api/digest", async (route) => {
    const body = route.request().postDataJSON() as { history?: unknown[] };
    histories.push(body.history ?? []);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: `Reply ${histories.length}`,
        model: "test-model",
      }),
    });
  });

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await expect(page.getByTestId("daily-digest")).toBeVisible();

  // First ask starts the conversation.
  await page.getByLabel("Ask about this day").fill("What did I notice?");
  await page.getByTestId("digest-send").click();
  await expect(page.getByTestId("digest-result")).toContainText("Reply 1");
  expect(histories[0]).toEqual([]);

  // Second ask carries the first exchange.
  await page.getByLabel("Ask about this day").fill("Turn that into tasks");
  await page.getByTestId("digest-send").click();
  await expect(page.getByTestId("digest-result").nth(1)).toContainText(
    "Reply 2",
  );
  expect(histories[1]).toEqual([
    { role: "walker", text: "What did I notice?" },
    { role: "digest", text: "Reply 1" },
  ]);

  // The transcript is retained on this phone.
  await page.reload();
  await expect(page.getByTestId("daily-digest")).toBeVisible();
  await expect(page.getByTestId("digest-walker").nth(1)).toContainText(
    "Turn that into tasks",
  );
  await expect(page.getByTestId("digest-result").nth(1)).toContainText(
    "Reply 2",
  );

  // Clear chat empties the retained transcript.
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.getByTestId("digest-result")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("daily-digest")).toBeVisible();
  await expect(page.getByTestId("digest-result")).toHaveCount(0);
});
