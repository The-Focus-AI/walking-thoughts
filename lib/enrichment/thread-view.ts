import type { ThreadEnrichment } from "./types";

const CACHE_PREFIX = "wt-thread-enrichments:";

function normalize(enrichments: ThreadEnrichment[]): ThreadEnrichment[] {
  // Older cached payloads predate `sources`; `research` stays optional.
  return enrichments.map((enrichment) => ({
    ...enrichment,
    sources: enrichment.sources ?? [],
  }));
}

function readCache(threadId: string): ThreadEnrichment[] {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${threadId}`);
    if (!raw) return [];
    return normalize(JSON.parse(raw) as ThreadEnrichment[]);
  } catch {
    return [];
  }
}

function writeCache(threadId: string, enrichments: ThreadEnrichment[]): void {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${threadId}`,
      JSON.stringify(enrichments),
    );
  } catch {
    // Quota pressure only loses the offline copy of server data.
  }
}

/**
 * The locally retained copy of a Thread's Enrichments, without touching the
 * network. Lets review surfaces paint instantly (and offline) before a
 * background refresh replaces it with the server's answer.
 */
export function readCachedThreadEnrichments(
  threadId: string,
): ThreadEnrichment[] {
  return readCache(threadId);
}

function enrichmentHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
  return headers;
}

/**
 * Server Enrichments only — no localStorage fallback. Used by sync recovery
 * so an empty server response can re-queue orphan Completes.
 * Returns null when the network/API is unavailable.
 */
export async function fetchThreadEnrichmentsFromNetwork(
  threadId: string,
): Promise<ThreadEnrichment[] | null> {
  try {
    const response = await fetch(`/api/enrichment/threads/${threadId}`, {
      headers: enrichmentHeaders(),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { enrichments?: ThreadEnrichment[] };
    return normalize(body.enrichments ?? []);
  } catch {
    return null;
  }
}

/**
 * Thread Enrichments for review surfaces: fetched from the server when
 * online and retained locally so a previously reviewed Thread keeps its
 * Enrichments, sources, and models readable in airplane mode.
 */
export async function loadThreadEnrichments(
  threadId: string,
): Promise<ThreadEnrichment[]> {
  try {
    const response = await fetch(`/api/enrichment/threads/${threadId}`, {
      headers: enrichmentHeaders(),
    });
    if (!response.ok) return readCache(threadId);
    const body = (await response.json()) as { enrichments?: ThreadEnrichment[] };
    const enrichments = normalize(body.enrichments ?? []);
    // Empty network payloads must not wipe a previously reviewed Thread —
    // common during brief API blips or after a memory-only server window.
    if (enrichments.length === 0) {
      const cached = readCache(threadId);
      if (cached.length > 0) return cached;
    }
    writeCache(threadId, enrichments);
    return enrichments;
  } catch {
    return readCache(threadId);
  }
}
