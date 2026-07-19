import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { createMemoryMediaStore } from "@/lib/local-capture/media-store";
import {
  resetSyncCycleForTests,
  runSyncCycle,
} from "@/lib/sync/cycle";
import {
  synchronizePendingCaptures,
  type SyncPushResult,
} from "@/lib/sync/client";
import type { SyncCapturePayload } from "@/lib/sync/types";

test.beforeEach(() => {
  resetSyncCycleForTests();
});

test("thrown transport after markSyncing recovers Captures so Retry can drain", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Phone lost the radio mid-push", null);

  await expect(
    synchronizePendingCaptures(store, {
      async pushCaptures() {
        throw new Error("network_drop");
      },
    }),
  ).resolves.toMatchObject({
    results: [],
    failures: [{ id: capture.id, status: "needs_attention", retryable: true }],
  });

  const afterThrow = await store.list();
  expect(afterThrow[0]?.status).toBe("needs_attention");
  expect(afterThrow[0]?.status).not.toBe("syncing");

  let pushed = 0;
  const recovered = await synchronizePendingCaptures(store, {
    async pushCaptures(captures: SyncCapturePayload[]): Promise<SyncPushResult> {
      pushed += captures.length;
      return {
        results: captures.map((item) => ({
          id: item.id,
          threadId: item.threadId ?? item.id,
          sequence: item.sequence,
          status: "complete" as const,
        })),
        failures: [],
      };
    },
  });

  expect(pushed).toBe(1);
  expect(recovered.results).toHaveLength(1);
  expect((await store.list())[0]?.status).toBe("enriching");
});

test("abandoned syncing Captures are drained on the next cycle", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Wedged from a prior crash", null);
  await store.markSyncing([capture.id]);
  expect((await store.list())[0]?.status).toBe("syncing");

  const result = await synchronizePendingCaptures(store, {
    async pushCaptures(captures) {
      return {
        results: captures.map((item) => ({
          id: item.id,
          threadId: item.threadId ?? item.id,
          sequence: item.sequence,
          status: "complete" as const,
        })),
        failures: [],
      };
    },
  });

  expect(result.results.map((item) => item.id)).toEqual([capture.id]);
  expect((await store.list())[0]?.status).toBe("enriching");
});

test("Captures with unsynced local media wait for media before metadata push", async () => {
  const media = createMemoryMediaStore();
  const store = createMemoryCaptureStore({ mediaStore: media });
  const capture = await store.commit("Photo still on device", null, {
    attachments: [
      {
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "trail.jpg",
        bytes: new Uint8Array([9, 8, 7]),
      },
    ],
  });
  expect(capture.attachments[0]?.syncStatus).toBe("saved_locally");

  let capturePushes = 0;
  await synchronizePendingCaptures(store, {
    async pushCaptures(captures) {
      capturePushes += captures.length;
      return { results: [], failures: [] };
    },
  });
  expect(capturePushes).toBe(0);
  expect((await store.list())[0]?.status).toBe("saved_locally");

  const cycle = await runSyncCycle({
    store,
    online: true,
    mediaStore: media,
    mediaTransport: {
      async upload({ attachmentId }) {
        return { attachmentId, duplicate: false };
      },
    },
    captureTransport: {
      async pushCaptures(captures) {
        capturePushes += captures.length;
        return {
          results: captures.map((item) => ({
            id: item.id,
            threadId: item.threadId ?? item.id,
            sequence: item.sequence,
            status: "complete" as const,
          })),
          failures: [],
        };
      },
    },
    enrichmentTransport: {
      async process() {
        return {
          results: [
            {
              id: capture.id,
              threadId: capture.id,
              status: "complete" as const,
            },
          ],
          jobs: [],
        };
      },
    },
  });

  expect(cycle.skippedOffline).toBe(false);
  expect(capturePushes).toBe(1);
  expect((await store.list())[0]?.attachments[0]?.syncStatus).toBe("complete");
  expect((await store.list())[0]?.status).toBe("complete");
});

test("runSyncCycle no-ops while offline and resumes when online", async () => {
  const store = createMemoryCaptureStore();
  await store.commit("Held until the trail has signal", null);

  const offline = await runSyncCycle({
    store,
    online: false,
    captureTransport: {
      async pushCaptures() {
        throw new Error("should_not_push_offline");
      },
    },
  });
  expect(offline.skippedOffline).toBe(true);
  expect((await store.list())[0]?.status).toBe("saved_locally");

  const online = await runSyncCycle({
    store,
    online: true,
    captureTransport: {
      async pushCaptures(captures) {
        return {
          results: captures.map((item) => ({
            id: item.id,
            threadId: item.threadId ?? item.id,
            sequence: item.sequence,
            status: "complete" as const,
          })),
          failures: [],
        };
      },
    },
    enrichmentTransport: {
      async process() {
        const list = await store.list();
        return {
          results: list.map((item) => ({
            id: item.id,
            threadId: item.threadId ?? item.id,
            status: "complete" as const,
          })),
          jobs: [],
        };
      },
    },
  });

  expect(online.skippedOffline).toBe(false);
  expect(online.capturesPushed).toBe(1);
  expect((await store.list())[0]?.status).toBe("complete");
});
