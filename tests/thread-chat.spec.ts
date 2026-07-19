import { expect, test, type Page } from "@playwright/test";

/**
 * Public seams:
 * - `/threads/[threadId]` is a chat-style Thread surface
 * - Follow-up Capture → sync → Enrichment appears in-chat
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
  test("opens a Thread as a chat with You turns and a sticky composer", async ({
    page,
  }) => {
    const threadId = await seedThread(page, "Ferns by the brook");
    await page.goto(`/threads/${threadId}`);

    await expect(page.getByTestId("thread-chat")).toBeVisible();
    await expect(page.getByRole("log", { name: "Thread conversation" })).toBeVisible();
    await expect(page.getByTestId("chat-turn-you").first()).toContainText(
      "Ferns by the brook",
    );
    await expect(page.getByLabel("Follow-up Capture")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("follow-up syncs and shows the Walking Thoughts reply in chat", async ({
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
            ? (JSON.parse(existingRaw) as unknown[])
            : [];
          const enrichment = {
            id: `enrich-${latest.id}`,
            threadId: latest.threadId,
            basisRevision: latest.sequence,
            basisEntryIds: [latest.id],
            targetCaptureIds: [latest.id],
            text: "That sounds like a hermit thrush.",
            model: "test-model",
            createdAt: new Date().toISOString(),
            sources: [],
          };
          localStorage.setItem(
            `wt-thread-enrichments:${latest.threadId}`,
            JSON.stringify([...existing, enrichment]),
          );
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
    await page.getByLabel("Follow-up Capture").fill("It was near the creek");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(
      page.getByTestId("chat-turn-you").filter({ hasText: "creek" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("chat-turn-agent").filter({ hasText: "hermit thrush" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Threads archive Open chat navigates to the Thread chat", async ({
    page,
  }) => {
    const threadId = await seedThread(page, "Overlook fungi");
    await page.goto("/threads");
    await page.getByRole("link", { name: /Open chat/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.getByTestId("thread-chat")).toBeVisible();
  });
});
