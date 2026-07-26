import { trackedFetch } from "@/lib/sync/session-state";
import type { ArtifactSummary } from "./types";

const CACHE_KEY = "wt-artifacts";

function headers(): Record<string, string> {
  const result: Record<string, string> = {};
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) result["x-walking-thoughts-test-user"] = testUser;
  return result;
}

function readCache(): ArtifactSummary[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArtifactSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(artifacts: ArtifactSummary[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(artifacts));
  } catch {
    // Quota pressure only loses the offline copy of server data.
  }
}

/** The retained list, painted before the network answers (and offline). */
export function readCachedArtifacts(): ArtifactSummary[] {
  return readCache();
}

/** Which Threads have a published page, keyed for the list pane. */
export function artifactsByThread(
  artifacts: ArtifactSummary[],
): Map<string, ArtifactSummary> {
  const byThread = new Map<string, ArtifactSummary>();
  for (const artifact of artifacts) {
    const existing = byThread.get(artifact.threadId);
    // Newest page wins when a Thread has been published more than once.
    if (!existing || existing.createdAt < artifact.createdAt) {
      byThread.set(artifact.threadId, artifact);
    }
  }
  return byThread;
}

/**
 * Every published Artifact, one request for the whole desk, retained so a
 * Thread that has a page still says so in airplane mode.
 */
export async function loadArtifacts(): Promise<ArtifactSummary[]> {
  try {
    const response = await trackedFetch("/api/artifacts", {
      headers: headers(),
    });
    if (!response.ok) return readCache();
    const body = (await response.json()) as { artifacts?: ArtifactSummary[] };
    const artifacts = body.artifacts ?? [];
    // An empty payload during an API blip must not un-publish the desk.
    if (artifacts.length === 0) {
      const cached = readCache();
      if (cached.length > 0) return cached;
    }
    writeCache(artifacts);
    return artifacts;
  } catch {
    return readCache();
  }
}

/**
 * Publish this Thread's newest Enrichment as a page, on the walker's word.
 * With `republish`, the page is written again over the one already stored —
 * how a report published under an older layout gets rebuilt.
 */
export async function publishArtifact(
  threadId: string,
  options: { republish?: boolean } = {},
): Promise<ArtifactSummary | null> {
  try {
    const response = await trackedFetch("/api/artifacts/publish", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ threadId, republish: options.republish ?? false }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { artifact?: ArtifactSummary };
    return body.artifact ?? null;
  } catch {
    return null;
  }
}

/** The browsable URL of a published page. */
export function artifactHref(artifactId: string): string {
  return `/artifacts/${encodeURIComponent(artifactId)}`;
}
