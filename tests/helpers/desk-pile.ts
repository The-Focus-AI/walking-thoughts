import { expect, type Page } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./capture-shell";

/**
 * A seeded desk: four Threads with different shapes, built only from what
 * the app holds locally. Shared by the facet-rail and keyboard specs so both
 * argue about the same pile.
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

export type DeskPile = {
  question: string;
  heron: string;
  goldin: string;
  grate: string;
};

export async function threadIdByTitle(
  page: Page,
  needle: string,
): Promise<string> {
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

/** What the walker's device says a Thread is filed as, right now. */
export async function readThread(
  page: Page,
  threadId: string,
): Promise<{ reviewedAt: string | null; researchVerdict: string | null }> {
  return page.evaluate(async (id) => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listRecentThreads(): Promise<
            Array<{
              id: string;
              reviewedAt?: string | null;
              researchVerdict?: string | null;
            }>
          >;
        };
      }
    ).__WT_CAPTURE_STORE__!;
    const thread = (await store.listRecentThreads()).find(
      (entry) => entry.id === id,
    );
    return {
      reviewedAt: thread?.reviewedAt ?? null,
      researchVerdict: thread?.researchVerdict ?? null,
    };
  }, threadId);
}

/**
 * An open question with a published report, a photo Thread, a task, and a
 * filed observation whose research the walker kept.
 */
export async function seedPile(page: Page): Promise<DeskPile> {
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

  const ids: DeskPile = {
    question: await threadIdByTitle(page, "reservoir wall"),
    heron: await threadIdByTitle(page, "Heron"),
    goldin: await threadIdByTitle(page, "Goldin"),
    grate: await threadIdByTitle(page, "culvert grate"),
  };

  const ENRICHMENTS: Record<string, unknown[]> = {
    [ids.question]: [
      {
        id: "enrichment:job-wall",
        threadId: ids.question,
        text: "Frost heave behind the wall pushes the courses outward.",
        model: "anthropic/claude-sonnet-5",
        basisRevision: 1,
        basisEntryIds: [],
        targetCaptureIds: [],
        createdAt: "2026-08-01T19:00:00.000Z",
        sources: [],
        mentions: [
          { name: "The reservoir", slug: "the-reservoir", kind: "place" },
          { name: "Frost heave", slug: "frost-heave", kind: "idea" },
        ],
        suggestedQuestions: ["How deep does the frost line run here?"],
      },
    ],
    [ids.grate]: [
      {
        id: "enrichment:job-grate",
        threadId: ids.grate,
        text: "The grate below the reservoir outflow is silting up.",
        model: "anthropic/claude-sonnet-5",
        basisRevision: 1,
        basisEntryIds: [],
        targetCaptureIds: [],
        createdAt: "2026-08-01T19:10:00.000Z",
        sources: [],
        mentions: [
          { name: "The reservoir", slug: "the-reservoir", kind: "place" },
        ],
        suggestedQuestions: [],
      },
    ],
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
          mentions: [
            { name: "The reservoir", slug: "the-reservoir", kind: "place" },
            { name: "Frost heave", slug: "frost-heave", kind: "idea" },
          ],
          suggestedQuestions: ["How deep does the frost line run here?"],
        },
      ]),
    );

    // A second Thread mentioning the same place, so a Mentions row counts
    // more than one and the Topics Lens has something to stack.
    localStorage.setItem(
      `wt-thread-enrichments:${seeded.grate}`,
      JSON.stringify([
        {
          id: "enrichment:job-grate",
          threadId: seeded.grate,
          text: "The grate below the reservoir outflow is silting up.",
          model: "anthropic/claude-sonnet-5",
          basisRevision: 1,
          basisEntryIds: [],
          targetCaptureIds: [],
          createdAt: "2026-08-01T19:10:00.000Z",
          sources: [],
          mentions: [
            { name: "The reservoir", slug: "the-reservoir", kind: "place" },
          ],
          suggestedQuestions: [],
        },
      ]),
    );
  }, ids);

  // Neither hydration nor the per-Thread Enrichment fetch may overwrite the
  // seeded pile mid-test.
  await page.route("**/api/sync/threads", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/api/enrichment/threads/**", (route) => {
    const threadId = new URL(route.request().url()).pathname.split("/").pop();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enrichments: threadId ? (ENRICHMENTS[threadId] ?? []) : [],
      }),
    });
  });
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

/**
 * The filing endpoints the desk talks to, standing in for the server: it
 * echoes the decision so the local Thread can settle.
 */
export async function stubFilingTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
        filing: { kind?: string | null; researchVerdict?: string | null },
      ) {
        return {
          threadId,
          reviewedAt: new Date().toISOString(),
          kind: filing.kind ?? null,
          projectId: null,
          projectName: null,
          researchVerdict: filing.researchVerdict ?? null,
        };
      },
    };
  });
}

export function railRow(page: Page, group: string, value: string) {
  return page.getByTestId(`facet-${group}-${value}`);
}
