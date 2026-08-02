import { expect, test, type Page } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./helpers/capture-shell";

/**
 * The desk's facet rail and Lens control. Everything here is built on what
 * the app already holds locally — kind, reviewed, media, reports — so the
 * seam is the browser: seed a pile, narrow it, re-stack it, file from a row.
 */

type SeededThread = { id: string; title: string };

type SeedStore = {
  listRecentThreads(): Promise<SeededThread[]>;
  applyThreadFiling(filing: {
    threadId: string;
    reviewedAt: string | null;
    kind?: string | null;
    researchVerdict?: "kept" | "dismissed" | null;
  }): Promise<void>;
  commit(
    text: string,
    location: null,
    options: Record<string, unknown>,
  ): Promise<unknown>;
};

async function threadIdByTitle(page: Page, needle: string): Promise<string> {
  const read = () =>
    page.evaluate(async (fragment) => {
      const store = (
        globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: SeedStore }
      ).__WT_CAPTURE_STORE__;
      const threads = (await store?.listRecentThreads()) ?? [];
      return threads.find((entry) => entry.title.includes(fragment))?.id ?? null;
    }, needle);
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}

/**
 * Four Threads with different shapes: an open question with a published
 * report, a task that carries a photo, a filed observation whose research
 * the walker kept, and a note that asked the walker something.
 */
async function seedPile(page: Page): Promise<Record<string, string>> {
  await openCaptureShell(page);
  await commitCapture(page, "Why does the reservoir wall bulge outward?");
  await commitCapture(page, "Heron on the far bank at dusk");
  await commitCapture(page, "Ask about the Goldin scope");

  await page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: SeedStore }
    ).__WT_CAPTURE_STORE__!;
    await store.commit("Photo of the culvert grate", null, {
      destination: { type: "new_thread" },
      attachments: [
        {
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "grate.jpg",
          bytes: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
        },
      ],
    });
  });

  const ids = {
    question: await threadIdByTitle(page, "reservoir wall"),
    heron: await threadIdByTitle(page, "Heron"),
    goldin: await threadIdByTitle(page, "Goldin"),
    grate: await threadIdByTitle(page, "culvert grate"),
  };

  // The kinds and verdicts the Enrichment and the walker would have settled.
  await page.evaluate(async (seeded) => {
    const store = (
      globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: SeedStore }
    ).__WT_CAPTURE_STORE__!;
    await store.applyThreadFiling({
      threadId: seeded.question,
      reviewedAt: null,
      kind: "question",
    });
    await store.applyThreadFiling({
      threadId: seeded.heron,
      reviewedAt: "2026-08-01T20:00:00.000Z",
      kind: "observation",
      researchVerdict: "kept",
    });
    await store.applyThreadFiling({
      threadId: seeded.goldin,
      reviewedAt: null,
      kind: "task",
    });
    await store.applyThreadFiling({
      threadId: seeded.grate,
      reviewedAt: null,
      kind: "media",
    });

    // What the Enrichment wrote for the question, retained locally so the
    // row can show it without the network.
    localStorage.setItem(
      `wt-thread-enrichments:${seeded.question}`,
      JSON.stringify([
        {
          id: "enrichment:job-wall",
          threadId: seeded.question,
          text: "Frost heave behind the wall pushes the courses outward.",
          model: "anthropic/claude-sonnet-5",
          basisRevision: 1,
          basisEntryIds: [],
          targetCaptureIds: [],
          createdAt: "2026-08-01T19:00:00.000Z",
          sources: [],
        },
      ]),
    );
  }, ids);

  // Neither hydration nor the per-Thread Enrichment fetch may overwrite the
  // seeded pile mid-test.
  await page.route("**/api/sync/threads", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/api/enrichment/threads/**", () => {});
  await page.route("**/api/artifacts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        artifacts: [
          {
            id: "artifact:enrichment:job-wall",
            threadId: ids.question,
            enrichmentId: "enrichment:job-wall",
            title: "Why the reservoir wall bulges",
            standfirst: "Frost, not the water.",
            kind: "question",
            model: "anthropic/claude-sonnet-5",
            createdAt: "2026-08-01T19:30:00.000Z",
          },
        ],
      }),
    }),
  );

  return ids;
}

function railRow(page: Page, group: string, value: string) {
  return page.getByTestId(`facet-${group}-${value}`);
}

test("a Kind facet narrows the desk, the rail counts it, and the URL keeps it", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  const rail = page.getByTestId("desk-rail");
  await expect(rail).toBeVisible();
  await expect(railRow(page, "kind", "question")).toContainText("1");
  await expect(railRow(page, "kind", "task")).toContainText("1");

  await railRow(page, "kind", "question").click();
  await expect(page).toHaveURL(/kind=question/);

  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");
  // The rail says exactly what is on screen.
  await expect(railRow(page, "kind", "question")).toContainText("1");

  // The selection is the URL's, so a reload lands on the same working set.
  await page.reload();
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
  await expect(railRow(page, "kind", "question")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("groups combine, other groups recompute, and an empty row disables", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  // Three of the four are open; the heron is filed and its research kept.
  await expect(railRow(page, "state", "open")).toContainText("3");
  await expect(railRow(page, "state", "kept")).toContainText("1");

  await railRow(page, "state", "open").click();
  await expect(page).toHaveURL(/state=open/);
  // Kind counts now see only what is open — the heron's Kind falls to zero.
  await expect(railRow(page, "kind", "observation")).toContainText("0");
  await expect(railRow(page, "kind", "observation")).toBeDisabled();

  await railRow(page, "kind", "question").click();
  await expect(page).toHaveURL(/state=open/);
  await expect(page).toHaveURL(/kind=question/);
  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("reservoir wall");

  // Nothing open with a question has a photo, and the rail still says so.
  await expect(railRow(page, "media", "photos")).toContainText("0");
  await expect(railRow(page, "media", "photos")).toBeDisabled();
});

test("the Lens re-stacks the same Threads without changing which they are", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?state=open");

  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(3);
  // Days is the default: one stack, headed by the day.
  await expect(page.locator(".desk-stack")).toHaveCount(1);

  await page.getByTestId("lens-kind").click();
  await expect(page).toHaveURL(/lens=kind/);
  // Same three Threads, now stacked by what they are.
  await expect(rows).toHaveCount(3);
  await expect(page.locator(".desk-stack")).toHaveCount(3);
  await expect(page.locator(".desk-stack-title").first()).toContainText(
    "To do",
  );
  // The facet is still doing the filtering; the Lens only re-stacks.
  await expect(railRow(page, "state", "open")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("a row opens in place: the words, the Enrichment, the media, the filing", async ({
  page,
}) => {
  const ids = await seedPile(page);
  await page.addInitScript(() => {
    (
      globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }
    ).__WT_REVIEW_TRANSPORT__ = {
      async listProjects() {
        return [];
      },
      async fileThread(
        threadId: string,
        filing: { researchVerdict?: string | null },
      ) {
        return {
          threadId,
          reviewedAt: new Date().toISOString(),
          kind: null,
          projectId: null,
          projectName: null,
          researchVerdict: filing.researchVerdict ?? null,
        };
      },
    };
  });
  await page.goto("/days?state=open");

  await expect(railRow(page, "state", "open")).toContainText("3");

  await page.getByTestId(`expand-thread-${ids.question}`).click();
  const detail = page.getByTestId(`thread-detail-${ids.question}`);
  await expect(detail).toContainText("Why does the reservoir wall bulge");
  await expect(detail.getByTestId("thread-detail-enrichment")).toContainText(
    "Frost heave",
  );
  await expect(detail.getByTestId("thread-filing")).toBeVisible();

  // The photo Thread carries its media into the open row.
  await page.getByTestId(`expand-thread-${ids.grate}`).click();
  await expect(
    page
      .getByTestId(`thread-detail-${ids.grate}`)
      .locator(".thread-row-thumbs"),
  ).toBeVisible();

  // Filing from the row settles the Thread, and the rail counts it out of
  // Open and into Research kept without leaving the queue.
  await detail.getByTestId("file-keep-research").click();
  await expect(railRow(page, "state", "open")).toContainText("2");
  await expect(railRow(page, "state", "kept")).toContainText("2");
});

test("a link written before the rail existed lands on the same working set", async ({
  page,
}) => {
  await seedPile(page);

  // The Enrichment asked the walker something on one Thread only.
  await page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listRecentThreads(): Promise<SeededThread[]>;
        };
      }
    ).__WT_CAPTURE_STORE__!;
    await store.listRecentThreads();
  });

  await page.goto("/days?f=media");
  // The old "Has media" chip is the union of the media rows; the pile it
  // opens is the same one it always was.
  const rows = page.locator(".desk-stack .thread-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("culvert grate");

  await page.goto("/days?f=reports");
  await expect(railRow(page, "reports", "full")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".desk-stack .thread-row")).toHaveCount(1);
  await expect(page.locator(".desk-stack .thread-row").first()).toContainText(
    "reservoir wall",
  );
});
