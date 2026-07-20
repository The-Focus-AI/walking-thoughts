import { enrichPendingCaptures, type EnrichmentTransport } from "@/lib/enrichment/client";
import { recoverStaleLocalCaptures } from "@/lib/enrichment/recover";
import { fetchThreadEnrichmentsFromNetwork } from "@/lib/enrichment/thread-view";
import type { CaptureStore } from "@/lib/local-capture/types";
import type { MediaStore } from "@/lib/local-capture/media-store";
import {
  getSyncTransport,
  synchronizePendingCaptures,
  type SyncTransport,
} from "@/lib/sync/client";
import {
  getMediaTransport,
  synchronizePendingMedia,
  type MediaTransport,
} from "@/lib/sync/media-client";
import {
  getThreadsTransport,
  serverCaptureIdSet,
  type ThreadsTransport,
} from "@/lib/sync/threads-client";

export type SyncCycleResult = {
  skippedOffline: boolean;
  capturesPushed: number;
  capturesFailed: number;
  capturesImported: number;
  enrichmentResults: number;
  requeuedForSync: number;
  requeuedForEnrichment: number;
};

export type SyncCycleInput = {
  store: CaptureStore;
  online?: boolean;
  mediaTransport?: MediaTransport;
  mediaStore?: MediaStore;
  captureTransport?: SyncTransport;
  enrichmentTransport?: EnrichmentTransport;
  threadsTransport?: ThreadsTransport;
  retryFailed?: boolean;
};

export const SYNC_CYCLE_EVENT = "wt:sync-cycle";

type SyncCycleGlobals = typeof globalThis & {
  __WT_SYNC_CYCLE_INFLIGHT__?: Promise<SyncCycleResult> | null;
};

function readOnline(explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

async function executeSyncCycle(input: SyncCycleInput): Promise<SyncCycleResult> {
  if (!readOnline(input.online)) {
    return {
      skippedOffline: true,
      capturesPushed: 0,
      capturesFailed: 0,
      capturesImported: 0,
      enrichmentResults: 0,
      requeuedForSync: 0,
      requeuedForEnrichment: 0,
    };
  }

  let requeuedForSync = 0;
  let requeuedForEnrichment = 0;
  let capturesImported = 0;
  const threadsTransport = input.threadsTransport ?? getThreadsTransport();
  const listed = await threadsTransport.listThreads();
  if (!("unavailable" in listed)) {
    const hydrated = await input.store.applyRemoteThreads(listed);
    capturesImported = hydrated.importedCaptureIds.length;

    const recovered = await recoverStaleLocalCaptures(input.store, {
      serverCaptureIds: serverCaptureIdSet(listed),
      loadEnrichments: fetchThreadEnrichmentsFromNetwork,
    });
    requeuedForSync = recovered.requeuedForSync;
    requeuedForEnrichment = recovered.requeuedForEnrichment;
  }

  await synchronizePendingMedia(
    input.store,
    input.mediaTransport ?? getMediaTransport(),
    input.mediaStore,
  );

  const syncBatch = await synchronizePendingCaptures(
    input.store,
    input.captureTransport ?? getSyncTransport(),
  );

  const enrichBatch = await enrichPendingCaptures(
    input.store,
    input.enrichmentTransport,
    { retryFailed: input.retryFailed ?? true },
  );

  return {
    skippedOffline: false,
    capturesPushed: syncBatch.results.length,
    capturesFailed: syncBatch.failures.length,
    capturesImported,
    enrichmentResults: enrichBatch.results.length,
    requeuedForSync,
    requeuedForEnrichment,
  };
}

/**
 * Single foreground sync cycle: hydrate remote Threads, then drain the outbox
 * (media → Capture metadata → Enrichment). Serialized so home, chat, journal,
 * and SyncRuntime cannot race the same IDB.
 */
export function runSyncCycle(input: SyncCycleInput): Promise<SyncCycleResult> {
  const globals = globalThis as SyncCycleGlobals;
  if (globals.__WT_SYNC_CYCLE_INFLIGHT__) {
    return globals.__WT_SYNC_CYCLE_INFLIGHT__;
  }

  const work = executeSyncCycle(input)
    .then((result) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SYNC_CYCLE_EVENT, { detail: result }),
        );
      }
      return result;
    })
    .finally(() => {
      globals.__WT_SYNC_CYCLE_INFLIGHT__ = null;
    });

  globals.__WT_SYNC_CYCLE_INFLIGHT__ = work;
  return work;
}

export function resetSyncCycleForTests(): void {
  (globalThis as SyncCycleGlobals).__WT_SYNC_CYCLE_INFLIGHT__ = null;
}
