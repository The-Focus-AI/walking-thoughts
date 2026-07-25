import { expect, test } from "@playwright/test";
import { fetchWithTimeout, isTimeoutError } from "@/lib/net/timeout";

/**
 * Public seam: spotty-trail networking. navigator.onLine only catches
 * airplane mode — a one-bar connection passes every online check, so every
 * client request needs a deadline that fails it into the local-first path.
 */

function stalledFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(
          init.signal?.reason ??
            new DOMException("stalled", "TimeoutError"),
        ),
      );
    })) as typeof fetch;
}

test("fetchWithTimeout abandons a stalled request instead of hanging", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stalledFetch();
  try {
    let caught: unknown = null;
    try {
      await fetchWithTimeout("https://example.test/slow", {}, 50);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(isTimeoutError(caught)).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithTimeout leaves a caller-provided signal in charge", async () => {
  const originalFetch = globalThis.fetch;
  let seenSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenSignal = init?.signal;
    return new Response("ok");
  }) as typeof fetch;
  try {
    const controller = new AbortController();
    await fetchWithTimeout("https://example.test/fast", {
      signal: controller.signal,
    });
    expect(seenSignal).toBe(controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
