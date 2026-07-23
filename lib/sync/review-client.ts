export type ReviewTransport = {
  setReviewed(
    threadId: string,
    reviewed: boolean,
  ): Promise<{ threadId: string; reviewedAt: string | null } | null>;
};

type ReviewGlobals = typeof globalThis & {
  __WT_REVIEW_TRANSPORT__?: ReviewTransport;
};

function defaultTransport(): ReviewTransport {
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
    async setReviewed(threadId, reviewed) {
      try {
        const response = await fetch("/api/sync/review", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ threadId, reviewed }),
        });
        if (!response.ok) return null;
        return (await response.json()) as {
          threadId: string;
          reviewedAt: string | null;
        };
      } catch {
        return null;
      }
    },
  };
}

export function getReviewTransport(): ReviewTransport {
  return (
    (globalThis as ReviewGlobals).__WT_REVIEW_TRANSPORT__ ?? defaultTransport()
  );
}
