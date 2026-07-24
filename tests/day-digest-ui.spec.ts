import { expect, test } from "@playwright/test";

/**
 * Public seam: asking a day digest must POST /api/digest even when
 * Enrichment network fetches never resolve (cache/local Captures only).
 */
test("day digest Ask reaches /api/digest without waiting on hung Enrichments", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await page.getByLabel("Capture text").fill("Ridge wall question for digest");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(
    page.getByRole("article", { name: /Ridge wall question for digest/ }),
  ).toBeVisible();

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

  await page.goto("/threads");
  await expect(page.getByRole("link", { name: /Ridge wall/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Digest this day/i }).first().click();
  await expect(page.getByTestId("daily-digest")).toBeVisible();

  await page
    .getByRole("button", { name: "Create a task checklist of the day" })
    .click();

  await expect.poll(() => digestPosted, { timeout: 8_000 }).toBe(true);
  await expect(page.getByTestId("digest-result")).toContainText(
    "Check the ridge wall",
    { timeout: 8_000 },
  );
});
