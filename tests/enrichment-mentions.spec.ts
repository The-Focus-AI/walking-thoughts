import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { parseGatewayText } from "@/lib/enrichment/system-instruction";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

/**
 * The Enrichment says what the walk was about — the recurring nouns — and
 * what the walker might ask next. Both ride the same header channel the
 * title and kind already use, and both are optional: a Thread that mentions
 * nothing nameable is not a failed job.
 */

const NS = "enrichment-mentions-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

test("mentions carry a kind, a name, and a key that groups them", () => {
  const parsed = parseGatewayText(
    [
      "TITLE: Barred owl over the reservoir",
      "KIND: observation",
      "MENTIONS: species:Barred owl, place:Cornwall Market, Remotion, idea:programmatic video",
      "",
      "Body.",
    ].join("\n"),
    true,
  );

  expect(parsed.mentions).toEqual([
    { name: "Barred owl", slug: "barred-owl", kind: "species" },
    { name: "Cornwall Market", slug: "cornwall-market", kind: "place" },
    // A bare noun keeps its name; the kind is simply unknown.
    { name: "Remotion", slug: "remotion", kind: null },
    { name: "programmatic video", slug: "programmatic-video", kind: "idea" },
  ]);
});

test("suggested questions split on the pipe, so a question may contain a comma", () => {
  const parsed = parseGatewayText(
    [
      "KIND: idea",
      "QUESTIONS: How long does a render take? | Does it work offline, or only on a server? | Can it read the Thread history?",
      "",
      "Body.",
    ].join("\n"),
    false,
  );

  expect(parsed.suggestedQuestions).toEqual([
    "How long does a render take?",
    "Does it work offline, or only on a server?",
    "Can it read the Thread history?",
  ]);
});

test("an invented mention kind keeps the noun, and repeats collapse", () => {
  const parsed = parseGatewayText(
    [
      "MENTIONS: constellation:Orion, species:Barred owl, species:barred owl, ",
      "",
      "Body.",
    ].join("\n"),
    false,
  );

  // "constellation:Orion" is not a kind we know — the whole string stays as
  // the name rather than being thrown away.
  expect(parsed.mentions[0]).toEqual({
    name: "constellation:Orion",
    slug: "constellation-orion",
    kind: null,
  });
  // Same slug, one row.
  expect(parsed.mentions).toHaveLength(2);
});

test("a report with neither header stores empty lists, never a failure", () => {
  const parsed = parseGatewayText("Mist sits in the valley.", false);
  expect(parsed.mentions).toEqual([]);
  expect(parsed.suggestedQuestions).toEqual([]);
});

test("mentions and questions reach the stored Enrichment and survive a re-read", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-owl",
      text: "Barred owl over the reservoir again",
      createdAt: "2026-08-04T08:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-owl",
      attachments: [],
    },
  ]);

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "The third sighting this month.",
      title: "Barred owl over the reservoir",
      kind: "observation" as const,
      mentions: [
        { name: "Barred owl", slug: "barred-owl", kind: "species" as const },
        { name: "The reservoir", slug: "the-reservoir", kind: "place" as const },
      ],
      suggestedQuestions: ["Do barred owls hold a territory this small?"],
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const stored = await enrichment.listThreadEnrichments(
    "user_a",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.mentions).toEqual([
    { name: "Barred owl", slug: "barred-owl", kind: "species" },
    { name: "The reservoir", slug: "the-reservoir", kind: "place" },
  ]);
  expect(stored[0]?.suggestedQuestions).toEqual([
    "Do barred owls hold a territory this small?",
  ]);
});

test("an Enrichment that names nothing stores empty lists and still completes", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await threads.upsertCaptures("user_b", [
    {
      id: "cap-mist",
      text: "Mist in the valley",
      createdAt: "2026-08-04T08:10:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-mist",
      attachments: [],
    },
  ]);

  const result = await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Valley fog, burning off by nine.",
      kind: "place" as const,
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const stored = await enrichment.listThreadEnrichments(
    "user_b",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.mentions).toEqual([]);
  expect(stored[0]?.suggestedQuestions).toEqual([]);
});
