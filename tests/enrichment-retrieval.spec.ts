import { expect, test } from "@playwright/test";
import { createFakeEmbeddingClient } from "@/lib/enrichment/embeddings";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  formatPriorThreads,
  mentionsInText,
} from "@/lib/enrichment/retrieval";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

/**
 * Research stops starting cold: what the walk already worked out about the
 * same things reaches the prompt before the report is written. It is a head
 * start, never a precondition — a Capture with no history, or a retrieval
 * that fails, must produce exactly the report the app wrote yesterday.
 */

const NS = "enrichment-retrieval-tests";

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

/** Enrich one Capture and hand back the prompt the gateway was given. */
async function enrichCapturingPrompt(
  userId: string,
  threads: ReturnType<typeof createMemoryThreadRepository>,
  enrichment: ReturnType<typeof createMemoryEnrichmentRepository>,
  reply: Parameters<typeof createFakeGatewayClient>[0] extends undefined
    ? never
    : Awaited<ReturnType<NonNullable<Parameters<typeof createFakeGatewayClient>[0]>>>,
  options: { embeddings?: ReturnType<typeof createFakeEmbeddingClient> } = {},
): Promise<{ prompts: string[] }> {
  const prompts: string[] = [];
  await processPendingEnrichments(userId, enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      prompts.push(input.prompt);
      return reply;
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    embeddings: options.embeddings,
    pushSender: null,
  });
  return { prompts };
}

test("a Capture with a shared noun in its past gets that past in the prompt", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  // July: the walls get dated.
  await seedCapture(
    threads,
    "user_a",
    "cap-july",
    "How old is the stone wall along the reservoir?",
    "2026-07-04T08:00:00.000Z",
  );
  await enrichCapturingPrompt("user_a", threads, enrichment, {
    text: "Dry-laid, and the town survey puts these walls at 1840s.",
    title: "Dating the reservoir walls",
    kind: "question" as const,
    mentions: [
      { name: "The reservoir", slug: "the-reservoir", kind: "place" as const },
    ],
  });

  // August: the corner of the same wall.
  await seedCapture(
    threads,
    "user_a",
    "cap-august",
    "The reservoir wall corner has slumped since spring",
    "2026-08-04T08:00:00.000Z",
  );
  const { prompts } = await enrichCapturingPrompt(
    "user_a",
    threads,
    enrichment,
    {
      text: "Building on the July dating.",
      kind: "observation" as const,
    },
  );

  const prompt = prompts.at(-1)!;
  expect(prompt).toContain("Earlier Threads from this walker's own history");
  expect(prompt).toContain("Dating the reservoir walls");
  expect(prompt).toContain("walked 2026-07-04");
  expect(prompt).toContain("shares The reservoir");
});

test("a Capture with no history is prompted exactly as before retrieval existed", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await seedCapture(
    threads,
    "user_b",
    "cap-first",
    "First walk, nothing before it",
    "2026-08-04T08:00:00.000Z",
  );
  const { prompts } = await enrichCapturingPrompt(
    "user_b",
    threads,
    enrichment,
    { text: "A cold-start report.", kind: "place" as const },
  );

  expect(prompts).toHaveLength(1);
  expect(prompts[0]).not.toContain("Earlier Threads");
});

test("a retrieval that throws writes the cold-start report rather than failing", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await seedCapture(
    threads,
    "user_c",
    "cap-broken",
    "Something worth researching",
    "2026-08-04T08:00:00.000Z",
  );

  // The index itself is broken, which is the worst retrieval can do.
  const broken = {
    ...enrichment,
    async listThreadMentionIndex() {
      throw new Error("index unavailable");
    },
  };

  const prompts: string[] = [];
  const result = await processPendingEnrichments("user_c", broken, {
    gateway: createFakeGatewayClient(async (input) => {
      prompts.push(input.prompt);
      return { text: "The report that must still be written.", kind: "question" as const };
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  expect(prompts[0]).not.toContain("Earlier Threads");
  const stored = await enrichment.listThreadEnrichments(
    "user_c",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.text).toBe("The report that must still be written.");
});

test("a Thread that only reads alike is retrieved too, and says which it is", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const embeddings = createFakeEmbeddingClient();

  await seedCapture(
    threads,
    "user_d",
    "cap-owl-july",
    "Barred owl calling over the water at dusk",
    "2026-07-04T08:00:00.000Z",
  );
  await enrichCapturingPrompt(
    "user_d",
    threads,
    enrichment,
    { text: "A report with no mentions at all.", kind: "observation" as const },
    { embeddings },
  );

  await seedCapture(
    threads,
    "user_d",
    "cap-owl-august",
    "Barred owl calling over the water again",
    "2026-08-04T08:00:00.000Z",
  );
  const { prompts } = await enrichCapturingPrompt(
    "user_d",
    threads,
    enrichment,
    { text: "The second sighting.", kind: "observation" as const },
    { embeddings },
  );

  const prompt = prompts.at(-1)!;
  // Nothing was ever named, so the only link possible is the resemblance —
  // and the prompt says that is what it is.
  expect(prompt).toContain("Earlier Threads from this walker's own history");
  expect(prompt).toContain("reads alike");
});

test("the retrieved past is rendered with the reason each Thread is there", () => {
  expect(formatPriorThreads([])).toBeNull();
  const rendered = formatPriorThreads([
    {
      threadId: "t-1",
      title: "Dating the reservoir walls",
      dayKey: "2026-07-04",
      via: "mention",
      sharedMentions: ["The reservoir", "Dry stone"],
    },
    {
      threadId: "t-2",
      title: "Frost in the hollow",
      dayKey: "2026-06-01",
      via: "embedding",
      sharedMentions: [],
      score: 0.82,
    },
  ])!;

  expect(rendered).toContain("[thread t-1, walked 2026-07-04; shares The reservoir, Dry stone] Dating the reservoir walls");
  expect(rendered).toContain("[thread t-2, walked 2026-06-01; reads alike] Frost in the hollow");
  expect(rendered).toContain("say plainly which one you are building on");
});

test("a noun the corpus knows, used whole in the walker's own words, is an exact link", () => {
  const known = [
    { name: "The reservoir", slug: "the-reservoir", kind: "place" as const },
    { name: "Barred owl", slug: "barred-owl", kind: "species" as const },
    // Too short to mean anything; it would match half the corpus.
    { name: "Elm", slug: "elm", kind: "species" as const },
  ];

  expect(
    mentionsInText(known, ["The reservoir wall corner has slumped"]).map(
      (mention) => mention.slug,
    ),
  ).toEqual(["the-reservoir"]);

  // Whole words only: "owlet" is not the owl, and a short name is skipped
  // however often it appears.
  expect(mentionsInText(known, ["An owlet in the elm"])).toEqual([]);
  expect(
    mentionsInText(known, ["barred owl over THE RESERVOIR"]).map(
      (mention) => mention.slug,
    ),
  ).toEqual(["the-reservoir", "barred-owl"]);
});
