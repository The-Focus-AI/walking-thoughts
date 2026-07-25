import { expect, test } from "@playwright/test";
import { recoverStaleLocalCaptures } from "@/lib/enrichment/recover";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import {
  isSyncAuthBlocked,
  noteSyncStatus,
  resetSyncAuthForTests,
} from "@/lib/sync/session-state";

test.beforeEach(() => {
  resetSyncAuthForTests();
});

test("a refused session is recorded; a served one clears it", () => {
  expect(isSyncAuthBlocked()).toBe(false);

  noteSyncStatus(401);
  expect(isSyncAuthBlocked()).toBe(true);

  // A server that answers at all proves the session works again.
  noteSyncStatus(200);
  expect(isSyncAuthBlocked()).toBe(false);

  noteSyncStatus(403);
  expect(isSyncAuthBlocked()).toBe(true);
});

test("a server fault says nothing about the session", () => {
  noteSyncStatus(401);
  // A 503 is the server being down, not the walker being signed out — it must
  // not clear a real auth failure, and must not invent one either.
  noteSyncStatus(503);
  expect(isSyncAuthBlocked()).toBe(true);

  resetSyncAuthForTests();
  noteSyncStatus(500);
  expect(isSyncAuthBlocked()).toBe(false);
});

function enrichmentCovering(
  threadId: string,
  captureId: string,
): ThreadEnrichment {
  return {
    id: `e-${captureId}`,
    threadId,
    text: "Report.",
    model: "test",
    basisRevision: 1,
    basisEntryIds: [captureId],
    targetCaptureIds: [captureId],
    createdAt: "2026-07-25T21:00:00.000Z",
    sources: [],
  };
}

test("the recovery sweep only asks about Threads the cache cannot account for", async () => {
  const store = createMemoryCaptureStore();
  const covered = await store.commit("Settled thought", null);
  const orphan = await store.commit("Silent complete", null);
  await store.applySyncBatch({
    results: [
      {
        id: covered.id,
        threadId: covered.id,
        sequence: 1,
        status: "complete",
      },
      { id: orphan.id, threadId: orphan.id, sequence: 1, status: "complete" },
    ],
    failures: [],
  });
  // Complete is what the Enrichment batch settles them to; the sweep only
  // looks at Threads that already believe they are done.
  await store.applyEnrichmentBatch({
    results: [
      { id: covered.id, threadId: covered.id, status: "complete" },
      { id: orphan.id, threadId: orphan.id, status: "complete" },
    ],
  });

  const asked: string[] = [];
  const result = await recoverStaleLocalCaptures(store, {
    serverCaptureIds: new Set([covered.id, orphan.id]),
    cachedEnrichments: (threadId) =>
      threadId === covered.id
        ? [enrichmentCovering(covered.id, covered.id)]
        : [],
    loadEnrichments: async (threadId) => {
      asked.push(threadId);
      return [];
    },
  });

  // The settled Thread costs no request; only the one with nothing retained
  // is worth asking about — and it is still correctly re-queued.
  expect(asked).toEqual([orphan.id]);
  expect(result.requeuedForEnrichment).toBe(1);
});

test("a cached Enrichment that misses a Capture is still re-checked", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("First", null);
  await store.applySyncBatch({
    results: [
      { id: first.id, threadId: first.id, sequence: 1, status: "complete" },
    ],
    failures: [],
  });
  const second = await store.commit("Reply in the same Thread", null, {
    destination: { type: "thread", threadId: first.id },
  });
  await store.applySyncBatch({
    results: [
      { id: second.id, threadId: first.id, sequence: 2, status: "complete" },
    ],
    failures: [],
  });
  await store.applyEnrichmentBatch({
    results: [
      { id: first.id, threadId: first.id, status: "complete" },
      { id: second.id, threadId: first.id, status: "complete" },
    ],
  });

  const asked: string[] = [];
  await recoverStaleLocalCaptures(store, {
    serverCaptureIds: new Set([first.id, second.id]),
    // The cache knows the first Capture but not the reply.
    cachedEnrichments: () => [enrichmentCovering(first.id, first.id)],
    loadEnrichments: async (threadId) => {
      asked.push(threadId);
      return [enrichmentCovering(first.id, first.id)];
    },
  });

  expect(asked).toEqual([first.id]);
});
