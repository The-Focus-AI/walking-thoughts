import type { ThreadEnrichment } from "./types";

const CACHE_PREFIX = "wt-thread-enrichments:";

function readCache(threadId: string): ThreadEnrichment[] {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${threadId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ThreadEnrichment[];
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
 * Thread Enrichments for review surfaces: fetched from the server when
 * online and retained locally so a previously reviewed Thread keeps its
 * Enrichments, sources, and models readable in airplane mode.
 */
export async function loadThreadEnrichments(
  threadId: string,
): Promise<ThreadEnrichment[]> {
  try {
    const headers: Record<string, string> = {};
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
    const response = await fetch(`/api/enrichment/threads/${threadId}`, {
      headers,
    });
    if (!response.ok) return readCache(threadId);
    const body = (await response.json()) as { enrichments?: ThreadEnrichment[] };
    const enrichments = body.enrichments ?? [];
    writeCache(threadId, enrichments);
    return enrichments;
  } catch {
    return readCache(threadId);
  }
}
