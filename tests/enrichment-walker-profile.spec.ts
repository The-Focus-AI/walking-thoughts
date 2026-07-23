import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-walker-profile-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
  resetMemoryWalkerMemoryRepository(NS);
});

async function seedCapture(
  threads: ReturnType<typeof createMemoryThreadRepository>,
) {
  await threads.upsertCaptures("user_a", [
    {
      id: "cap-owl",
      text: "Large owl on a snag at dusk",
      createdAt: "2026-07-22T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-owl",
      attachments: [],
    },
  ]);
}

test("Enrichment prompts carry the walker profile built from Memories", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const memories = createMemoryWalkerMemoryRepository(NS);
  await seedCapture(threads);
  await memories.saveMemory("user_a", {
    id: "mem-1",
    category: "expertise",
    content: "Already knows common Pacific Northwest raptors",
    source: "interview",
    createdAt: "2026-07-20T10:00:00.000Z",
  });

  let seenPrompt = "";
  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      seenPrompt = input.prompt;
      return { text: "TITLE: Dusk owl\nReport body" };
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    memoryRepository: memories,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  });

  expect(result.results[0]?.status).toBe("complete");
  expect(seenPrompt).toContain("Walker profile");
  expect(seenPrompt).toContain(
    "(expertise) Already knows common Pacific Northwest raptors",
  );
});

test("no Memories leaves the Enrichment prompt untouched", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedCapture(threads);

  let seenPrompt = "";
  await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      seenPrompt = input.prompt;
      return { text: "TITLE: Dusk owl\nReport body" };
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    memoryRepository: createMemoryWalkerMemoryRepository(NS),
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  });

  expect(seenPrompt).not.toContain("Walker profile");
});

test("a Memory outage still produces the Enrichment, just untailored", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedCapture(threads);

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "TITLE: Dusk owl\nReport body",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    memoryRepository: {
      async listMemories() {
        throw new Error("memory_store_down");
      },
      async saveMemory() {
        throw new Error("memory_store_down");
      },
      async forgetMemory() {
        throw new Error("memory_store_down");
      },
    },
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  });

  expect(result.results[0]?.status).toBe("complete");
});
