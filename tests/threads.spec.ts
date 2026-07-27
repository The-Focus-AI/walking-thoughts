import { expect, test, type Page } from "@playwright/test";
import {
  captureCount,
  commitCapture,
  newestThreadId,
  openCaptureShell,
} from "./helpers/capture-shell";

/** Fire a horizontal swipe gesture across the Thread detail pane. */
async function swipeDetailPane(page: Page, dx: number) {
  await page.evaluate((delta) => {
    const pane = document.querySelector(".desk-detail-pane");
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
  test("the trail surface counts the day instead of listing it", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await expect(page.getByTestId("capture-tally")).toHaveText(
      "No Captures today",
    );

    await commitCapture(page, "Same ridge, clearer view");

    // The day's state is a tally in the canonical status labels — the
    // Captures themselves live on Days.
    await expect(page.getByTestId("capture-tally")).toContainText(
      "1 Capture today",
    );
    await expect(page.getByTestId("capture-tally")).toContainText(
      /Saved locally|Syncing|Enriching|Complete/,
    );
    await expect(
      page.getByRole("article", { name: /Same ridge, clearer view/ }),
    ).toHaveCount(0);

    await commitCapture(page, "Correction: marker leans right");
    await expect(page.getByTestId("capture-tally")).toContainText(
      "2 Captures today",
    );

    // ADR 0011: consecutive Captures land in separate Threads.
    const threadIds = await page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            list(): Promise<Array<{ threadId: string | null }>>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      return (await store!.list()).map((capture) => capture.threadId);
    });
    expect(new Set(threadIds).size).toBe(2);

    await page.reload();
    await expect(page.getByTestId("capture-tally")).toContainText(
      "2 Captures today",
    );
  });

  test("Days lists one row per walk, and the day opens its Threads", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Overlook fungi");

    await page.goto("/days");
    await expect(
      page.getByRole("heading", { name: "Days", exact: true }),
    ).toBeVisible();

    const dayRow = page.locator(".desk-day-open").first();
    await expect(dayRow).toContainText("Today");
    await expect(dayRow).toContainText("1 Thread");
    await expect(dayRow).toContainText("1 waiting");

    await dayRow.click();
    await expect(page.getByTestId("daily-digest")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Overlook fungi/ }),
    ).toBeVisible();
    await expect(page.getByTestId("thread-sync-chip").first()).toBeVisible();
  });

  test("the day paints from local data while Enrichment fetches stall", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Cached ridge line");

    // Airplane-mode shape: per-Thread Enrichment reads never answer. The
    // day must still render from IndexedDB and the local Enrichment cache
    // instead of flashing the zero-Thread state.
    await page.route("**/api/enrichment/threads/**", () => {});

    await page.goto("/days");
    await page.locator(".desk-day-open").first().click();
    await expect(
      page.getByRole("link", { name: /Cached ridge line/ }),
    ).toBeVisible();
    await expect(page.getByText("No walks yet")).toBeHidden();
  });

  test("search reaches every Thread across days", async ({ page }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Beaver dam below the culvert");

    await page.goto("/days");
    await page.getByLabel("Search all Threads").fill("beaver");
    await expect(
      page.getByRole("link", { name: /Beaver dam below the culvert/ }),
    ).toBeVisible();

    await page.getByLabel("Search all Threads").fill("nothing here");
    await expect(page.getByText("No Threads match that search.")).toBeVisible();
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

    await page.goto("/days");
    await page.locator(".desk-day-open").first().click();
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
    await commitCapture(page, "Older Thread on the col");
    const olderId = await newestThreadId(page);
    await commitCapture(page, "Newer Thread at the outlet");
    expect(await captureCount(page)).toBe(2);
    const newerId = await newestThreadId(page);
    expect(newerId).not.toBe(olderId);

    await page.goto(`/threads/${newerId}`);
    await expect(page.getByTestId("thread-capture-hero")).toContainText(
      "Newer Thread at the outlet",
    );

    // Swipe left → the next (older) Thread.
    await swipeDetailPane(page, -160);
    await expect(page).toHaveURL(new RegExp(`/threads/${olderId}`));
    await expect(page.getByTestId("thread-capture-hero")).toContainText(
      "Older Thread on the col",
    );

    // Swipe right → back to the newer one.
    await swipeDetailPane(page, 160);
    await expect(page).toHaveURL(new RegExp(`/threads/${newerId}`));
  });

  test("/threads without an id sends the walker to Days", async ({ page }) => {
    await page.goto("/threads");
    await expect(page).toHaveURL(/\/days$/);
    await expect(
      page.getByRole("heading", { name: "Days", exact: true }),
    ).toBeVisible();
  });

  test("each day is its own row, and opening one shows only that day", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Today's ridge notes");

    // Import an older day's Thread the way sync hydration would.
    await page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            applyRemoteThreads(threads: Array<object>): Promise<unknown>;
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

    await page.goto("/days");
    await expect(page.locator(".desk-day")).toHaveCount(2);

    // Opening the older day shows its Thread and nothing from today.
    await page.locator(".desk-day-open").nth(1).click();
    await expect(
      page.getByRole("link", { name: /Older ridge notes/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Today's ridge notes/ }),
    ).toHaveCount(0);

    // Leaving the Thread lands back inside the day it belongs to — the
    // walker was reading that day, not the whole list.
    await page.getByRole("link", { name: /Older ridge notes/ }).click();
    await expect(page).toHaveURL(/\/threads\/older-day-thread/);
    const old = new Date();
    old.setDate(old.getDate() - 3);
    const oldDayKey = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, "0")}-${String(old.getDate()).padStart(2, "0")}`;
    await page.getByRole("link", { name: /^←/ }).click();
    await expect(page).toHaveURL(new RegExp(`/days/${oldDayKey}$`));
    await expect(
      page.getByRole("link", { name: /Older ridge notes/ }),
    ).toBeVisible();
  });

  test("each Thread row names the kind the Enrichment read it as", async ({
    page,
  }) => {
    await openCaptureShell(page);

    // Three Captures the walker would treat differently at the desk.
    for (const text of [
      "Call the doctor to schedule the blood work",
      "We should build a token pool backend",
      "Why is it dark at night when there are so many stars",
    ]) {
      await commitCapture(page, text);
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

    await page.goto("/days");
    await page.locator(".desk-day-open").first().click();

    // Every Thread carries its kind in the row, in the machine's voice.
    await expect(page.getByTestId("thread-kind-task")).toBeVisible();
    await expect(page.getByTestId("thread-kind-idea")).toBeVisible();
    await expect(page.getByTestId("thread-kind-question")).toBeVisible();
  });

  test("a Thread the model could not place asks for a word instead of guessing", async ({
    page,
  }) => {
    await openCaptureShell(page);
    await commitCapture(page, "Goldin scope");

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

    await page.goto("/days");
    // The day itself says a word is wanted, before anything is opened.
    await expect(page.locator(".desk-day-open").first()).toContainText(
      "1 needs a word",
    );

    await page.locator(".desk-day-open").first().click();
    await expect(page.getByTestId("thread-ask-chip")).toBeVisible();
    await expect(page.getByTestId("day-sheet-asks")).toContainText(
      "1 Thread needs a word from you",
    );

    await page.locator(".thread-row-main").first().click();
    const ask = page.getByTestId("thread-ask");
    await expect(ask).toContainText("Who is Goldin");

    // Answering is an ordinary reply in the Thread — no separate interview.
    await ask.getByRole("button", { name: "Answer in this Thread" }).click();
    await expect(page.locator("#thread-chat-followup")).toBeFocused();
  });
});
