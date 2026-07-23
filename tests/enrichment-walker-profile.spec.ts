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
import { applyMemoryPatch } from "@/lib/memory/patches";
import { EMPTY_PROFILE_HINT } from "@/lib/memory/profile";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-walker-profile-tests";

let idCounter = 0;
const clock = {
  now: () => "2026-07-20T10:00:00.000Z",
  createId: () => `patch-${++idCounter}`,
};

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
  resetMemoryWalkerMemoryRepository(NS);
  idCounter = 0;
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

test("Enrichment prompts carry the walker profile with Memory ids", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const memories = createMemoryWalkerMemoryRepository(NS);
  await seedCapture(threads);
  await applyMemoryPatch(
    memories,
    "user_a",
    {
      op: "add",
      memoryId: "mem-1",
      category: "expertise",
      content: "Already knows common Pacific Northwest raptors",
      source: "interview",
      sourceId: "turn-1",
    },
    clock,
  );

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
    "- [mem-1] (expertise) Already knows common Pacific Northwest raptors",
  );
});

test("no Memories yet still tells the model the memory_patch tool exists", async () => {
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

  expect(seenPrompt).toContain(EMPTY_PROFILE_HINT);
});

test("memory_patch calls during an Enrichment land in the log and on the report", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const memories = createMemoryWalkerMemoryRepository(NS);
  await seedCapture(threads);

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      const applied = await input.memory?.apply({
        op: "add",
        category: "interest",
        content: "Keeps noticing owls at dusk",
      });
      expect(applied?.ok).toBe(true);
      const rejected = await input.memory?.apply({
        op: "update",
        memoryId: "not-a-memory",
        content: "x",
      });
      expect(rejected).toEqual({ ok: false, error: "memory_not_found" });
      return { text: "TITLE: Dusk owl\nReport body" };
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    memoryRepository: memories,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  });

  const threadId = result.results[0]?.threadId ?? "";
  const patches = await memories.listPatches("user_a");
  expect(patches).toHaveLength(1);
  expect(patches[0].source).toBe("enrichment");
  expect(patches[0].sourceId).toBe(threadId);
  expect(patches[0].after).toBe("Keeps noticing owls at dusk");

  const stored = await enrichment.listThreadEnrichments("user_a", threadId);
  expect(stored[0]?.memoryPatches).toEqual([
    {
      patchId: patches[0].id,
      op: "add",
      category: "interest",
      content: "Keeps noticing owls at dusk",
    },
  ]);
});

test("a Memory outage still produces the Enrichment, just untailored", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedCapture(threads);

  let toolAnswer: unknown;
  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      toolAnswer = await input.memory?.apply({
        op: "add",
        category: "interest",
        content: "Should not land",
      });
      return { text: "TITLE: Dusk owl\nReport body" };
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    memoryRepository: {
      async listMemories() {
        throw new Error("memory_store_down");
      },
      async listPatches() {
        throw new Error("memory_store_down");
      },
      async appendPatch() {
        throw new Error("memory_store_down");
      },
    },
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  });

  expect(result.results[0]?.status).toBe("complete");
  expect(toolAnswer).toEqual({ ok: false, error: "memory_unavailable" });
});
