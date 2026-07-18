import { expect, test } from "@playwright/test";
import { createMemoryCaptureStore } from "@/lib/local-capture/store";
import { createMemoryMediaStore } from "@/lib/local-capture/media-store";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import { createMediaAccessService } from "@/lib/media/access-service";

test("mixed-media commit stores original bytes before Capture succeeds", async () => {
  const media = createMemoryMediaStore();
  const store = createMemoryCaptureStore({ mediaStore: media });
  const bytes = new TextEncoder().encode("fake-image-bytes");

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

  expect(capture.text).toBe("Trail fungus");
  expect(capture.attachments).toHaveLength(1);
  expect(capture.attachments[0]).toMatchObject({
    kind: "image",
    mimeType: "image/jpeg",
    fileName: "fungus.jpg",
    byteLength: bytes.byteLength,
  });

  const stored = await media.get(capture.attachments[0]!.localObjectKey!);
  expect(stored).not.toBeNull();
  expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
});

test("empty Captures are rejected and attachment write failure preserves draft media", async () => {
  const media = createMemoryMediaStore({
    failNextPutWith: new DOMException("quota", "QuotaExceededError"),
  });
  const store = createMemoryCaptureStore({
    mediaStore: media,
    draft: "Keep this draft",
  });

  await expect(
    store.commit("Keep this draft", null, {
      attachments: [
        {
          kind: "image",
          mimeType: "image/png",
          fileName: "x.png",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    }),
  ).rejects.toThrow(/quota/i);

  await expect(store.getDraft()).resolves.toBe("Keep this draft");
  await expect(store.list()).resolves.toEqual([]);

  await expect(store.commit("", null)).rejects.toThrow(
    "Capture text or media is required",
  );
});

test("private media access requires auth and rejects unknown or foreign objects", async () => {
  resetMemoryBlobStore("media-tests");
  const blobs = createMemoryBlobStore("media-tests");
  const access = createMediaAccessService(blobs);

  await blobs.put({
    userId: "user_a",
    attachmentId: "att-1",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([9, 8, 7]),
    operationId: "op-1",
  });

  await expect(
    access.read({ userId: null, attachmentId: "att-1" }),
  ).rejects.toMatchObject({ status: 401 });

  await expect(
    access.read({ userId: "user_b", attachmentId: "att-1" }),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    access.read({ userId: "user_a", attachmentId: "missing" }),
  ).rejects.toMatchObject({ status: 404 });

  const ok = await access.read({ userId: "user_a", attachmentId: "att-1" });
  expect(ok.mimeType).toBe("image/jpeg");
  expect(ok.bytes).toEqual(new Uint8Array([9, 8, 7]));
  expect(ok.publicUrl).toBeUndefined();

  const duplicate = await blobs.put({
    userId: "user_a",
    attachmentId: "att-1",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1, 1, 1]),
    operationId: "op-1",
  });
  expect(duplicate.duplicate).toBe(true);
  const again = await access.read({ userId: "user_a", attachmentId: "att-1" });
  expect(again.bytes).toEqual(new Uint8Array([9, 8, 7]));
});
