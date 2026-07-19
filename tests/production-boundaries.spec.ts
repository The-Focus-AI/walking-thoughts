import { expect, test } from "@playwright/test";
import { createMemoryEnrichmentRepository } from "@/lib/enrichment/memory-repository";
import { createMemoryBlobStore, resetMemoryBlobStore } from "@/lib/media/memory-blob-store";
import { createMemoryPushRepository } from "@/lib/push/memory-repository";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

// Cross-user identifier checks stay in place even though v1 has one user:
// records, media, jobs, and push subscriptions are always scoped to their
// owner, and another user's identifiers behave as if they do not exist.

test.beforeEach(() => {
  resetMemoryThreadRepository("boundary-tests");
  resetMemoryBlobStore("boundary-tests");
});

test("synchronized Threads are invisible across users, even by identifier", async () => {
  const repository = createMemoryThreadRepository("boundary-tests");

  await repository.upsertCaptures("user_owner", [
    {
      id: "cap-owner-1",
      text: "Private observation",
      createdAt: "2026-07-19T01:00:00.000Z",
      location: { latitude: 41.84, longitude: -73.33, accuracy: 5 },
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-owner-1",
    },
  ]);

  expect(await repository.listThreads("user_intruder")).toEqual([]);
  expect(await repository.listTrash("user_intruder")).toEqual([]);

  // The intruder writing with the same Capture identifier must not read or
  // replace the owner's record.
  await repository.upsertCaptures("user_intruder", [
    {
      id: "cap-owner-1",
      text: "Attempted overwrite",
      createdAt: "2026-07-19T01:05:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-owner-1",
    },
  ]);
  const ownerThreads = await repository.listThreads("user_owner");
  const ownerTexts = ownerThreads.flatMap((thread) =>
    thread.captures.map((capture) => capture.text),
  );
  expect(ownerTexts).toEqual(["Private observation"]);
});

test("private media objects are scoped to their owner", async () => {
  const store = createMemoryBlobStore("boundary-tests");

  await store.put({
    userId: "user_owner",
    attachmentId: "att-1",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3]),
    operationId: "op-1",
  });

  expect(await store.get("user_intruder", "att-1")).toBeNull();
  expect(await store.existsForOtherUser?.("user_intruder", "att-1")).toBe(true);
  expect(await store.get("user_owner", "att-1")).not.toBeNull();
});

test("Enrichment history and jobs are scoped to their owner", async () => {
  const threads = createMemoryThreadRepository("boundary-tests");
  const repository = createMemoryEnrichmentRepository(
    "boundary-tests",
    threads,
  );

  await threads.upsertCaptures("user_owner", [
    {
      id: "cap-1",
      text: "Ridge trail question",
      createdAt: "2026-07-19T01:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
    },
  ]);
  const job = await repository.getOrCreateJob("user_owner", {
    id: "job-1",
    idempotencyKey: "enrich:cap-1:r1",
    threadId: "cap-1",
    basisRevision: 1,
    basisEntryIds: ["cap-1"],
    basisHistory: [{ id: "cap-1", kind: "capture", text: "Ridge trail question" }],
    targetCaptureIds: ["cap-1"],
    model: "test/model",
  });
  await repository.markJobRunning("user_owner", job.id);
  await repository.completeJob("user_owner", job.id, {
    text: "It is a ridge trail.",
    model: "test/model",
    title: "Ridge trail",
    sources: [],
  });

  expect(await repository.listThreadEnrichments("user_intruder", "cap-1")).toEqual([]);
  expect(await repository.listOpenJobs("user_intruder")).toEqual([]);
  expect(
    (await repository.listThreadEnrichments("user_owner", "cap-1")).length,
  ).toBe(1);
});

test("push subscriptions and notification claims are scoped to their owner", async () => {
  const repository = createMemoryPushRepository();

  await repository.upsertSubscription("user_owner", {
    endpoint: "https://push.example/sub-1",
    p256dh: "public",
    auth: "auth",
  });

  expect(await repository.listSubscriptions("user_intruder")).toEqual([]);

  // A duplicate event key for another user is an independent claim.
  expect(await repository.claimNotificationEvent("user_owner", "thread:1")).toBe(true);
  expect(await repository.claimNotificationEvent("user_intruder", "thread:1")).toBe(true);
  expect(await repository.claimNotificationEvent("user_owner", "thread:1")).toBe(false);
});
