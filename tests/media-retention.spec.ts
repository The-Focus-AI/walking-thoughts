import { expect, test } from "@playwright/test";
import {
  canOfferLocalRemoval,
  mediaAvailability,
  mediaAvailabilityLabel,
  removeLocalOriginal,
  restoreLocalOriginal,
} from "@/lib/local-capture/local-media-retention";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { createMemoryMediaStore } from "@/lib/local-capture/media-store";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import { createMediaAccessService } from "@/lib/media/access-service";
import { synchronizePendingMedia } from "@/lib/sync/media-client";

const NS = "media-retention-tests";

test.beforeEach(() => {
  resetMemoryBlobStore(NS);
});

test("unverified media cannot be removed and originals stay after sync by default", async () => {
  const media = createMemoryMediaStore();
  const store = createMemoryCaptureStore({ mediaStore: media });
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const capture = await store.commit("Trail fungus", null, {
    attachments: [
      {
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "fungus.jpg",
        bytes,
      },
    ],
  });
  const attachment = capture.attachments[0]!;
  expect(canOfferLocalRemoval(attachment)).toBe(false);
  expect(mediaAvailability(attachment)).toBe("local");
  expect(mediaAvailabilityLabel("local")).toBe("On device");

  await expect(
    removeLocalOriginal({
      store,
      mediaStore: media,
      captureId: capture.id,
      attachmentId: attachment.id,
      remote: {
        async verify() {
          return true;
        },
        async download() {
          return new Blob([bytes]);
        },
      },
    }),
  ).rejects.toThrow("media_not_verified");

  expect(await media.get(attachment.localObjectKey!)).not.toBeNull();

  const blobs = createMemoryBlobStore(NS);
  await synchronizePendingMedia(store, {
    async upload({ attachmentId, mimeType, bytes: blob }) {
      const buffer = new Uint8Array(await blob.arrayBuffer());
      await blobs.put({
        userId: "user_a",
        attachmentId,
        mimeType,
        bytes: buffer,
        operationId: attachmentId,
      });
      return { attachmentId, duplicate: false };
    },
  }, media);

  const afterSync = (await store.list())[0]!.attachments[0]!;
  expect(afterSync.syncStatus).toBe("complete");
  expect(await media.get(afterSync.localObjectKey!)).not.toBeNull();
  expect(canOfferLocalRemoval(afterSync)).toBe(true);
});

test("explicit removal deletes only the local original and preserves server object plus Thread context", async () => {
  const media = createMemoryMediaStore();
  const store = createMemoryCaptureStore({ mediaStore: media });
  const bytes = new Uint8Array([9, 8, 7]);
  const capture = await store.commit("Nurse log detail", null, {
    destination: { type: "new_thread" },
    attachments: [
      {
        id: "att-retain",
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "detail.jpg",
        bytes,
      },
    ],
  });

  const blobs = createMemoryBlobStore(NS);
  await synchronizePendingMedia(store, {
    async upload({ attachmentId, mimeType, bytes: blob }) {
      await blobs.put({
        userId: "user_a",
        attachmentId,
        mimeType,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        operationId: attachmentId,
      });
      return { attachmentId, duplicate: false };
    },
  }, media);

  const attachment = (await store.list())[0]!.attachments[0]!;
  const remote = {
    async verify(attachmentId: string) {
      return (await blobs.get("user_a", attachmentId)) !== null;
    },
    async download(attachmentId: string) {
      const object = await blobs.get("user_a", attachmentId);
      if (!object) throw new Error("missing");
      return new Blob([Uint8Array.from(object.bytes)], {
        type: object.mimeType,
      });
    },
  };

  const removed = await removeLocalOriginal({
    store,
    mediaStore: media,
    captureId: capture.id,
    attachmentId: attachment.id,
    remote,
  });

  expect(removed.localObjectKey).toBeNull();
  expect(removed.fileName).toBe("detail.jpg");
  expect(removed.thumbnailObjectKey).toBeTruthy();
  expect(await media.get(attachment.localObjectKey!)).toBeNull();
  expect(await media.get(removed.thumbnailObjectKey!)).not.toBeNull();
  expect(await blobs.get("user_a", "att-retain")).not.toBeNull();
  expect(mediaAvailability(removed)).toBe("online_only");
  expect(mediaAvailabilityLabel("online_only")).toBe("Online only");

  const thread = (await store.listRecentThreads())[0]!;
  const review = await store.listThread(thread.id);
  expect(review.captures[0]?.text).toBe("Nurse log detail");
  expect(review.captures[0]?.attachments[0]?.fileName).toBe("detail.jpg");
  expect(review.captures[0]?.attachments[0]?.localObjectKey).toBeNull();

  const access = createMediaAccessService(blobs);
  const fetched = await access.read({
    userId: "user_a",
    attachmentId: "att-retain",
  });
  expect(fetched.bytes).toEqual(bytes);

  const restored = await restoreLocalOriginal({
    store,
    mediaStore: media,
    captureId: capture.id,
    attachmentId: attachment.id,
    remote,
  });
  expect(restored.localObjectKey).toBeTruthy();
  expect(mediaAvailability(restored)).toBe("local");
  const localAgain = await media.get(restored.localObjectKey!);
  expect(new Uint8Array(await localAgain!.arrayBuffer())).toEqual(bytes);
});

test("failed remote verification blocks removal and surfaces unavailable state", async () => {
  const media = createMemoryMediaStore();
  const store = createMemoryCaptureStore({ mediaStore: media });
  const capture = await store.commit("Broken link", null, {
    attachments: [
      {
        kind: "audio",
        mimeType: "audio/webm",
        fileName: "note.webm",
        bytes: new Uint8Array([1]),
      },
    ],
  });
  await store.updateAttachment(capture.id, capture.attachments[0]!.id, {
    syncStatus: "complete",
    remoteObjectKey: "missing-remote",
  });

  await expect(
    removeLocalOriginal({
      store,
      mediaStore: media,
      captureId: capture.id,
      attachmentId: capture.attachments[0]!.id,
      remote: {
        async verify() {
          return false;
        },
        async download() {
          throw new Error("missing");
        },
      },
    }),
  ).rejects.toThrow("media_not_verified");

  await store.updateAttachment(capture.id, capture.attachments[0]!.id, {
    localObjectKey: null,
    syncStatus: "needs_attention",
    remoteObjectKey: null,
  });
  const broken = (await store.list())[0]!.attachments[0]!;
  expect(mediaAvailability(broken)).toBe("error");
  expect(mediaAvailabilityLabel("error")).toBe("Unavailable");
});
