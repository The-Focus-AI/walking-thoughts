import { expect, test } from "@playwright/test";
import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import { createMediaAccessService } from "@/lib/media/access-service";

/**
 * Cross-user boundary contract shared by memory and Vercel private Blob
 * adapters (user-scoped objects + reverse ownership index).
 */
function createIndexedMemoryStore(): PrivateBlobStore {
  const objects = new Map<string, Uint8Array>();
  const mime = new Map<string, string>();
  const owners = new Map<string, string>();
  const ops = new Map<string, string>();

  return {
    async put(input) {
      const opKey = `${input.userId}:${input.operationId}`;
      const prior = ops.get(opKey);
      if (prior) return { attachmentId: prior, duplicate: true };
      objects.set(`${input.userId}:${input.attachmentId}`, input.bytes);
      mime.set(`${input.userId}:${input.attachmentId}`, input.mimeType);
      owners.set(input.attachmentId, input.userId);
      ops.set(opKey, input.attachmentId);
      return { attachmentId: input.attachmentId, duplicate: false };
    },
    async get(userId, attachmentId) {
      const key = `${userId}:${attachmentId}`;
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        userId,
        attachmentId,
        mimeType: mime.get(key) ?? "application/octet-stream",
        bytes,
        operationId: "",
      };
    },
    async delete(userId, attachmentId) {
      const key = `${userId}:${attachmentId}`;
      const existed = objects.delete(key);
      mime.delete(key);
      if (owners.get(attachmentId) === userId) owners.delete(attachmentId);
      return { deleted: existed };
    },
    async existsForOtherUser(userId, attachmentId) {
      const owner = owners.get(attachmentId);
      return Boolean(owner && owner !== userId);
    },
  };
}

test("private blob boundary rejects cross-user attachment identifiers", async () => {
  const blobs = createIndexedMemoryStore();
  const access = createMediaAccessService(blobs);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-shared-id",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3]),
    operationId: "op-1",
  });

  await expect(
    access.read({ userId: "user_b", attachmentId: "att-shared-id" }),
  ).rejects.toMatchObject({ status: 403 });

  const ok = await access.read({
    userId: "user_a",
    attachmentId: "att-shared-id",
  });
  expect(ok.publicUrl).toBeUndefined();
  expect(ok.bytes).toEqual(new Uint8Array([1, 2, 3]));
});
