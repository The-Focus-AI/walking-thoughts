import { expect, test, type Page } from "@playwright/test";

async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Shell ready")).toBeVisible();
  await expect(
    page.getByText("Each Capture starts its own Thread").first(),
  ).toBeVisible();
}

/** Fire a horizontal swipe gesture across the Thread detail pane. */
async function swipeDetailPane(page: Page, dx: number) {
  await page.evaluate((delta) => {
    const pane = document.querySelector(".threads-detail-pane");
    if (!pane) throw new Error("Thread detail pane is missing");
    const makeTouch = (x: number, y: number) =>
      new Touch({ identifier: 1, target: pane, clientX: x, clientY: y });
    const start = makeTouch(200, 400);
    pane.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [start],
        changedTouches: [start],
      }),
    );
    const end = makeTouch(200 + delta, 400);
    pane.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [end],
      }),
    );
  }, dx);
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

  test("Threads list paints from local data while Enrichment fetches stall", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("Cached ridge line");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /Cached ridge line/ }),
    ).toBeVisible();

    // Airplane-mode shape: per-Thread Enrichment reads never answer. The
    // list must still render from IndexedDB and the local Enrichment cache
    // instead of flashing the zero-Thread state.
    await page.route("**/api/enrichment/threads/**", () => {});

    await page.goto("/threads");
    await expect(
      page.getByRole("link", { name: /Cached ridge line/ }),
    ).toBeVisible();
    await expect(page.getByText("No Threads yet")).toBeHidden();
  });

  test("horizontal swipes step forward and back through Threads", async ({
    page,
  }) => {
    await openCaptureShell(page);
    for (const text of ["Swipe stop one", "Swipe stop two"]) {
      await page.getByLabel("Capture text").fill(text);
      await page.getByRole("button", { name: "Capture" }).click();
      await expect(
        page.getByRole("article", { name: new RegExp(text) }),
      ).toBeVisible();
    }

    await page.goto("/threads");
    await expect(page.locator(".thread-row")).toHaveCount(2);
    const hrefs = await page
      .locator(".thread-row-main")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const [firstId, secondId] = hrefs.map((href) => href!.split("/").pop()!);
    const rowTitles = await page.locator(".thread-row-title").allTextContents();

    await page.goto(`/threads/${firstId}`);
    await expect(page.getByTestId("thread-chat")).toBeVisible();
    // The (hidden) day list must be loaded before swiping has an order.
    await expect(page.locator(".thread-row")).toHaveCount(2);

    // Swipe left → forward to the next Thread in the day list.
    await swipeDetailPane(page, -160);
    await expect(page).toHaveURL(new RegExp(secondId));
    await expect(page.getByTestId("thread-capture-hero")).toContainText(
      rowTitles[1],
    );

    // Swipe right → back to the previous Thread.
    await expect(page.locator(".thread-row")).toHaveCount(2);
    await swipeDetailPane(page, 160);
    await expect(page).toHaveURL(new RegExp(firstId));

    // A mostly vertical drag is a scroll, never navigation.
    await page.evaluate(() => {
      const pane = document.querySelector(".threads-detail-pane")!;
      const makeTouch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: pane, clientX: x, clientY: y });
      pane.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [makeTouch(200, 200)],
          changedTouches: [makeTouch(200, 200)],
        }),
      );
      pane.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [makeTouch(120, 500)],
        }),
      );
    });
    await expect(page).toHaveURL(new RegExp(firstId));
  });
});
