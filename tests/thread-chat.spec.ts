import { expect, test, type Page } from "@playwright/test";

/**
 * Public seams:
 * - `/threads/[threadId]` is the Thread review surface: Capture hero,
 *   markdown report, conversation, copy-as-markdown
 * - Reply Capture → sync → Enrichment report appears in the Thread
 */

async function seedThread(page: Page, text: string): Promise<string> {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await page.getByLabel("Capture text").fill(text);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("article", { name: new RegExp(text) })).toBeVisible();

  return page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          listRecentThreads(): Promise<Array<{ id: string }>>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    const threads = await store!.listRecentThreads();
    return threads[0]!.id;
  });
}

test.describe("Thread chat", () => {
  test("opens a Thread with the Capture hero, reply composer, and copy action", async ({
    page,
  }) => {
    const threadId = await seedThread(page, "Ferns by the brook");
    await page.goto(`/threads/${threadId}`);

    await expect(page.getByTestId("thread-chat")).toBeVisible();
    await expect(page.getByRole("log", { name: "Thread review" })).toBeVisible();
    await expect(page.getByTestId("thread-capture-hero")).toContainText(
      "Ferns by the brook",
    );
    await expect(page.getByLabel("Reply in this Thread")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reply", exact: true })).toBeVisible();
    await expect(page.getByTestId("thread-copy-markdown")).toBeVisible();
  });

  test("reply syncs and shows the Walking Thoughts report in the Thread", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      type Capture = {
        id: string;
        threadId: string | null;
        sequence: number;
        status?: string;
      };
      type G = typeof globalThis & {
        __WT_SYNC_TRANSPORT__?: {
          pushCaptures(captures: Capture[]): Promise<{
            results: Array<{
              id: string;
              threadId: string;
              sequence: number;
              status: "complete";
            }>;
            failures: [];
          }>;
        };
        __WT_ENRICHMENT_TRANSPORT__?: {
          process(): Promise<{
            results: Array<{
              id: string;
              threadId: string;
              status: "complete";
            }>;
            jobs: [];
          }>;
        };
        __WT_MEDIA_TRANSPORT__?: {
          upload(): Promise<{ remoteObjectKey: string }>;
        };
        __WT_CAPTURE_STORE__?: {
          list(): Promise<Capture[]>;
        };
      };
      const g = globalThis as G;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/api/enrichment/threads/")) {
          const id = url.split("/").pop()!.split("?")[0]!;
          const raw = localStorage.getItem(`wt-thread-enrichments:${id}`);
          return new Response(raw ? `{"enrichments":${raw}}` : '{"enrichments":[]}', {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return originalFetch(input, init);
      };
      g.__WT_MEDIA_TRANSPORT__ = {
        async upload() {
          return { remoteObjectKey: "media/test" };
        },
      };
      g.__WT_SYNC_TRANSPORT__ = {
        async pushCaptures(captures) {
          return {
            results: captures.map((capture) => ({
              id: capture.id,
              threadId: capture.threadId ?? capture.id,
              sequence: capture.sequence || 1,
              status: "complete" as const,
            })),
            failures: [],
          };
        },
      };
      g.__WT_ENRICHMENT_TRANSPORT__ = {
        async process() {
          const captures = (await g.__WT_CAPTURE_STORE__?.list()) ?? [];
          const targets = captures.filter(
            (capture) =>
              capture.threadId &&
              (capture.status === "enriching" ||
                capture.status === "needs_attention" ||
                capture.status === "syncing" ||
                capture.status === "complete" ||
                capture.status === "saved_locally"),
          );
          const latest = targets[targets.length - 1];
          if (!latest?.threadId) return { results: [], jobs: [] };
          const existingRaw = localStorage.getItem(
            `wt-thread-enrichments:${latest.threadId}`,
          );
          const existing = existingRaw
            ? (JSON.parse(existingRaw) as Array<Record<string, unknown>>)
            : [];
          const enrichmentId = `enrich-${latest.id}`;
          // Idempotent: SyncRuntime + Thread view may drain the outbox concurrently.
          if (!existing.some((item) => item.id === enrichmentId)) {
            existing.push({
              id: enrichmentId,
              threadId: latest.threadId,
              basisRevision: latest.sequence,
              basisEntryIds: [latest.id],
              targetCaptureIds: [latest.id],
              text: "That sounds like a hermit thrush.",
              model: "test-model",
              createdAt: new Date().toISOString(),
              sources: [],
            });
            localStorage.setItem(
              `wt-thread-enrichments:${latest.threadId}`,
              JSON.stringify(existing),
            );
          }
          return {
            results: targets.map((capture) => ({
              id: capture.id,
              threadId: capture.threadId!,
              status: "complete" as const,
            })),
            jobs: [],
          };
        },
      };
    });

    const threadId = await seedThread(page, "What bird is calling?");
    await page.goto(`/threads/${threadId}`);
    await page.getByLabel("Reply in this Thread").fill("It was near the creek");
    await page.getByRole("button", { name: "Reply", exact: true }).click();

    await expect(
      page.getByTestId("chat-turn-you").filter({ hasText: "creek" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("enrichment-report").filter({ hasText: "hermit thrush" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("tapping a Thread row opens the Thread review page", async ({
    page,
  }) => {
    const threadId = await seedThread(page, "Overlook fungi");
    await page.goto("/threads");
    await page.getByRole("link", { name: /Overlook fungi/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.getByTestId("thread-chat")).toBeVisible();
  });
});
