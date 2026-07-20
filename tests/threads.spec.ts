import { expect, test, type Page } from "@playwright/test";

async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Shell ready")).toBeVisible();
  await expect(
    page.getByText("First Capture starts today's Thread"),
  ).toBeVisible();
}

test.describe("trail Threads", () => {
  test("starts a Thread, sticks appends, shows composer under the stream, and keeps the day sticky", async ({
    page,
  }) => {
    await openCaptureShell(page);

    await page.getByLabel("Capture text").fill("Same ridge, clearer view");
    await page.getByRole("button", { name: "Capture" }).click();

    const thread = page.getByRole("region", { name: /Same ridge, clearer view/ });
    await expect(
      thread.getByRole("article", { name: /Same ridge, clearer view/ }),
    ).toBeVisible();
    await expect(thread.getByText("You").first()).toBeVisible();
    await expect(
      page.getByText(/Adding to .Same ridge, clearer view./),
    ).toBeVisible();

    // Composer lives under the active Thread stream (its sticky dock may
    // overlap the tail of the stream, so compare bottom edges).
    const composer = thread.getByLabel("New Capture");
    await expect(composer).toBeVisible();
    const streamBox = await thread
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
      thread.getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByText(/Adding to .Same ridge, clearer view./),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: /Same ridge, clearer view/ })
        .getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();
  });

  test("Threads archive groups by day and can continue on trail", async ({
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

    await page.getByRole("button", { name: "Continue on trail" }).click();
    // / requires Clerk; the sticky day session is shared via localStorage.
    await page.goto("/offline");
    await expect(page.getByText(/Adding to .Overlook fungi./)).toBeVisible();
  });
});
