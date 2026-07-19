import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
});

test("batches pending Captures, freezes basis, and stays idempotent on replay", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const gateway = createFakeGatewayClient(async ({ model, requestTitle }) => ({
    text: requestTitle
      ? "TITLE: Creek owl\nLikely a barred owl near water."
      : "Follow-up enrichment",
    model,
    title: requestTitle ? "Creek owl" : null,
  }));

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "Barred owl call",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
    },
    {
      id: "cap-2",
      text: "Same creek bend",
      createdAt: "2026-07-18T12:01:00.000Z",
      location: null,
      threadId: "cap-1",
      sequence: 2,
      idempotencyKey: "cap-2",
    },
  ]);

  const first = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  expect(first.results).toHaveLength(2);
  expect(first.results.every((result) => result.status === "complete")).toBe(
    true,
  );
  expect(first.results[0]?.threadTitle).toBe("Creek owl");

  const listed = await enrichment.listPendingThreads("user_a");
  expect(listed[0]?.enrichmentCount).toBe(1);
  expect(listed[0]?.title).toBe("Creek owl");
  expect(
    listed[0]?.entries.filter((entry) => entry.kind === "enrichment"),
  ).toHaveLength(1);

  // Capture after freeze becomes a later Enrichment.
  await threads.upsertCaptures("user_a", [
    {
      id: "cap-3",
      text: "Heard again at dusk",
      createdAt: "2026-07-18T12:10:00.000Z",
      location: null,
      threadId: "cap-1",
      sequence: 3,
      idempotencyKey: "cap-3",
    },
  ]);

  const second = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  expect(second.results.map((result) => result.id)).toEqual(["cap-3"]);
  const after = await enrichment.listPendingThreads("user_a");
  expect(after[0]?.enrichmentCount).toBe(2);

  // Replay complete job path via second process with nothing pending.
  const idle = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  expect(idle.results).toEqual([]);
  expect(
    (await enrichment.listPendingThreads("user_a"))[0]?.enrichmentCount,
  ).toBe(2);
});

test("frozen basis history excludes Captures appended after the job was queued", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const seenPrompts: string[] = [];
  const gateway = createFakeGatewayClient(async ({ prompt, model }) => {
    seenPrompts.push(prompt);
    return { text: `ok via ${model}`, model, title: null };
  });

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "First sighting",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: "trail",
      sequence: 1,
      idempotencyKey: "cap-1",
    },
  ]);

  // Queue the job without running the gateway by creating it directly after sync.
  const snapshots = await enrichment.listPendingThreads("user_a");
  const trail = snapshots.find((thread) => thread.id === "trail");
  expect(trail).toBeTruthy();
  await enrichment.getOrCreateJob("user_a", {
    id: "job-freeze",
    idempotencyKey: `enrich:trail:r${trail!.revision}`,
    threadId: "trail",
    basisRevision: trail!.revision,
    basisEntryIds: trail!.entries.map((entry) => entry.id),
    basisHistory: trail!.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      text: entry.text,
    })),
    targetCaptureIds: ["cap-1"],
    model: "anthropic/claude-sonnet-5",
    status: "queued",
  });

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-late",
      text: "Arrived while enriching",
      createdAt: "2026-07-18T12:05:00.000Z",
      location: null,
      threadId: "trail",
      sequence: 2,
      idempotencyKey: "cap-late",
    },
  ]);

  const first = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  expect(first.results.map((result) => result.id)).toEqual(["cap-1"]);
  expect(seenPrompts[0]).toContain("First sighting");
  expect(seenPrompts[0]).not.toContain("Arrived while enriching");

  const second = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  expect(second.results.map((result) => result.id)).toEqual(["cap-late"]);
  expect(seenPrompts[1]).toContain("Arrived while enriching");
});

test("parallel Threads enrich independently and failures retry without duplicates", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  let failOnce = true;
  const gateway = createFakeGatewayClient(async ({ model }) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("provider_timeout");
    }
    return { text: `ok via ${model}`, model, title: null };
  });

  await threads.upsertCaptures("user_a", [
    {
      id: "a1",
      text: "Cedar",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 1,
      idempotencyKey: "a1",
    },
    {
      id: "b1",
      text: "Stream",
      createdAt: "2026-07-18T12:00:30.000Z",
      location: null,
      threadId: "thread-b",
      sequence: 1,
      idempotencyKey: "b1",
    },
  ]);

  const first = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    threadRepository: threads,
  });
  const failed = first.results.filter(
    (result) => result.status === "needs_attention",
  );
  const completed = first.results.filter(
    (result) => result.status === "complete",
  );
  expect(failed.length + completed.length).toBe(2);
  expect(failed.length).toBe(1);
  expect(completed.length).toBe(1);

  const retried = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    retryFailed: true,
    threadRepository: threads,
  });
  expect(retried.results.every((result) => result.status === "complete")).toBe(
    true,
  );

  const listed = await enrichment.listPendingThreads("user_a");
  expect(
    listed.reduce((sum, thread) => sum + thread.enrichmentCount, 0),
  ).toBe(2);
});
