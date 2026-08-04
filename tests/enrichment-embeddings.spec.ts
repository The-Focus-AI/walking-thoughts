import { expect, test } from "@playwright/test";
import {
  createFakeEmbeddingClient,
  embeddableText,
  getSelectedEmbeddingModel,
} from "@/lib/enrichment/embeddings";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

/**
 * Every Thread remembers what it reads like, as a step after the report
 * lands. The embedding is a convenience the desk offers — it may never cost
 * the walker a report they were waiting for.
 */

const NS = "enrichment-embeddings-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

async function seedCapture(
  threads: ReturnType<typeof createMemoryThreadRepository>,
  userId: string,
  id: string,
  text: string,
  at: string,
) {
  await threads.upsertCaptures(userId, [
    {
      id,
      text,
      createdAt: at,
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
}

test("the model is configuration, not a constant", () => {
  expect(getSelectedEmbeddingModel({})).toBe("openai/text-embedding-3-small");
  expect(
    getSelectedEmbeddingModel({ AI_GATEWAY_EMBEDDING_MODEL: "voyage/v3" }),
  ).toBe("voyage/v3");
  // Blank is not a choice.
  expect(getSelectedEmbeddingModel({ AI_GATEWAY_EMBEDDING_MODEL: "  " })).toBe(
    "openai/text-embedding-3-small",
  );
});

test("a Thread embeds from the walker's words and the report together", () => {
  expect(
    embeddableText({
      captureTexts: ["Barred owl again", "  "],
      enrichmentText: "The third sighting this month.",
    }),
  ).toBe("Barred owl again\n\nThe third sighting this month.");
  expect(embeddableText({ captureTexts: [], enrichmentText: null })).toBe("");
  expect(
    embeddableText({ captureTexts: ["x".repeat(50)], limit: 10 }),
  ).toHaveLength(10);
});

test("the embedding lands with the job, and finds the Thread it reads like", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const embeddings = createFakeEmbeddingClient();

  await seedCapture(
    threads,
    "user_a",
    "cap-owl",
    "Barred owl over the reservoir at dusk",
    "2026-08-01T08:00:00.000Z",
  );
  await seedCapture(
    threads,
    "user_a",
    "cap-owl-again",
    "Barred owl over the reservoir again this morning",
    "2026-08-04T08:00:00.000Z",
  );
  await seedCapture(
    threads,
    "user_a",
    "cap-market",
    "Cornwall Market renovation hoarding is up",
    "2026-08-04T09:00:00.000Z",
  );

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "A report about what was seen.",
      kind: "observation" as const,
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    embeddings,
    pushSender: null,
  });

  expect(result.results.every((entry) => entry.status === "complete")).toBe(
    true,
  );

  const byCapture = new Map(
    result.results.map((entry) => [entry.id, entry.threadId]),
  );
  const owl = byCapture.get("cap-owl")!;
  const owlAgain = byCapture.get("cap-owl-again")!;

  // Every Thread was embedded as part of its own job.
  const embedded = await enrichment.listEmbeddedThreadIds!(
    "user_a",
    embeddings.model,
  );
  expect(embedded).toHaveLength(3);

  // The two owl Threads read alike; the market Thread does not.
  const similar = await enrichment.findSimilarThreads!("user_a", owlAgain);
  expect(similar[0]?.threadId).toBe(owl);
  expect(similar[0]?.score).toBeGreaterThan(similar[1]?.score ?? 0);
});

test("an embedding that throws costs the Thread its priors, never its report", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await seedCapture(
    threads,
    "user_b",
    "cap-fail",
    "Something worth researching",
    "2026-08-04T08:00:00.000Z",
  );

  const result = await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "The report that must survive.",
      kind: "question" as const,
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    embeddings: {
      model: "broken/model",
      async embed() {
        throw new Error("gateway down");
      },
    },
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const stored = await enrichment.listThreadEnrichments(
    "user_b",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.text).toBe("The report that must survive.");
  // Nothing embedded, and nothing similar — a first sighting, not an error.
  expect(
    await enrichment.findSimilarThreads!(
      "user_b",
      result.results[0]!.threadId,
    ),
  ).toEqual([]);
});

test("vectors from another model are never compared across the gap", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await enrichment.storeThreadEmbedding!("user_c", "thread-a", {
    model: "model-one",
    vector: [1, 0, 0],
  });
  await enrichment.storeThreadEmbedding!("user_c", "thread-b", {
    model: "model-one",
    vector: [0.9, 0.1, 0],
  });
  await enrichment.storeThreadEmbedding!("user_c", "thread-c", {
    model: "model-two",
    vector: [1, 0, 0],
  });

  const similar = await enrichment.findSimilarThreads!("user_c", "thread-a");
  expect(similar.map((entry) => entry.threadId)).toEqual(["thread-b"]);

  // Re-embedding replaces rather than accumulating.
  await enrichment.storeThreadEmbedding!("user_c", "thread-b", {
    model: "model-one",
    vector: [0, 1, 0],
  });
  const after = await enrichment.findSimilarThreads!("user_c", "thread-a");
  expect(after[0]?.score).toBeCloseTo(0);
});
