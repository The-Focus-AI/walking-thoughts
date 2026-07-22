import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NAMESPACE = "split-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NAMESPACE);
  resetMemoryEnrichmentRepository(NAMESPACE);
});

function repositories() {
  const threads = createMemoryThreadRepository(NAMESPACE);
  const enrichment = createMemoryEnrichmentRepository(NAMESPACE, threads);
  return { threads, enrichment };
}

async function seedMergedThread(
  threads: ReturnType<typeof repositories>["threads"],
) {
  // Three Captures merged into one Thread — the old sticky-day-session shape.
  await threads.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "Stone wall into the reservoir",
      createdAt: "2026-07-22T12:00:00.000Z",
      location: null,
      threadId: "walk-day",
      sequence: 1,
      idempotencyKey: "cap-1",
    },
    {
      id: "cap-2",
      text: "Fern colony on the north side",
      createdAt: "2026-07-22T12:30:00.000Z",
      location: null,
      threadId: "walk-day",
      sequence: 2,
      idempotencyKey: "cap-2",
    },
    {
      id: "cap-3",
      text: "New beaver dam by the dead hemlocks",
      createdAt: "2026-07-22T13:00:00.000Z",
      location: null,
      threadId: "walk-day",
      sequence: 3,
      idempotencyKey: "cap-3",
    },
  ]);
}

test("split moves each Capture into its own Thread and trashes the source", async () => {
  const { threads } = repositories();
  await seedMergedThread(threads);

  const result = await threads.splitThread("user_a", "walk-day");

  expect(result.trashedThreadId).toBe("walk-day");
  expect(result.moves).toHaveLength(3);
  expect(result.moves.map((move) => move.threadId)).toEqual([
    "cap-1",
    "cap-2",
    "cap-3",
  ]);

  const listed = await threads.listThreads("user_a");
  expect(listed).toHaveLength(3);
  for (const thread of listed) {
    expect(thread.captures).toHaveLength(1);
    expect(thread.captures[0].sequence).toBe(1);
  }
  expect(listed.map((thread) => thread.id).sort()).toEqual([
    "cap-1",
    "cap-2",
    "cap-3",
  ]);

  // The source Thread sits in Trash and must not claim any media.
  const trash = await threads.listTrash("user_a");
  expect(trash).toHaveLength(1);
  expect(trash[0]).toMatchObject({
    kind: "thread",
    targetId: "walk-day",
    attachmentIds: [],
  });

  // Replay is idempotent: everything already lives in its own Thread.
  const replay = await threads.splitThread("user_a", "walk-day");
  expect(replay.moves).toHaveLength(0);
});

test("split + resetInclusions re-enriches every Capture with a fresh report", async () => {
  const { threads, enrichment } = repositories();
  await seedMergedThread(threads);

  // First pass: one merged Enrichment covers all three Captures.
  const gateway = createFakeGatewayClient(async (input) => ({
    text: `Report for: ${input.prompt.slice(0, 40)}`,
    title: "Fresh report",
  }));
  const first = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    pushSender: null,
  });
  expect(first.results.filter((row) => row.status === "complete")).toHaveLength(3);
  const mergedEnrichments = await enrichment.listThreadEnrichments(
    "user_a",
    "walk-day",
  );
  expect(mergedEnrichments).toHaveLength(1);

  // Split, forget inclusions, and process again.
  const split = await threads.splitThread("user_a", "walk-day");
  await enrichment.resetInclusions(
    "user_a",
    split.moves.map((move) => move.captureId),
  );
  const second = await processPendingEnrichments("user_a", enrichment, {
    gateway,
    pushSender: null,
  });
  expect(
    second.results.filter((row) => row.status === "complete"),
  ).toHaveLength(3);

  for (const move of split.moves) {
    const reports = await enrichment.listThreadEnrichments(
      "user_a",
      move.threadId,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].targetCaptureIds).toEqual([move.captureId]);
    // First Enrichment of a fresh Thread proposes a title.
    expect(reports[0].title).toBe("Fresh report");
  }
});

test("applyThreadSplit rehomes local Captures and drops the source Thread", async () => {
  const store = createMemoryCaptureStore();
  const first = await store.commit("Stone wall into the reservoir", null);
  const second = await store.commit("Fern colony on the north side", null, {
    destination: { type: "thread", threadId: first.threadId! },
  });

  await store.applyThreadSplit({
    moves: [
      {
        captureId: second.id,
        threadId: second.id,
        title: "Fern colony on the north side",
        createdAt: second.createdAt,
      },
    ],
    trashedThreadId: null,
  });

  const movedThread = await store.listThread(second.id);
  expect(movedThread.captures.map((capture) => capture.id)).toEqual([second.id]);
  expect(movedThread.captures[0].sequence).toBe(1);
  expect(movedThread.captures[0].status).toBe("enriching");

  const originalThread = await store.listThread(first.threadId!);
  expect(originalThread.captures.map((capture) => capture.id)).toEqual([
    first.id,
  ]);
});
