import { expect, test, type Page } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./helpers/capture-shell";
import { threadIdByTitle } from "./helpers/desk-pile";

/**
 * The default door: the Day flow (docs/desk.md, issue #159). A Day with
 * unrouted Threads opens on the arrival summary; the deck settles them one
 * at a time — route + Reviewed in one write, no commit gate — and the
 * receipts screen offers per-line undo.
 */

/**
 * The filing endpoints, standing in for the server. Every call is recorded
 * on the page so a test can argue about how many writes a gesture made and
 * what each one carried.
 */
async function stubRoutingTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: Array<{ threadId: string; filing: Record<string, unknown> }> =
      [];
    (
      globalThis as typeof globalThis & { __WT_FILINGS__?: unknown }
    ).__WT_FILINGS__ = calls;
    (
      globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }
    ).__WT_REVIEW_TRANSPORT__ = {
      async listProjects() {
        return [];
      },
      async setReviewed(threadId: string, reviewed: boolean) {
        return {
          threadId,
          reviewedAt: reviewed ? new Date().toISOString() : null,
        };
      },
      async fileThread(
        threadId: string,
        filing: {
          reviewed?: boolean;
          kind?: string | null;
          researchVerdict?: string | null;
          route?: string | null;
        },
      ) {
        calls.push({ threadId, filing: { ...filing } });
        const reviewed = filing.reviewed !== false;
        // The server implies the verdict from the Route (ADR 0017).
        const implied =
          filing.route === "journal"
            ? "kept"
            : filing.route === "drop"
              ? "dismissed"
              : null;
        return {
          threadId,
          reviewedAt: reviewed ? new Date().toISOString() : null,
          kind: filing.kind ?? null,
          projectId: null,
          projectName: null,
          researchVerdict:
            filing.researchVerdict === undefined
              ? implied
              : filing.researchVerdict,
          route: filing.route ?? null,
        };
      },
    };
  });
}

/** Keep the seeded pile local: hydration must not rewrite it mid-test. */
async function isolateFromServer(page: Page): Promise<void> {
  await page.route("**/api/sync/threads", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/api/enrichment/threads/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enrichments: [] }),
    }),
  );
}

/** What the walker's device says about a Thread's filing, right now. */
async function readFiling(
  page: Page,
  threadId: string,
): Promise<{ reviewed: boolean; route: string | null }> {
  return page.evaluate(async (id) => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listRecentThreads(): Promise<
            Array<{
              id: string;
              reviewedAt?: string | null;
              route?: string | null;
            }>
          >;
        };
      }
    ).__WT_CAPTURE_STORE__!;
    const thread = (await store.listRecentThreads()).find(
      (entry) => entry.id === id,
    );
    return {
      reviewed: Boolean(thread?.reviewedAt),
      route: thread?.route ?? null,
    };
  }, threadId);
}

/** The Enrichment's guess about what a Thread is, seeded onto the row. */
async function setKind(
  page: Page,
  threadId: string,
  kind: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, value }) => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            applyThreadFiling(filing: {
              threadId: string;
              reviewedAt: string | null;
              kind?: string | null;
            }): Promise<void>;
          };
        }
      ).__WT_CAPTURE_STORE__!;
      await store.applyThreadFiling({
        threadId: id,
        reviewedAt: null,
        kind: value,
      });
    },
    { id: threadId, value: kind },
  );
}

test("a Day with unrouted Threads opens on the arrival summary and Enter settles the guesses", async ({
  page,
}) => {
  await stubRoutingTransport(page);
  await openCaptureShell(page);
  await commitCapture(page, "Call the yard about the culvert grate");
  await commitCapture(page, "Why does the reservoir wall bulge outward?");
  const task = await threadIdByTitle(page, "culvert grate");
  const question = await threadIdByTitle(page, "reservoir wall");
  await setKind(page, task, "task");
  await setKind(page, question, "question");
  await isolateFromServer(page);

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();

  // The arrival summary: the day's proposals grouped by Route.
  await expect(page.getByTestId("day-flow-arrival")).toBeVisible();
  await expect(page.getByTestId("day-flow-count")).toContainText("2 to route");
  await expect(page.getByTestId("day-flow-lane-todo")).toContainText(
    "culvert grate",
  );
  await expect(page.getByTestId("day-flow-lane-journal")).toContainText(
    "reservoir wall",
  );

  // Start routing deals the first card.
  await page.getByTestId("day-flow-start").click();
  await expect(page.getByTestId("day-flow-card")).toBeVisible();
  await expect(page.getByTestId("day-flow-position")).toContainText(
    "Thread 1 of 2",
  );

  // Enter settles the proposed Route and advances; the running count drops.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("day-flow-count")).toContainText("1 to route");
  await expect(page.getByTestId("day-flow-position")).toContainText(
    "Thread 2 of 2",
  );
  await page.keyboard.press("Enter");

  // Receipts: every Thread under its route, and each filing is settled —
  // the proposed Route plus Reviewed, in one write per Thread.
  await expect(page.getByTestId("day-flow-receipts")).toBeVisible();
  await expect(page.getByTestId("day-flow-receipt-todo")).toContainText(
    "culvert grate",
  );
  await expect(page.getByTestId("day-flow-receipt-journal")).toContainText(
    "reservoir wall",
  );
  expect(await readFiling(page, task)).toEqual({
    reviewed: true,
    route: "todo",
  });
  expect(await readFiling(page, question)).toEqual({
    reviewed: true,
    route: "journal",
  });

  // Nothing left to route: the Day reads as filed.
  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );
});

test("redirecting with one key files route + Reviewed in one write, and reload shows it settled", async ({
  page,
}) => {
  await stubRoutingTransport(page);
  await openCaptureShell(page);
  await commitCapture(page, "Why does the reservoir wall bulge outward?");
  const question = await threadIdByTitle(page, "reservoir wall");
  await setKind(page, question, "question");
  await isolateFromServer(page);

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.getByTestId("day-flow-start").click();
  await expect(page.getByTestId("day-flow-card")).toBeVisible();

  // One key redirects: `t` files it To-do, not the proposed Journal.
  await page.keyboard.press("t");
  await expect(page.getByTestId("day-flow-receipts")).toBeVisible();
  await expect(page.getByTestId("day-flow-receipt-todo")).toContainText(
    "reservoir wall",
  );

  // One write carried the Route and Reviewed together.
  const calls = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __WT_FILINGS__?: Array<{
            threadId: string;
            filing: Record<string, unknown>;
          }>;
        }
      ).__WT_FILINGS__ ?? [],
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].threadId).toBe(question);
  expect(calls[0].filing.route).toBe("todo");
  expect(calls[0].filing.reviewed).toBe(true);

  // Reload: the filing stuck, and the flow has nothing left to deal.
  await page.reload();
  await expect(page.getByTestId("daily-digest")).toBeVisible();
  await expect(page.getByTestId("day-flow")).toHaveCount(0);
  expect(await readFiling(page, question)).toEqual({
    reviewed: true,
    route: "todo",
  });
});

test("the full report is readable on the card without leaving the deck", async ({
  page,
}) => {
  await stubRoutingTransport(page);
  await openCaptureShell(page);
  await commitCapture(page, "Why does the reservoir wall bulge outward?");
  const question = await threadIdByTitle(page, "reservoir wall");
  await setKind(page, question, "question");

  const enrichment = {
    id: "enrichment:job-wall",
    threadId: question,
    text: "Frost heave behind the wall pushes the courses outward.\n\nThe fix is drainage, not mortar.",
    model: "anthropic/claude-sonnet-5",
    basisRevision: 1,
    basisEntryIds: [],
    targetCaptureIds: [],
    createdAt: "2026-08-01T19:00:00.000Z",
    sources: [],
  };
  await page.evaluate(
    ({ id, entry }) => {
      localStorage.setItem(
        `wt-thread-enrichments:${id}`,
        JSON.stringify([entry]),
      );
    },
    { id: question, entry: enrichment },
  );
  await page.route("**/api/sync/threads", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/api/enrichment/threads/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enrichments: [enrichment] }),
    }),
  );

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.getByTestId("day-flow-start").click();
  await expect(page.getByTestId("day-flow-card")).toBeVisible();

  // The report opens in place, whole — and the deck is still dealing.
  await page.getByTestId("day-flow-report-toggle").click();
  await expect(page.getByTestId("day-flow-report")).toContainText(
    "Frost heave behind the wall",
  );
  await expect(page.getByTestId("day-flow-report")).toContainText(
    "drainage, not mortar",
  );
  await expect(page.getByTestId("day-flow-position")).toContainText(
    "Thread 1 of 1",
  );
});

test("undo on the receipts returns the Thread to the deck; settling again empties New", async ({
  page,
}) => {
  await stubRoutingTransport(page);
  await openCaptureShell(page);
  await commitCapture(page, "Heron on the far bank at dusk");
  const heron = await threadIdByTitle(page, "Heron");
  await setKind(page, heron, "observation");
  await isolateFromServer(page);

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.getByTestId("day-flow-start").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("day-flow-receipts")).toBeVisible();

  // Undo pulls it back into the deck, unfiled.
  await page.getByTestId(`day-flow-undo-${heron}`).click();
  await expect(page.getByTestId("day-flow-card")).toBeVisible();
  await expect(page.getByTestId("day-flow-count")).toContainText("1 to route");
  await expect
    .poll(async () => (await readFiling(page, heron)).reviewed)
    .toBe(false);
  expect((await readFiling(page, heron)).route).toBeNull();

  // Settle it again: receipts, and New is empty for the Day.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("day-flow-receipts")).toBeVisible();
  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );
});

test("a desk row and the deck produce the same filing for the same route", async ({
  page,
}) => {
  await stubRoutingTransport(page);
  await openCaptureShell(page);
  await commitCapture(page, "Heron on the far bank at dusk");
  await commitCapture(page, "Why does the reservoir wall bulge outward?");
  const heron = await threadIdByTitle(page, "Heron");
  const question = await threadIdByTitle(page, "reservoir wall");
  await setKind(page, heron, "observation");
  await setKind(page, question, "question");
  await isolateFromServer(page);

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();

  // Route the heron from its desk row, below the flow.
  await page.getByTestId(`file-thread-${heron}`).click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();
  await page.getByTestId("file-route-journal").click();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  // Route the question from the deck, redirected to the same place.
  await page.getByTestId("day-flow-start").click();
  await expect(page.getByTestId("day-flow-card")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByTestId("day-flow-receipts")).toBeVisible();

  // Same gesture, same seam, same filing — only the Thread differs.
  const calls = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __WT_FILINGS__?: Array<{
            threadId: string;
            filing: Record<string, unknown>;
          }>;
        }
      ).__WT_FILINGS__ ?? [],
  );
  expect(calls).toHaveLength(2);
  const [fromRow, fromDeck] = calls;
  expect(fromRow.threadId).toBe(heron);
  expect(fromDeck.threadId).toBe(question);
  expect(fromDeck.filing).toEqual(fromRow.filing);
  expect(await readFiling(page, heron)).toEqual(
    await readFiling(page, question),
  );
});
