import type { CaptureStore, LocalCapture } from "@/lib/local-capture/types";
import type { ThreadEnrichment } from "./types";

/** True when an Enrichment batch already covered this Capture. */
export function captureCoveredByEnrichment(
  captureId: string,
  enrichments: ThreadEnrichment[],
): boolean {
  return enrichments.some((entry) =>
    entry.targetCaptureIds.includes(captureId),
  );
}

/**
 * Local Captures marked complete/enriching that the server does not have —
 * typical after a memory-only sync window. Re-queue them for metadata push.
 */
export function missingServerCaptureIds(
  captures: LocalCapture[],
  serverCaptureIds: ReadonlySet<string>,
): string[] {
  return captures
    .filter(
      (capture) =>
        capture.status === "complete" || capture.status === "enriching",
    )
    .filter((capture) => !serverCaptureIds.has(capture.id))
    .map((capture) => capture.id);
}

/**
 * Local complete Captures whose Thread has no Enrichment covering them.
 * Silent Complete with an empty chat — re-queue Enrichment.
 */
export function orphanCompleteCaptureIds(
  captures: LocalCapture[],
  enrichmentsByThread: ReadonlyMap<string, ThreadEnrichment[]>,
): Array<{ id: string; threadId: string }> {
  const orphans: Array<{ id: string; threadId: string }> = [];
  for (const capture of captures) {
    if (capture.status !== "complete" || !capture.threadId) continue;
    const enrichments = enrichmentsByThread.get(capture.threadId) ?? [];
    if (captureCoveredByEnrichment(capture.id, enrichments)) continue;
    orphans.push({ id: capture.id, threadId: capture.threadId });
  }
  return orphans;
}

export type RecoverStaleResult = {
  requeuedForSync: number;
  requeuedForEnrichment: number;
};

/**
 * Heal stale local Complete/Enriching state against the server Thread list
 * and Enrichment cache so Retry / open+online can finish the chat reply.
 */
export async function recoverStaleLocalCaptures(
  store: CaptureStore,
  options: {
    serverCaptureIds: ReadonlySet<string>;
    /** Network Enrichments only; null means the Thread could not be checked. */
    loadEnrichments: (
      threadId: string,
    ) => Promise<ThreadEnrichment[] | null>;
  },
): Promise<RecoverStaleResult> {
  const captures = await store.list();
  const missing = missingServerCaptureIds(captures, options.serverCaptureIds);
  if (missing.length > 0) {
    await store.restoreSavedLocally(missing);
  }

  const afterSyncRequeue = missing.length > 0 ? await store.list() : captures;
  const threadIds = [
    ...new Set(
      afterSyncRequeue
        .filter((capture) => capture.status === "complete" && capture.threadId)
        .map((capture) => capture.threadId as string),
    ),
  ];
  const enrichmentsByThread = new Map<string, ThreadEnrichment[]>();
  await Promise.all(
    threadIds.map(async (threadId) => {
      const loaded = await options.loadEnrichments(threadId);
      // null → skip orphan detection for this Thread (network unavailable)
      if (loaded !== null) enrichmentsByThread.set(threadId, loaded);
    }),
  );

  const checkedCaptures = afterSyncRequeue.filter(
    (capture) =>
      capture.status !== "complete" ||
      !capture.threadId ||
      enrichmentsByThread.has(capture.threadId),
  );
  const orphans = orphanCompleteCaptureIds(
    checkedCaptures,
    enrichmentsByThread,
  );
  if (orphans.length > 0) {
    await store.applyEnrichmentBatch({
      results: orphans.map((orphan) => ({
        id: orphan.id,
        threadId: orphan.threadId,
        status: "enriching" as const,
      })),
    });
  }

  return {
    requeuedForSync: missing.length,
    requeuedForEnrichment: orphans.length,
  };
}
