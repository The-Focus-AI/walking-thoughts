import { expect, test } from "@playwright/test";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";

test("loadThreadEnrichments preserves a non-empty cache when the network returns empty", async () => {
  const threadId = `thread-${crypto.randomUUID()}`;
  const cached: ThreadEnrichment[] = [
    {
      id: "e1",
      threadId,
      text: "Keep me",
      model: "test",
      basisRevision: 1,
      basisEntryIds: ["c1"],
      targetCaptureIds: ["c1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      sources: [],
    },
  ];

  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;

  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
  memory.set(`wt-thread-enrichments:${threadId}`, JSON.stringify(cached));

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ enrichments: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const loaded = await loadThreadEnrichments(threadId);
    expect(loaded).toEqual(cached);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  }
});
