import type { SyncRollup } from "./rollup";

export type PillTone = "ready" | "busy" | "attention" | "offline";

/**
 * Glanceable Days pill. A refused session outranks queue depth: nothing
 * will move until the walker signs in, and "Syncing 1…" would be a lie.
 */
export function syncPillView(
  rollup: SyncRollup,
  online: boolean,
  authBlocked: boolean,
): { label: string; tone: PillTone } {
  // Only what has not reached the server counts as "syncing". A Capture
  // in "enriching" is uploaded and waiting on the model queue.
  const uploading = rollup.saved_locally + rollup.syncing;
  if (authBlocked && online) {
    return { label: "Sign in to sync", tone: "attention" };
  }
  if (rollup.needs_attention > 0) {
    return {
      label: `${rollup.needs_attention} need attention`,
      tone: "attention",
    };
  }
  if (!online) {
    return {
      label: uploading > 0 ? `Offline · ${uploading} on phone` : "Offline",
      tone: "offline",
    };
  }
  if (uploading > 0) {
    return { label: `Syncing ${uploading}…`, tone: "busy" };
  }
  if (rollup.enriching > 0) {
    return { label: `${rollup.enriching} enriching`, tone: "busy" };
  }
  return { label: "All synced", tone: "ready" };
}
