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
  __WT_SYNC_AUTH_MUTATING_REFUSED__?: boolean;
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

function isMutatingMethod(method?: string): boolean {
  if (!method) return true;
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD";
}

/**
 * Record what the server said about a sync request. 401/403 means the session
 * itself was refused. A successful mutating call (POST Capture metadata,
 * Enrichment process, media upload) proves the session can do work again.
 * A successful GET must not clear a refused POST — hydrate answering 200
 * while process still 401s is how Days showed "Syncing N…" instead of
 * "Sign in to sync". A 5xx or a timeout says nothing either way.
 */
export function noteSyncStatus(
  status: number,
  request: { method?: string } = {},
): void {
  const store = globals();
  const mutating = isMutatingMethod(request.method);
  if (status === 401 || status === 403) {
    if (mutating) store.__WT_SYNC_AUTH_MUTATING_REFUSED__ = true;
    publish(true);
    return;
  }
  if (status < 500) {
    if (mutating) {
      store.__WT_SYNC_AUTH_MUTATING_REFUSED__ = false;
      publish(false);
      return;
    }
    if (!store.__WT_SYNC_AUTH_MUTATING_REFUSED__) {
      publish(false);
    }
  }
}

export function resetSyncAuthForTests(): void {
  const store = globals();
  store.__WT_SYNC_AUTH_BLOCKED__ = false;
  store.__WT_SYNC_AUTH_MUTATING_REFUSED__ = false;
}

/**
 * `fetchWithTimeout` that watches for a refused session. Sync transports go
 * through here so no caller has to remember to report.
 */
function requestMethod(input: RequestInfo | URL, init: RequestInit): string {
  if (init.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method;
  }
  return "GET";
}

export async function trackedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const response = await fetchWithTimeout(input, init, timeoutMs);
  noteSyncStatus(response.status, { method: requestMethod(input, init) });
  return response;
}
