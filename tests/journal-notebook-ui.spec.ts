import { expect, test } from "@playwright/test";
import {
  commitCapture,
  newestThreadId,
  openCaptureShell,
} from "./helpers/capture-shell";

/**
 * The Journal destination on the public browser seam (docs/desk.md, D2):
 * routing a Thread to Journal files it into the notebook — the walker's
 * words with the report readable in place, linked to the Thread and its
 * Artifact page, the draft-worthy flagged as post candidates — and
 * un-routing removes the entry without touching the Thread's history.
 */
test("a journal-routed Thread reads back as a notebook entry, until un-routed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }).__WT_REVIEW_TRANSPORT__ =
      {
        async setReviewed(threadId: string) {
          return { threadId, reviewedAt: new Date().toISOString() };
        },
        async listProjects() {
          return [];
        },
        async fileThread(
          threadId: string,
          filing: { kind?: string | null; route?: string | null },
        ) {
          return {
            threadId,
            reviewedAt: new Date().toISOString(),
            kind: filing.kind ?? null,
            projectId: null,
            projectName: null,
            researchVerdict: filing.route === "journal" ? "kept" : null,
            route: filing.route ?? null,
          };
        },
      };
  });

  await openCaptureShell(page);
  await commitCapture(
    page,
    "The streams of tokens will wash away the differences",
  );
  const threadId = await newestThreadId(page);

  // The device already holds the report and the published page — the seam
  // the notebook reads offline. The Enrichment flagged the words as the
  // seed of a post.
  await page.evaluate(
    ({ id }) => {
      localStorage.setItem(
        `wt-thread-enrichments:${id}`,
        JSON.stringify([
          {
            id: "e-notebook",
            threadId: id,
            text: "The idea has a name: **homogenization pressure**.",
            model: "test-model",
            basisRevision: 1,
            basisEntryIds: [],
            targetCaptureIds: [],
            createdAt: "2026-08-08T08:00:00.000Z",
            sources: [],
            draftWorthy: true,
          },
        ]),
      );
      localStorage.setItem(
        "wt-artifacts",
        JSON.stringify([
          {
            id: "artifact:e-notebook",
            threadId: id,
            enrichmentId: "e-notebook",
            title: "Streams of tokens",
            standfirst: null,
            kind: "observation",
            model: "test-model",
            createdAt: "2026-08-08T08:00:00.000Z",
          },
        ]),
      );
    },
    { id: threadId },
  );

  // Before routing, the notebook is empty — a Thread waiting in the pile is
  // not an entry.
  await page.goto("/journal/notebook");
  await expect(page.getByTestId("notebook-count")).toContainText("0 entries");

  // Route it to the Journal from the desk — the one settle gesture.
  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();
  await page.getByTestId("file-route-journal").click();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  // The entry: the walker's words, the report readable in place, the flag,
  // and both links.
  await page.goto("/journal/notebook");
  const entry = page.getByTestId(`notebook-entry-${threadId}`);
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(
    "The streams of tokens will wash away the differences",
  );
  await expect(entry).toContainText("homogenization pressure");
  await expect(entry.getByTestId("notebook-draft-flag")).toBeVisible();
  await expect(entry.getByTestId("notebook-thread-link")).toHaveAttribute(
    "href",
    `/threads/${threadId}`,
  );
  await expect(entry.getByTestId("notebook-artifact-link")).toHaveAttribute(
    "href",
    `/artifacts/${encodeURIComponent("artifact:e-notebook")}`,
  );

  // The post queue: draft candidates listed together.
  await page.getByTestId("notebook-drafts-toggle").click();
  await expect(page.getByTestId(`notebook-entry-${threadId}`)).toBeVisible();
  await expect(page.getByTestId("notebook-count")).toContainText(
    "1 draft candidate",
  );

  // Un-routing (the desk's undo) removes the entry…
  await page.evaluate(async ({ id }) => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          applyThreadFiling(filing: {
            threadId: string;
            reviewedAt: string | null;
            route: string | null;
          }): Promise<void>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    await store?.applyThreadFiling({
      threadId: id,
      reviewedAt: null,
      route: null,
    });
  }, { id: threadId });

  await page.goto("/journal/notebook");
  await expect(page.getByTestId("notebook-count")).toContainText("0 entries");
  await expect(
    page.getByTestId(`notebook-entry-${threadId}`),
  ).toHaveCount(0);

  // …without touching the Thread's history: the Capture is still there.
  const captureTexts = await page.evaluate(async ({ id }) => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listThread(
            threadId: string,
          ): Promise<{ captures: Array<{ text: string }> }>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    const view = await store?.listThread(id);
    return view?.captures.map((capture) => capture.text) ?? [];
  }, { id: threadId });
  expect(captureTexts).toEqual([
    "The streams of tokens will wash away the differences",
  ]);
});
