/**
 * Trail networking: a request that cannot finish must fail, not hang.
 * `navigator.onLine` only catches airplane mode — one bar of signal passes
 * every online check and then stalls forever without a deadline. Client
 * fetches go through here so spotty coverage degrades into the same
 * local-first fallbacks as being fully offline.
 */

/** Ceiling for small JSON round-trips on a weak connection. */
export const API_TIMEOUT_MS = 20_000;

/** Model-backed asks (Enrichment, digest, interview) legitimately run long. */
export const MODEL_TIMEOUT_MS = 75_000;

/** Media blobs on one bar: generous, but still bounded. */
export const MEDIA_TIMEOUT_MS = 120_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

/** True when a fetch failed because its deadline (or an abort) fired. */
export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
