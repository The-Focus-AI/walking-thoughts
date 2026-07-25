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

    // Composer sits in line under the Today stream.
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

  test("long attachment filenames never widen Thread surfaces", async ({
    page,
  }) => {
    await openCaptureShell(page);
    const longName =
      "PXL_20260725_121110998.PORTRAIT.ORIGINAL.EDITED.cornwall-bridge-market-loop-north-side.jpg";
    // Photo-only Capture: the filename becomes the Thread title too.
    const threadId = await page.evaluate(async (fileName) => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            commit(
              text: string,
              location: null,
              options: object,
            ): Promise<unknown>;
            listRecentThreads(): Promise<Array<{ id: string }>>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      await store!.commit("", null, {
        destination: { type: "new_thread" },
        attachments: [
          {
            kind: "image",
            mimeType: "image/jpeg",
            fileName,
            bytes: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
          },
        ],
      });
      const threads = await store!.listRecentThreads();
      return threads[0]!.id;
    }, longName);

    // No element may poke past the viewport — including inside internal
    // scroll containers like the Thread log, which document.scrollWidth
    // alone would miss.
    const expectNoSidewaysOverflow = async () => {
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        let widest = doc.scrollWidth;
        for (const el of document.querySelectorAll("*")) {
          widest = Math.max(widest, Math.ceil(el.getBoundingClientRect().right));
        }
        return widest - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
    };

    await page.reload();
    await expect(page.getByLabel("Capture text")).toBeVisible();
    await expectNoSidewaysOverflow();

    await page.goto("/threads");
    await expect(page.locator(".thread-row")).toHaveCount(1);
    await expectNoSidewaysOverflow();

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByTestId("thread-chat")).toBeVisible();
    await expectNoSidewaysOverflow();
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

  test("list state survives opening a Thread and coming back", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("State keeper today");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /State keeper today/ }),
    ).toBeVisible();

    // An older day so the strip has something non-default to remember.
    await page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            applyRemoteThreads(threads: Array<object>): Promise<unknown>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      const old = new Date();
      old.setDate(old.getDate() - 4);
      old.setHours(12, 0, 0, 0);
      await store!.applyRemoteThreads([
        {
          id: "state-keeper-old",
          title: "State keeper older",
          revision: 1,
          updatedAt: old.toISOString(),
          captures: [
            {
              id: "state-keeper-old-capture",
              text: "State keeper older",
              createdAt: old.toISOString(),
              location: null,
              sequence: 1,
              attachments: [],
            },
          ],
        },
      ]);
    });

    await page.goto("/threads");
    const chips = page.locator(".threads-day-chip");
    await expect(chips).toHaveCount(3);

    // Pick the older day, then walk into its Thread and back out.
    await chips.nth(1).click();
    const olderRow = page.getByRole("link", { name: /State keeper older/ });
    await expect(olderRow).toBeVisible();
    await olderRow.click();
    await expect(page).toHaveURL(/\/threads\/state-keeper-old/);
    await page.getByRole("link", { name: "← Threads" }).click();
    await expect(page).toHaveURL(/\/threads$/);

    // The day pick held: still the older day, not reset to Today.
    await expect(chips.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("link", { name: /State keeper older/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /State keeper today/ }),
    ).toBeHidden();
  });

  test("selecting a day opens the day chat pane", async ({ page }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("Stone wall on the ridge");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /Stone wall on the ridge/ }),
    ).toBeVisible();

    await page.goto("/threads");
    const dayButton = page
      .getByRole("button", { name: /Chat about this day/i })
      .first();
    await expect(dayButton).toBeVisible();
    await dayButton.click();
    await expect(page).toHaveURL(/\/threads\?day=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId("daily-digest")).toBeVisible();
    await expect(page.getByText("Day chat")).toBeVisible();
    await expect(page.getByTestId("digest-send")).toBeVisible();
  });

  test("day strip shows one day at a time; All days opens the archive", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("Chip strip today capture");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("article", { name: /Chip strip today capture/ }),
    ).toBeVisible();

    // Import an older day's Thread the way sync hydration would.
    await page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            applyRemoteThreads(
              threads: Array<object>,
            ): Promise<unknown>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      const old = new Date();
      old.setDate(old.getDate() - 3);
      old.setHours(12, 0, 0, 0);
      await store!.applyRemoteThreads([
        {
          id: "older-day-thread",
          title: "Older ridge notes",
          revision: 1,
          updatedAt: old.toISOString(),
          captures: [
            {
              id: "older-day-capture",
              text: "Older ridge notes",
              createdAt: old.toISOString(),
              location: null,
              sequence: 1,
              attachments: [],
            },
          ],
        },
      ]);
    });

    await page.goto("/threads");
    // Default: only the newest day's section renders.
    await expect(
      page.getByRole("link", { name: /Chip strip today capture/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Older ridge notes/ }),
    ).toBeHidden();

    // The older day is one chip away.
    await expect(page.getByTestId("day-chip-all")).toBeVisible();
    const chips = page.locator(".threads-day-chip");
    await expect(chips).toHaveCount(3); // today, older day, All days
    await chips.nth(1).click();
    await expect(
      page.getByRole("link", { name: /Older ridge notes/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Chip strip today capture/ }),
    ).toBeHidden();

    // All days shows the whole archive again.
    await page.getByTestId("day-chip-all").click();
    await expect(
      page.getByRole("link", { name: /Chip strip today capture/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Older ridge notes/ }),
    ).toBeVisible();
  });

  test("the kind strip filters the queue and each row names its kind", async ({
    page,
  }) => {
    await openCaptureShell(page);

    // Three Captures the walker would treat differently at the desk.
    for (const text of [
      "Call the doctor to schedule the blood work",
      "We should build a token pool backend",
      "Why is it dark at night when there are so many stars",
    ]) {
      await page.getByLabel("Capture text").fill(text);
      await page.getByRole("button", { name: "Capture" }).click();
      await expect(
        page.getByRole("article", { name: new RegExp(text.slice(0, 20)) }),
      ).toBeVisible();
    }

    // Enrichment classified them server-side; hydration brings the verdicts back.
    await page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            listRecentThreads(): Promise<
              Array<{ id: string; title: string; revision: number; updatedAt: string }>
            >;
            listThread(id: string): Promise<{
              captures: Array<{ id: string; text: string; createdAt: string; sequence: number }>;
            }>;
            applyRemoteThreads(threads: unknown[]): Promise<unknown>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      const threads = await store!.listRecentThreads();
      const kindFor = (title: string) =>
        title.startsWith("Call the doctor")
          ? "task"
          : title.startsWith("We should build")
            ? "idea"
            : "question";
      const remote = await Promise.all(
        threads.map(async (thread) => {
          const view = await store!.listThread(thread.id);
          return {
            id: thread.id,
            title: thread.title,
            revision: thread.revision,
            updatedAt: thread.updatedAt,
            kind: kindFor(thread.title),
            topics: ["morning-walk"],
            captures: view.captures.map((capture) => ({
              id: capture.id,
              text: capture.text,
              createdAt: capture.createdAt,
              location: null,
              sequence: capture.sequence,
              attachments: [],
            })),
          };
        }),
      );
      await store!.applyRemoteThreads(remote);
    });

    await page.goto("/threads");
    await page.getByTestId("day-chip-all").click();

    // Every Thread carries its kind in the row, in the machine's voice.
    await expect(page.getByTestId("thread-kind-task")).toBeVisible();
    await expect(page.getByTestId("thread-kind-idea")).toBeVisible();
    await expect(page.getByTestId("thread-kind-question")).toBeVisible();

    // To do comes first at the desk, and counts what it filters.
    const chips = page.locator(".threads-kind-chip");
    await expect(chips.nth(1)).toContainText("To do");
    await expect(chips.nth(1)).toContainText("1");

    await page.getByTestId("kind-chip-task").click();
    await expect(page.getByRole("link", { name: /Call the doctor/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /We should build a token pool/ }),
    ).toHaveCount(0);

    // Tapping the active kind clears it; every Thread returns.
    await page.getByTestId("kind-chip-task").click();
    await expect(
      page.getByRole("link", { name: /We should build a token pool/ }),
    ).toBeVisible();
  });

  test("a Thread the model could not place asks for a word instead of guessing", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await page.getByLabel("Capture text").fill("Goldin scope");
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(page.getByRole("article", { name: /Goldin scope/ })).toBeVisible();

    // The Enrichment met a name it could not place and asked rather than
    // researching a public subject that merely sounds similar.
    await page.evaluate(async () => {
      type SeedStore = {
        listRecentThreads(): Promise<
          Array<{ id: string; title: string; revision: number; updatedAt: string }>
        >;
        listThread(id: string): Promise<{
          captures: Array<{
            id: string;
            text: string;
            createdAt: string;
            sequence: number;
          }>;
        }>;
        applyRemoteThreads(threads: unknown[]): Promise<unknown>;
      };
      const store = (
        globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: SeedStore }
      ).__WT_CAPTURE_STORE__!;
      const threads = await store.listRecentThreads();
      const thread = threads[0]!;
      const view = await store.listThread(thread.id);
      await store.applyRemoteThreads([
        {
          id: thread.id,
          title: thread.title,
          revision: thread.revision,
          updatedAt: thread.updatedAt,
          kind: null,
          topics: [],
          ask: "Who is Goldin — a client, a project, or a person?",
          captures: view.captures.map((capture) => ({
            id: capture.id,
            text: capture.text,
            createdAt: capture.createdAt,
            location: null,
            sequence: capture.sequence,
            attachments: [],
          })),
        },
      ]);
    });

    await page.goto("/threads");
    await expect(page.getByTestId("thread-ask-chip")).toBeVisible();
    await expect(page.getByTestId("kind-chip-ask")).toContainText("1");

    await page.getByRole("link", { name: /Goldin scope/ }).click();
    const ask = page.getByTestId("thread-ask");
    await expect(ask).toContainText("Who is Goldin");

    // Answering is an ordinary reply in the Thread — no separate interview.
    await ask.getByRole("button", { name: "Answer in this Thread" }).click();
    await expect(page.locator("#thread-chat-followup")).toBeFocused();
  });
});
