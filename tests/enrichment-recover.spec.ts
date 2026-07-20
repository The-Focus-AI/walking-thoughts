import { expect, test } from "@playwright/test";
import {
  captureCoveredByEnrichment,
  missingServerCaptureIds,
  orphanCompleteCaptureIds,
  recoverStaleLocalCaptures,
} from "@/lib/enrichment/recover";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture } from "@/lib/local-capture/types";

function enrichment(
  overrides: Partial<ThreadEnrichment> & Pick<ThreadEnrichment, "id" | "threadId">,
): ThreadEnrichment {
  return {
    text: "A reply",
    model: "test",
    basisRevision: 1,
    basisEntryIds: [],
    targetCaptureIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    sources: [],
    ...overrides,
  };
}

test("captureCoveredByEnrichment matches targetCaptureIds", () => {
  const list = [
    enrichment({
      id: "e1",
      threadId: "t1",
      targetCaptureIds: ["c1", "c2"],
    }),
  ];
  expect(captureCoveredByEnrichment("c1", list)).toBe(true);
  expect(captureCoveredByEnrichment("c9", list)).toBe(false);
});

test("missingServerCaptureIds finds complete Captures absent from the server", () => {
  const captures = [
    { id: "a", status: "complete" },
    { id: "b", status: "enriching" },
    { id: "c", status: "saved_locally" },
    { id: "d", status: "complete" },
  ] as LocalCapture[];
  expect(missingServerCaptureIds(captures, new Set(["d"]))).toEqual(["a", "b"]);
});

test("orphanCompleteCaptureIds finds Complete Captures with no Enrichment", () => {
  const captures = [
    { id: "c1", status: "complete", threadId: "t1" },
    { id: "c2", status: "complete", threadId: "t1" },
    { id: "c3", status: "enriching", threadId: "t1" },
  ] as LocalCapture[];
  const byThread = new Map([
    [
      "t1",
      [
        enrichment({
          id: "e1",
          threadId: "t1",
          targetCaptureIds: ["c1"],
        }),
      ],
    ],
  ]);
  expect(orphanCompleteCaptureIds(captures, byThread)).toEqual([
    { id: "c2", threadId: "t1" },
  ]);
});

test("recoverStaleLocalCaptures requeues missing and orphan Completes", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Gone from server", null, {
    destination: { type: "new_thread" },
  });
  const second = await store.commit("On server, no reply", null, {
    destination: { type: "thread", threadId: first.threadId! },
  });

  await store.applySyncBatch({
    results: [
      {
        id: first.id,
        threadId: first.threadId!,
        sequence: 1,
        status: "complete",
      },
      {
        id: second.id,
        threadId: second.threadId!,
        sequence: 2,
        status: "complete",
      },
    ],
    failures: [],
  });
  await store.applyEnrichmentBatch({
    results: [
      {
        id: first.id,
        threadId: first.threadId!,
        status: "complete",
      },
      {
        id: second.id,
        threadId: second.threadId!,
        status: "complete",
      },
    ],
  });

  const result = await recoverStaleLocalCaptures(store, {
    serverCaptureIds: new Set([second.id]),
    async loadEnrichments() {
      return [];
    },
  });

  expect(result.requeuedForSync).toBe(1);
  expect(result.requeuedForEnrichment).toBe(1);

  const listed = await store.list();
  const byId = new Map(listed.map((capture) => [capture.id, capture]));
  expect(byId.get(first.id)?.status).toBe("saved_locally");
  expect(byId.get(second.id)?.status).toBe("enriching");
});
