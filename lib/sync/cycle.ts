import { enrichPendingCaptures, type EnrichmentTransport } from "@/lib/enrichment/client";
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

export type SyncCycleResult = {
  skippedOffline: boolean;
  capturesPushed: number;
  capturesFailed: number;
  enrichmentResults: number;
};

export type SyncCycleInput = {
  store: CaptureStore;
  online?: boolean;
  mediaTransport?: MediaTransport;
  mediaStore?: MediaStore;
  captureTransport?: SyncTransport;
  enrichmentTransport?: EnrichmentTransport;
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
      enrichmentResults: 0,
    };
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
    enrichmentResults: enrichBatch.results.length,
  };
}

/**
 * Single foreground outbox drain: media → Capture metadata → Enrichment.
 * Serialized so home, chat, journal, and SyncRuntime cannot race the same IDB.
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
