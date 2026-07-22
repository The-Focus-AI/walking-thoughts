import { expect, test, type Page } from "@playwright/test";

async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Shell ready")).toBeVisible();
  await expect(
    page.getByText("Each Capture starts its own Thread").first(),
  ).toBeVisible();
}

test.describe("trail Threads", () => {
  test("each Capture starts its own Thread and Today lists them", async ({
    page,
  }) => {
    await openCaptureShell(page);

    await page.getByLabel("Capture text").fill("Same ridge, clearer view");
    await page.getByRole("button", { name: "Capture" }).click();

    const today = page.getByRole("region", { name: "Today" });
    await expect(
      today.getByRole("article", { name: /Same ridge, clearer view/ }),
    ).toBeVisible();

    // Composer lives under the Today stream (its sticky dock may overlap
    // the tail of the stream, so compare bottom edges).
    const composer = today.getByLabel("New Capture");
    await expect(composer).toBeVisible();
    const streamBox = await today
      .getByRole("article", { name: /Same ridge, clearer view/ })
      .boundingBox();
    const composerBox = await composer.boundingBox();
    expect(streamBox && composerBox).toBeTruthy();
    expect(composerBox!.y + composerBox!.height).toBeGreaterThan(
      streamBox!.y + streamBox!.height,
    );

    await page.getByLabel("Capture text").fill("Correction: marker leans right");
    await page.getByRole("button", { name: "Capture" }).click();

    await expect(
      today.getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();

    // ADR 0011: consecutive Captures land in separate Threads.
    const firstLink = today
      .getByRole("article", { name: /Same ridge, clearer view/ })
      .getByRole("link", { name: /Thread/ });
    const secondLink = today
      .getByRole("article", { name: /Correction: marker leans right/ })
      .getByRole("link", { name: /Thread/ });
    const firstHref = await firstLink.getAttribute("href");
    const secondHref = await secondLink.getAttribute("href");
    expect(firstHref).toMatch(/^\/threads\//);
    expect(secondHref).toMatch(/^\/threads\//);
    expect(secondHref).not.toBe(firstHref);

    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Today" })
        .getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();
  });

  test("Threads archive groups by day with one row per Thread", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("Overlook fungi");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /Overlook fungi/ }),
    ).toBeVisible();

    await page.goto("/threads");
    await expect(
      page.getByRole("heading", { name: "Threads", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Overlook fungi/ }),
    ).toBeVisible();
    await expect(page.getByTestId("thread-sync-chip").first()).toBeVisible();
  });
});
