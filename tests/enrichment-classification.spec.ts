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

test("an unknown name becomes a question instead of a guess", () => {
  const parsed = parseGatewayText(
    [
      "TITLE: Scope of work for Goldin",
      "KIND: task",
      "TOPICS: goldin, scope-of-work",
      "ASK: Who is Goldin — a client, a project, or a person?",
      "",
      "I do not know who Goldin is, so I have not researched it.",
    ].join("\n"),
    true,
  );

  expect(parsed.kind).toBe("task");
  expect(parsed.ask).toBe(
    "Who is Goldin — a client, a project, or a person?",
  );
  expect(parsed.text).toBe(
    "I do not know who Goldin is, so I have not researched it.",
  );
});

test("an unclear kind leaves the Thread unclassified but keeps the question", () => {
  const parsed = parseGatewayText(
    ["KIND: unclear", "ASK: What does \"windwizer\" refer to?", "", "Body."].join(
      "\n",
    ),
    false,
  );

  expect(parsed.kind).toBeNull();
  expect(parsed.ask).toBe('What does "windwizer" refer to?');
});

test("a report with no headers keeps its whole body", () => {
  const parsed = parseGatewayText("Mist sits in the valley this morning.", true);

  expect(parsed.title).toBeNull();
  expect(parsed.kind).toBeNull();
  expect(parsed.topics).toEqual([]);
  expect(parsed.ask).toBeNull();
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

test("an open question rides on the Thread and a later Enrichment clears it", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobStore = createMemoryBlobStore(NS);

  await threads.upsertCaptures("user_b", [
    {
      id: "cap-goldin",
      text: "Goldin scope",
      createdAt: "2026-07-23T12:03:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-goldin",
      attachments: [],
    },
  ]);

  const asking = await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "I do not know who Goldin is.",
      title: "Goldin scope",
      kind: null,
      ask: "Who is Goldin?",
    })),
    blobStore,
    threadRepository: threads,
    pushSender: null,
  });
  const threadId = asking.results[0]!.threadId;

  const unresolved = (await threads.listThreads("user_b")).find(
    (candidate) => candidate.id === threadId,
  );
  expect(unresolved?.ask).toBe("Who is Goldin?");
  expect(unresolved?.kind).toBeNull();

  // The walker answers by replying in the Thread; the next report settles it.
  await threads.upsertCaptures("user_b", [
    {
      id: "cap-answer",
      text: "Goldin is a client — this is a scope of work for them",
      createdAt: "2026-07-23T18:00:00.000Z",
      location: null,
      threadId,
      sequence: 2,
      idempotencyKey: "cap-answer",
      attachments: [],
    },
  ]);
  await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Draft scope of work for the Goldin engagement.",
      kind: "task" as const,
      topics: ["goldin", "scope-of-work"],
    })),
    blobStore,
    threadRepository: threads,
    pushSender: null,
  });

  const settled = (await threads.listThreads("user_b")).find(
    (candidate) => candidate.id === threadId,
  );
  expect(settled?.ask).toBeNull();
  expect(settled?.kind).toBe("task");
});

test("an Enrichment that cannot tell leaves the prior kind standing", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await threads.upsertCaptures("user_c", [
    {
      id: "cap-known",
      text: "Where did we get the stones for the patio?",
      createdAt: "2026-07-22T10:11:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-known",
      attachments: [],
    },
  ]);
  const options = {
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  };
  const first = await processPendingEnrichments("user_c", enrichment, {
    ...options,
    gateway: createFakeGatewayClient(async () => ({
      text: "Call the yard.",
      title: "Sourcing stone",
      kind: "task" as const,
      topics: ["stone"],
    })),
  });
  const threadId = first.results[0]!.threadId;

  await threads.upsertCaptures("user_c", [
    {
      id: "cap-followup",
      text: "hm",
      createdAt: "2026-07-22T11:00:00.000Z",
      location: null,
      threadId,
      sequence: 2,
      idempotencyKey: "cap-followup",
      attachments: [],
    },
  ]);
  await processPendingEnrichments("user_c", enrichment, {
    ...options,
    gateway: createFakeGatewayClient(async () => ({
      text: "Not enough to go on.",
      ask: "What would you like to do with this?",
    })),
  });

  const thread = (await threads.listThreads("user_c")).find(
    (candidate) => candidate.id === threadId,
  );
  expect(thread?.kind).toBe("task");
  expect(thread?.topics).toEqual(["stone"]);
  expect(thread?.ask).toBe("What would you like to do with this?");
});
