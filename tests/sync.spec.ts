import { expect, test, type Page } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import {
  synchronizePendingCaptures,
  type SyncPushResult,
} from "@/lib/sync/client";
import type { SyncBatchResponse, SyncCapturePayload } from "@/lib/sync/types";

test("client sync batches pending Captures, replays safely, and records failures", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Trail marker leaning left", null);
  await store.commit("Same ridge, clearer view", null, {
    destination: { type: "new_thread" },
  });

  let pushes = 0;
  const seen = new Map<string, SyncCapturePayload>();
  const transport = {
    async pushCaptures(captures: SyncCapturePayload[]): Promise<SyncPushResult> {
      pushes += 1;
      if (pushes === 1) {
        return {
          results: [],
          failures: captures.map((capture) => ({
            id: capture.id,
            status: "needs_attention" as const,
            reason: "network_blip",
            retryable: true,
          })),
        };
      }

      const results = captures.map((capture) => {
        const prior = seen.get(capture.idempotencyKey);
        if (prior) {
          return {
            id: prior.id,
            threadId: prior.threadId ?? prior.id,
            sequence: prior.sequence,
            status: "complete" as const,
          };
        }
        const threadId = capture.threadId ?? capture.id;
        seen.set(capture.idempotencyKey, { ...capture, threadId });
        return {
          id: capture.id,
          threadId,
          sequence: capture.sequence,
          status: "complete" as const,
        };
      });
      return { results, failures: [] } satisfies SyncBatchResponse;
    },
  };

  const failed = await synchronizePendingCaptures(store, transport);
  expect(failed.failures).toHaveLength(2);
  const afterFailure = await store.list();
  expect(afterFailure.every((capture) => capture.status === "needs_attention")).toBe(
    true,
  );

  const recovered = await synchronizePendingCaptures(store, transport);
  expect(recovered.results).toHaveLength(2);
  expect(recovered.failures).toHaveLength(0);

  const replay = await synchronizePendingCaptures(store, transport);
  expect(replay.results).toHaveLength(0);

  const threads = await store.listRecentThreads();
  expect(threads.length).toBeGreaterThanOrEqual(1);
  const inbox = await store.listInbox();
  expect(inbox.find((capture) => capture.id === first.id)).toBeUndefined();
  const synced = await store.list();
  expect(synced.every((capture) => capture.status === "enriching")).toBe(true);
  expect(pushes).toBe(2);
});

async function openShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("App cached")).toBeVisible();
}

test("browser seam syncs after reconnect and keeps Complete through restart", async ({
  context,
  page,
}) => {
  await openShell(page);

  await page.evaluate(() => {
    const pushes: string[][] = [];
    const g = globalThis as typeof globalThis & {
      __WT_SYNC_TRANSPORT__?: {
        pushCaptures(
          captures: Array<{ id: string; threadId: string | null }>,
        ): Promise<{
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
      __WT_SYNC_PUSHES__?: string[][];
    };
    g.__WT_SYNC_TRANSPORT__ = {
      async pushCaptures(captures) {
        pushes.push(captures.map((capture) => capture.id));
        g.__WT_SYNC_PUSHES__ = pushes;
        return {
          results: captures.map((capture) => ({
            id: capture.id,
            threadId: capture.threadId ?? capture.id,
            sequence: 1,
            status: "complete" as const,
          })),
          failures: [],
        };
      },
    };
    g.__WT_ENRICHMENT_TRANSPORT__ = {
      async process() {
        const ids = g.__WT_SYNC_PUSHES__?.flat() ?? [];
        return {
          results: ids.map((id) => ({
            id,
            threadId: id,
            status: "complete" as const,
          })),
          jobs: [],
        };
      },
    };
  });

  await context.setOffline(true);
  await page.getByLabel("Capture text").fill("Airplane-mode observation");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByText("Saved locally").first()).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Retry sync" }).click();
  await expect(page.getByText("Complete").first()).toBeVisible();

  const pushCount = await page.evaluate(() => {
    return (
      (globalThis as typeof globalThis & { __WT_SYNC_PUSHES__?: string[][] })
        .__WT_SYNC_PUSHES__?.length ?? 0
    );
  });
  expect(pushCount).toBeGreaterThanOrEqual(1);

  await page.reload();
  await page.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __WT_SYNC_TRANSPORT__?: {
        pushCaptures(
          captures: Array<{ id: string; threadId: string | null }>,
        ): Promise<{
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
        process(): Promise<{ results: []; jobs: [] }>;
      };
    };
    g.__WT_SYNC_TRANSPORT__ = {
      async pushCaptures(captures) {
        return {
          results: captures.map((capture) => ({
            id: capture.id,
            threadId: capture.threadId ?? capture.id,
            sequence: 1,
            status: "complete" as const,
          })),
          failures: [],
        };
      },
    };
    g.__WT_ENRICHMENT_TRANSPORT__ = {
      async process() {
        return { results: [], jobs: [] };
      },
    };
  });
  await expect(
    page.getByRole("article", { name: /Airplane-mode observation/ }),
  ).toBeVisible();
  await expect(page.getByText("Complete").first()).toBeVisible();
});
