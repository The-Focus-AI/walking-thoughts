import type { CaptureStore } from "@/lib/local-capture/types";
import type { EnrichmentBatchResponse } from "./types";

export type EnrichmentTransport = {
  process(options?: { retryFailed?: boolean }): Promise<
    EnrichmentBatchResponse | { unavailable: true }
  >;
};

type EnrichmentGlobals = typeof globalThis & {
  __WT_ENRICHMENT_TRANSPORT__?: EnrichmentTransport;
};

function defaultTransport(): EnrichmentTransport {
  const headers = (): HeadersInit => {
    const result: Record<string, string> = {
      "content-type": "application/json",
    };
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) {
      result["x-walking-thoughts-test-user"] = testUser;
    }
    return result;
  };

  return {
    async process(options) {
      const response = await fetch("/api/enrichment/process", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ retryFailed: options?.retryFailed ?? false }),
      });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 503
      ) {
        return { unavailable: true };
      }
      if (!response.ok) {
        return {
          results: [],
          jobs: [],
        };
      }
      return (await response.json()) as EnrichmentBatchResponse;
    },
  };
}

export function getEnrichmentTransport(): EnrichmentTransport {
  return (
    (globalThis as EnrichmentGlobals).__WT_ENRICHMENT_TRANSPORT__ ??
    defaultTransport()
  );
}

export async function enrichPendingCaptures(
  store: CaptureStore,
  transport: EnrichmentTransport = getEnrichmentTransport(),
  options: { retryFailed?: boolean } = {},
): Promise<EnrichmentBatchResponse> {
  const pending = (await store.list()).filter(
    (capture) =>
      capture.status === "enriching" ||
      (options.retryFailed && capture.status === "needs_attention"),
  );
  if (pending.length === 0 && !options.retryFailed) {
    return { results: [], jobs: [] };
  }

  const result = await transport.process(options);
  if ("unavailable" in result) {
    return { results: [], jobs: [] };
  }

  await store.applyEnrichmentBatch({ results: result.results });
  return result;
}
