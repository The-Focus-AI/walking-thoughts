import type { CaptureSyncStatus } from "@/lib/local-capture/types";

export type SyncRollup = Record<CaptureSyncStatus, number>;

export function emptySyncRollup(): SyncRollup {
  return {
    saved_locally: 0,
    syncing: 0,
    enriching: 0,
    complete: 0,
    needs_attention: 0,
  };
}

/** Count Capture statuses for the glanceable sync footer (prototype Sync C). */
export function syncRollup(
  statuses: Iterable<CaptureSyncStatus>,
): SyncRollup {
  const counts = emptySyncRollup();
  for (const status of statuses) counts[status] += 1;
  return counts;
}

export function pendingSyncCount(rollup: SyncRollup): number {
  return (
    rollup.saved_locally +
    rollup.syncing +
    rollup.enriching +
    rollup.needs_attention
  );
}

export function syncFooterSummary(
  rollup: SyncRollup,
  options?: { running?: boolean },
): string {
  if (options?.running) return "Sync running…";
  const pending = pendingSyncCount(rollup);
  const total =
    pending + rollup.complete;
  if (total === 0) return "No Captures yet";
  if (pending === 0) return "All Captures synced";
  return `Working on ${pending} of ${total}`;
}
