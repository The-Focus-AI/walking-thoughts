import { expect, test } from "@playwright/test";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import { createMediaAccessService } from "@/lib/media/access-service";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";
import { purgeExpiredTrash } from "@/lib/sync/purge";
import { expiresAtFrom } from "@/lib/sync/trash";

const NS = "trash-repo-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryBlobStore(NS);
});

async function seedCapture(
  userId: string,
  input: {
    id: string;
    text: string;
    threadId?: string | null;
    createdAt?: string;
    sequence?: number;
  },
) {
  const repository = createMemoryThreadRepository(NS);
  const result = await repository.upsertCaptures(userId, [
    {
      id: input.id,
      text: input.text,
      createdAt: input.createdAt ?? "2026-07-01T12:00:00.000Z",
      location: null,
      threadId: input.threadId === undefined ? null : input.threadId,
      sequence: input.sequence ?? 1,
      idempotencyKey: input.id,
    },
  ]);
  expect(result.failures).toEqual([]);
  return repository;
}

test("trashing a Capture hides it from ordinary review and keeps a 30-day deadline", async () => {
  const repository = await seedCapture("user_a", {
    id: "cap-1",
    text: "Cedar scent after rain",
  });

  const trashedAt = "2026-07-18T10:00:00.000Z";
  const mutation = await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "capture",
      targetId: "cap-1",
      trashedAt,
      attachmentIds: ["att-1"],
      idempotencyKey: "trash-cap-1",
    },
  ]);

  expect(mutation.failures).toEqual([]);
  expect(mutation.results[0]?.record).toEqual({
    kind: "capture",
    targetId: "cap-1",
    trashedAt,
    expiresAt: expiresAtFrom(trashedAt),
    attachmentIds: ["att-1"],
  });

  const threads = await repository.listThreads("user_a");
  expect(threads).toEqual([]);

  const trash = await repository.listTrash("user_a");
  expect(trash).toHaveLength(1);
  expect(trash[0]?.expiresAt).toBe("2026-08-17T10:00:00.000Z");
});

test("restore returns a Capture to ordinary review before the deadline", async () => {
  const repository = await seedCapture("user_a", {
    id: "cap-1",
    text: "Moss on the north face",
  });

  await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "capture",
      targetId: "cap-1",
      trashedAt: "2026-07-18T10:00:00.000Z",
      attachmentIds: [],
      idempotencyKey: "trash-cap-1",
    },
  ]);

  const restored = await repository.applyTrashMutations("user_a", [
    {
      action: "restore",
      kind: "capture",
      targetId: "cap-1",
      idempotencyKey: "restore-cap-1",
    },
  ]);
  expect(restored.failures).toEqual([]);
  expect(restored.results[0]?.record).toBeNull();

  const threads = await repository.listThreads("user_a");
  expect(threads).toHaveLength(1);
  expect(threads[0]?.captures[0]?.id).toBe("cap-1");
  expect(await repository.listTrash("user_a")).toEqual([]);
});

test("trashing a Thread hides its history until restore; purge removes Neon rows and media", async () => {
  const repository = createMemoryThreadRepository(NS);
  await repository.upsertCaptures("user_a", [
    {
      id: "cap-a1",
      text: "Trail fork",
      createdAt: "2026-07-01T12:00:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 1,
      idempotencyKey: "cap-a1",
    },
    {
      id: "cap-a2",
      text: "Left path muddy",
      createdAt: "2026-07-01T12:05:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 2,
      idempotencyKey: "cap-a2",
    },
    {
      id: "cap-b1",
      text: "Keep me",
      createdAt: "2026-07-01T12:10:00.000Z",
      location: null,
      threadId: "thread-b",
      sequence: 1,
      idempotencyKey: "cap-b1",
    },
  ]);

  const blobs = createMemoryBlobStore(NS);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-a1",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3]),
    operationId: "op-a1",
  });
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-keep",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([4, 5, 6]),
    operationId: "op-keep",
  });

  await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "thread",
      targetId: "thread-a",
      trashedAt: "2026-07-01T13:00:00.000Z",
      attachmentIds: ["att-a1"],
      idempotencyKey: "trash-thread-a",
    },
  ]);

  let threads = await repository.listThreads("user_a");
  expect(threads.map((thread) => thread.id)).toEqual(["thread-b"]);

  await repository.applyTrashMutations("user_a", [
    {
      action: "restore",
      kind: "thread",
      targetId: "thread-a",
      idempotencyKey: "restore-thread-a",
    },
  ]);
  threads = await repository.listThreads("user_a");
  expect(threads.map((thread) => thread.id).sort()).toEqual([
    "thread-a",
    "thread-b",
  ]);
  expect(
    threads.find((thread) => thread.id === "thread-a")?.captures,
  ).toHaveLength(2);

  await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "thread",
      targetId: "thread-a",
      trashedAt: "2026-06-01T13:00:00.000Z",
      attachmentIds: ["att-a1"],
      idempotencyKey: "trash-thread-a-again",
    },
  ]);

  const access = createMediaAccessService(blobs);
  const firstPurge = await purgeExpiredTrash(repository, blobs, {
    userId: "user_a",
    now: "2026-07-02T13:00:00.000Z",
    operationId: "purge-1",
  });
  expect(firstPurge.purged).toEqual([
    {
      kind: "thread",
      targetId: "thread-a",
      attachmentIds: ["att-a1"],
    },
  ]);
  expect(firstPurge.duplicate).toBe(false);

  threads = await repository.listThreads("user_a");
  expect(threads.map((thread) => thread.id)).toEqual(["thread-b"]);
  expect(await repository.listTrash("user_a")).toEqual([]);

  await expect(
    access.read({ userId: "user_a", attachmentId: "att-a1" }),
  ).rejects.toMatchObject({ status: 404 });
  const kept = await access.read({
    userId: "user_a",
    attachmentId: "att-keep",
  });
  expect(kept.bytes).toEqual(new Uint8Array([4, 5, 6]));

  const replay = await purgeExpiredTrash(repository, blobs, {
    userId: "user_a",
    now: "2026-07-02T13:00:00.000Z",
    operationId: "purge-1",
  });
  expect(replay.duplicate).toBe(true);
  expect(replay.purged).toEqual(firstPurge.purged);

  const unrelatedStillListed = await repository.listThreads("user_a");
  expect(unrelatedStillListed.map((thread) => thread.id)).toEqual(["thread-b"]);
});

test("trash and restore mutations are idempotent on replay", async () => {
  const repository = await seedCapture("user_a", {
    id: "cap-1",
    text: "Replay me",
  });

  const first = await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "capture",
      targetId: "cap-1",
      trashedAt: "2026-07-18T10:00:00.000Z",
      attachmentIds: [],
      idempotencyKey: "trash-cap-1",
    },
  ]);
  const second = await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "capture",
      targetId: "cap-1",
      trashedAt: "2026-07-18T11:00:00.000Z",
      attachmentIds: ["ignored"],
      idempotencyKey: "trash-cap-1",
    },
  ]);
  expect(second.results).toEqual(first.results);

  const restoreFirst = await repository.applyTrashMutations("user_a", [
    {
      action: "restore",
      kind: "capture",
      targetId: "cap-1",
      idempotencyKey: "restore-cap-1",
    },
  ]);
  const restoreSecond = await repository.applyTrashMutations("user_a", [
    {
      action: "restore",
      kind: "capture",
      targetId: "cap-1",
      idempotencyKey: "restore-cap-1",
    },
  ]);
  expect(restoreSecond.results).toEqual(restoreFirst.results);
  expect(await repository.listThreads("user_a")).toHaveLength(1);
});
