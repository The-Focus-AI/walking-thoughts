import type { ServerThread } from "./types";

export type ThreadsTransport = {
  listThreads(): Promise<ServerThread[] | { unavailable: true }>;
};

type ThreadsGlobals = typeof globalThis & {
  __WT_THREADS_TRANSPORT__?: ThreadsTransport;
};

function defaultTransport(): ThreadsTransport {
  const headers = (): HeadersInit => {
    const result: Record<string, string> = {};
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) {
      result["x-walking-thoughts-test-user"] = testUser;
    }
    return result;
  };

  return {
    async listThreads() {
      try {
        const response = await fetch("/api/sync/threads", {
          headers: headers(),
        });
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 503
        ) {
          return { unavailable: true };
        }
        if (!response.ok) return { unavailable: true };
        const body = (await response.json()) as { threads?: ServerThread[] };
        return body.threads ?? [];
      } catch {
        return { unavailable: true };
      }
    },
  };
}

export function getThreadsTransport(): ThreadsTransport {
  return (
    (globalThis as ThreadsGlobals).__WT_THREADS_TRANSPORT__ ?? defaultTransport()
  );
}

/** Flatten server Thread Captures into an id set for recovery checks. */
export function serverCaptureIdSet(
  threads: ServerThread[],
): Set<string> {
  const ids = new Set<string>();
  for (const thread of threads) {
    for (const capture of thread.captures) {
      ids.add(capture.id);
    }
  }
  return ids;
}
