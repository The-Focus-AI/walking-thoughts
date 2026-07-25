import { expect, test } from "@playwright/test";
import {
  collectGeneratedText,
  createFakeGatewayClient,
} from "@/lib/enrichment/gateway";
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

const NS = "enrichment-classification-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

test("header lines carry the title, kind, and topics off the body", () => {
  const parsed = parseGatewayText(
    [
      "TITLE: Token pool as a billing backend",
      "KIND: idea",
      "TOPICS: token-billing, LiteLLM, focus.ai, token-billing, extra, more",
      "",
      "**The idea.** A shared token backend other projects plug into.",
    ].join("\n"),
    true,
  );

  expect(parsed.title).toBe("Token pool as a billing backend");
  expect(parsed.kind).toBe("idea");
  // Slugged, de-duplicated, and capped at four.
  expect(parsed.topics).toEqual([
    "token-billing",
    "litellm",
    "focus-ai",
    "extra",
  ]);
  expect(parsed.text).toBe(
    "**The idea.** A shared token backend other projects plug into.",
  );
});

test("a report with no headers keeps its whole body", () => {
  const parsed = parseGatewayText("Mist sits in the valley this morning.", true);

  expect(parsed.title).toBeNull();
  expect(parsed.kind).toBeNull();
  expect(parsed.topics).toEqual([]);
  expect(parsed.text).toBe("Mist sits in the valley this morning.");
});

test("an invented kind leaves the Thread unclassified", () => {
  const parsed = parseGatewayText(
    ["KIND: shopping-list", "", "Body."].join("\n"),
    false,
  );

  expect(parsed.kind).toBeNull();
  expect(parsed.text).toBe("Body.");
});

test("a title is only taken when the Thread asked for one", () => {
  const parsed = parseGatewayText(
    ["TITLE: Ignore me", "KIND: place", "", "Body."].join("\n"),
    false,
  );

  expect(parsed.title).toBeNull();
  expect(parsed.kind).toBe("place");
  expect(parsed.text).toBe("Body.");
});

test("the report survives a tool call made after it was written", () => {
  // The AI SDK's result.text is the last step only. Production reduced five
  // Enrichments to their closing sentence this way.
  const steps = [
    { text: "**The idea.** A shared token backend, billed per user." },
    { text: "" },
    { text: "Saved the token-pool idea to your profile for future walks." },
  ];

  const text = collectGeneratedText(steps, steps[2].text);

  expect(text).toContain("A shared token backend");
  expect(text).toContain("Saved the token-pool idea");
});

test("a single-step generation is unchanged", () => {
  expect(collectGeneratedText([{ text: "Just the report." }], "Just the report."))
    .toBe("Just the report.");
  expect(collectGeneratedText([], "Fallback only.")).toBe("Fallback only.");
});

test("the Thread's kind and topics are stored with its Enrichment", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-idea",
      text: "We should build pool as a token back end for various projects",
      createdAt: "2026-07-24T09:52:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-idea",
      attachments: [],
    },
  ]);

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "**The idea.** A shared token backend.",
      title: "Token pool as a billing backend",
      kind: "idea" as const,
      topics: ["token-billing", "litellm"],
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");

  const threadId = result.results[0]!.threadId;
  const stored = await enrichment.listThreadEnrichments("user_a", threadId);
  expect(stored[0]?.kind).toBe("idea");
  expect(stored[0]?.topics).toEqual(["token-billing", "litellm"]);

  // And the Thread itself carries the verdict, so a queue can group by kind
  // without reading every report.
  const thread = (await threads.listThreads("user_a")).find(
    (candidate) => candidate.id === threadId,
  );
  expect(thread?.kind).toBe("idea");
  expect(thread?.topics).toEqual(["token-billing", "litellm"]);
});
