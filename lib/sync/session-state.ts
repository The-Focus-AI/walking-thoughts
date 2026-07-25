import { fetchWithTimeout } from "@/lib/net/timeout";

/**
 * Every sync transport used to collapse 401/403/503 into one silent
 * "unavailable" and retry forever. A walker whose session had expired saw a
 * Capture sit on "Syncing" indefinitely with nothing to act on — the phone
 * kept posting, the server kept refusing, and no surface said so.
 *
 * A refused session is not a weak signal: it needs the walker, and it is the
 * one sync failure they can actually fix. Track it apart from being offline.
 */
export const SYNC_AUTH_EVENT = "wt:sync-auth";

type SessionGlobals = typeof globalThis & {
  __WT_SYNC_AUTH_BLOCKED__?: boolean;
};

function globals(): SessionGlobals {
  return globalThis as SessionGlobals;
}

function publish(blocked: boolean): void {
  const store = globals();
  if (store.__WT_SYNC_AUTH_BLOCKED__ === blocked) return;
  store.__WT_SYNC_AUTH_BLOCKED__ = blocked;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SYNC_AUTH_EVENT, { detail: { blocked } }),
    );
  }
}

/** True while the server is refusing this device's session. */
export function isSyncAuthBlocked(): boolean {
  return globals().__WT_SYNC_AUTH_BLOCKED__ === true;
}

/**
 * Record what the server said about a sync request. 401/403 means the session
 * itself was refused; any answer the server was willing to give means the
 * session works again. A 5xx or a timeout says nothing either way — the
 * session is not the thing that failed — so it leaves the flag alone.
 */
export function noteSyncStatus(status: number): void {
  if (status === 401 || status === 403) {
    publish(true);
    return;
  }
  if (status < 500) {
    publish(false);
  }
}

export function resetSyncAuthForTests(): void {
  globals().__WT_SYNC_AUTH_BLOCKED__ = false;
}

/**
 * `fetchWithTimeout` that watches for a refused session. Sync transports go
 * through here so no caller has to remember to report.
 */
export async function trackedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const response = await fetchWithTimeout(input, init, timeoutMs);
  noteSyncStatus(response.status);
  return response;
}
