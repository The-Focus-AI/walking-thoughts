import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
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
import { synchronizeTrash, type TrashTransport } from "@/lib/sync/trash-client";
import type { TrashMutation, TrashRecord } from "@/lib/sync/types";

const NS = "trash-sync-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryBlobStore(NS);
});

function repositoryTransport(): TrashTransport {
  const repository = createMemoryThreadRepository(NS);
  return {
    async pushTrashMutations(mutations: TrashMutation[]) {
      return repository.applyTrashMutations("user_a", mutations);
    },
    async pullTrash() {
      const records = await repository.listTrash("user_a");
      return { records };
    },
  };
}

test("cross-device Trash and restore converge through synchronized mutations", async () => {
  const phone = createMemoryCaptureStore();
  const repository = createMemoryThreadRepository(NS);
  const transport = repositoryTransport();

  const capture = await phone.commit("Phone observation", null, {
    destination: { type: "new_thread" },
    attachments: [
      {
        id: "att-phone",
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "obs.jpg",
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
  });
  await repository.upsertCaptures("user_a", [
    {
      id: capture.id,
      text: capture.text,
      createdAt: capture.createdAt,
      location: null,
      threadId: capture.threadId,
      sequence: capture.sequence,
      idempotencyKey: capture.id,
    },
  ]);

  const desktop = createMemoryCaptureStore({
    captures: [capture],
    threads: [
      {
        id: capture.threadId!,
        title: "Phone observation",
        revision: capture.sequence,
        updatedAt: capture.createdAt,
      },
    ],
  });

  await phone.trashCapture(capture.id, "2026-07-18T08:00:00.000Z");
  await synchronizeTrash(phone, transport);

  expect(await phone.list()).toEqual([]);
  expect(await repository.listThreads("user_a")).toEqual([]);

  await synchronizeTrash(desktop, transport);
  expect(await desktop.list()).toEqual([]);
  expect(await desktop.listTrash()).toHaveLength(1);

  await desktop.restoreFromTrash("capture", capture.id);
  await synchronizeTrash(desktop, transport);
  await synchronizeTrash(phone, transport);

  expect(await phone.list()).toHaveLength(1);
  expect(await desktop.list()).toHaveLength(1);
  expect(await repository.listThreads("user_a")).toHaveLength(1);
});

test("expired Trash purge removes database rows and private media idempotently", async () => {
  const repository = createMemoryThreadRepository(NS);
  const blobs = createMemoryBlobStore(NS);
  const access = createMediaAccessService(blobs);

  await repository.upsertCaptures("user_a", [
    {
      id: "cap-purge",
      text: "Purge me",
      createdAt: "2026-06-01T00:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-purge",
    },
  ]);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-purge",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([9, 9, 9]),
    operationId: "op-purge",
  });
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-keep",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1]),
    operationId: "op-keep",
  });

  await repository.applyTrashMutations("user_a", [
    {
      action: "trash",
      kind: "capture",
      targetId: "cap-purge",
      trashedAt: "2026-06-01T00:00:00.000Z",
      attachmentIds: ["att-purge"],
      idempotencyKey: "trash-cap-purge",
    },
  ]);

  const first = await purgeExpiredTrash(repository, blobs, {
    userId: "user_a",
    now: "2026-07-02T00:00:00.000Z",
    operationId: "purge-op",
  });
  expect(first.purged).toEqual([
    {
      kind: "capture",
      targetId: "cap-purge",
      attachmentIds: ["att-purge"],
    },
  ]);

  await expect(
    access.read({ userId: "user_a", attachmentId: "att-purge" }),
  ).rejects.toMatchObject({ status: 404 });
  expect(await repository.listThreads("user_a")).toEqual([]);
  expect(await repository.listTrash("user_a")).toEqual([]);

  const replay = await purgeExpiredTrash(repository, blobs, {
    userId: "user_a",
    now: "2026-07-02T00:00:00.000Z",
    operationId: "purge-op",
  });
  expect(replay.duplicate).toBe(true);
  const kept = await access.read({
    userId: "user_a",
    attachmentId: "att-keep",
  });
  expect(kept.bytes).toEqual(new Uint8Array([1]));
});

test("remote Trash pull applies server records without rewriting Capture history", async () => {
  const store = createMemoryCaptureStore();
  const capture = await store.commit("Keep history text", null, {
    destination: { type: "new_thread" },
  });
  const records: TrashRecord[] = [
    {
      kind: "capture",
      targetId: capture.id,
      trashedAt: "2026-07-18T08:00:00.000Z",
      expiresAt: "2026-08-17T08:00:00.000Z",
      attachmentIds: [],
    },
  ];
  await store.applyRemoteTrash(records);
  expect(await store.list()).toEqual([]);
  expect(await store.listTrash()).toHaveLength(1);
  // Capture row remains locally until permanent purge; only visibility changes.
  await store.restoreFromTrash("capture", capture.id);
  expect(await store.listTrash()).toEqual([]);
  expect(await store.list()).toHaveLength(1);
  expect((await store.list())[0]?.text).toBe("Keep history text");
});

test("runSyncCycle drains local Trash mutations to the server", async () => {
  const { resetSyncCycleForTests, runSyncCycle } = await import(
    "@/lib/sync/cycle"
  );
  const { createMemoryCaptureStore } = await import(
    "@/lib/local-capture/store"
  );
  resetSyncCycleForTests();

  const store = createMemoryCaptureStore();
  const capture = await store.commit("Blurry test photo", null);
  await store.trashThread(capture.threadId!);

  const pushed: unknown[] = [];
  const result = await runSyncCycle({
    store,
    online: true,
    threadsTransport: { async listThreads() { return { unavailable: true as const }; } },
    captureTransport: {
      async pushCaptures() {
        return { results: [], failures: [] };
      },
    },
    mediaTransport: {
      async upload() {
        return { remoteObjectKey: "media/none" };
      },
    },
    enrichmentTransport: {
      async process() {
        return { results: [], jobs: [] };
      },
    },
    trashTransport: {
      async pushTrashMutations(mutations) {
        pushed.push(...mutations);
        return {
          results: mutations.map((mutation) => ({
            idempotencyKey: mutation.idempotencyKey,
            status: "complete" as const,
            record:
              mutation.action === "trash"
                ? {
                    kind: mutation.kind,
                    targetId: mutation.targetId,
                    trashedAt: mutation.trashedAt!,
                    expiresAt: "2099-01-01T00:00:00.000Z",
                    attachmentIds: mutation.attachmentIds ?? [],
                  }
                : null,
          })),
          failures: [],
        };
      },
      async pullTrash() {
        return { unavailable: true as const };
      },
    },
  });

  expect(result.skippedOffline).toBe(false);
  expect(pushed).toHaveLength(1);
  const settled = await store.listTrash();
  expect(settled).toHaveLength(1);
  expect(settled[0].syncStatus).toBe("complete");
});
