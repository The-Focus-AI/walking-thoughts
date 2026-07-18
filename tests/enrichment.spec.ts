import { expect, test } from "@playwright/test";
import { enrichPendingCaptures } from "@/lib/enrichment/client";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { synchronizePendingCaptures } from "@/lib/sync/client";

test("sync leaves Captures enriching; enrichment completes them", async () => {
  const store = createMemoryCaptureStore();
  await store.commit("Owl on the ridge", null);

  await synchronizePendingCaptures(store, {
    async pushCaptures(captures) {
      return {
        results: captures.map((capture) => ({
          id: capture.id,
          threadId: capture.threadId ?? capture.id,
          sequence: capture.sequence,
          status: "complete" as const,
        })),
        failures: [],
      };
    },
  });

  const afterSync = await store.list();
  expect(afterSync[0]?.status).toBe("enriching");

  await enrichPendingCaptures(store, {
    async process() {
      const pending = await store.list();
      return {
        results: pending.map((capture) => ({
          id: capture.id,
          threadId: capture.threadId ?? capture.id,
          status: "complete" as const,
          threadTitle: "Ridge owl",
        })),
        jobs: [],
      };
    },
  });

  const afterEnrich = await store.list();
  expect(afterEnrich[0]?.status).toBe("complete");
  const threads = await store.listRecentThreads();
  expect(threads[0]?.title).toBe("Ridge owl");
});
