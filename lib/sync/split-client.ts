import type { ThreadSplitResult } from "./types";

export type SplitTransport = {
  splitThread(threadId: string): Promise<ThreadSplitResult | null>;
};

type SplitGlobals = typeof globalThis & {
  __WT_SPLIT_TRANSPORT__?: SplitTransport;
};

function defaultTransport(): SplitTransport {
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
    async splitThread(threadId) {
      try {
        const response = await fetch("/api/sync/split", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ threadId }),
        });
        if (!response.ok) return null;
        return (await response.json()) as ThreadSplitResult;
      } catch {
        return null;
      }
    },
  };
}

export function getSplitTransport(): SplitTransport {
  return (
    (globalThis as SplitGlobals).__WT_SPLIT_TRANSPORT__ ?? defaultTransport()
  );
}
