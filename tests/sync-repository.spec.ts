import { expect, test } from "@playwright/test";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

test.beforeEach(() => {
  resetMemoryThreadRepository("sync-tests");
});

// Legacy clients may still push unassigned Captures; the server keeps
// turning each into its own Thread (ADR 0011 made this the only path).
test("unassigned Captures become independent Threads and replays stay idempotent", async () => {
  const repository = createMemoryThreadRepository("sync-tests");

  const first = await repository.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "North ridge wind",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
    },
    {
      id: "cap-2",
      text: "Unrelated bird call",
      createdAt: "2026-07-18T12:01:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-2",
    },
  ]);

  expect(first.failures).toEqual([]);
  expect(first.results).toEqual([
    {
      id: "cap-1",
      threadId: "cap-1",
      sequence: 1,
      status: "complete",
    },
    {
      id: "cap-2",
      threadId: "cap-2",
      sequence: 1,
      status: "complete",
    },
  ]);

  const replay = await repository.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "North ridge wind",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
    },
  ]);
  expect(replay.results).toEqual([first.results[0]]);

  const threads = await repository.listThreads("user_a");
  expect(threads).toHaveLength(2);
  expect(threads.map((thread) => thread.id).sort()).toEqual(["cap-1", "cap-2"]);
  expect(threads.find((thread) => thread.id === "cap-1")?.captures).toHaveLength(
    1,
  );
});

test("Thread follow-ups append independently per Thread", async () => {
  const repository = createMemoryThreadRepository("sync-tests");

  await repository.upsertCaptures("user_a", [
    {
      id: "cap-a1",
      text: "Cedar bark",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 1,
      idempotencyKey: "cap-a1",
    },
    {
      id: "cap-b1",
      text: "Stream noise",
      createdAt: "2026-07-18T12:00:30.000Z",
      location: null,
      threadId: "thread-b",
      sequence: 1,
      idempotencyKey: "cap-b1",
    },
  ]);

  await repository.upsertCaptures("user_a", [
    {
      id: "cap-a2",
      text: "Correction: hemlock",
      createdAt: "2026-07-18T12:05:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 2,
      idempotencyKey: "cap-a2",
    },
  ]);

  const threads = await repository.listThreads("user_a");
  const threadA = threads.find((thread) => thread.id === "thread-a");
  const threadB = threads.find((thread) => thread.id === "thread-b");
  expect(threadA?.revision).toBe(2);
  expect(threadA?.captures.map((capture) => capture.text)).toEqual([
    "Cedar bark",
    "Correction: hemlock",
  ]);
  expect(threadB?.captures.map((capture) => capture.text)).toEqual([
    "Stream noise",
  ]);
});

test("setThreadReviewed round-trips through listThreads and clears back to new", async () => {
  const repository = createMemoryThreadRepository("sync-tests");
  await repository.upsertCaptures("user_a", [
    {
      id: "cap-review",
      text: "Stone wall into the reservoir",
      createdAt: "2026-07-23T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-review",
    },
  ]);

  const marked = await repository.setThreadReviewed(
    "user_a",
    "cap-review",
    "2026-07-23T18:00:00.000Z",
  );
  expect(marked).toEqual({
    threadId: "cap-review",
    reviewedAt: "2026-07-23T18:00:00.000Z",
  });

  let listed = await repository.listThreads("user_a");
  expect(listed[0].reviewedAt).toBe("2026-07-23T18:00:00.000Z");

  await repository.setThreadReviewed("user_a", "cap-review", null);
  listed = await repository.listThreads("user_a");
  expect(listed[0].reviewedAt).toBeNull();

  await expect(
    repository.setThreadReviewed("user_a", "missing", "2026-07-23T18:00:00.000Z"),
  ).rejects.toThrow("thread_not_found");
});
