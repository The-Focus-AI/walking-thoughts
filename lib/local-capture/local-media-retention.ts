import type { MediaStore } from "./media-store";
import type { CaptureStore, LocalAttachment, LocalCapture } from "./types";

export type MediaAvailability = "local" | "online_only" | "error";

export type RemoteMediaVerifier = {
  verify(attachmentId: string): Promise<boolean>;
  download(attachmentId: string): Promise<Blob>;
};

export function mediaAvailability(
  attachment: LocalAttachment,
): MediaAvailability {
  if (attachment.localObjectKey) {
    return "local";
  }
  if (
    attachment.syncStatus === "complete" &&
    attachment.remoteObjectKey
  ) {
    return "online_only";
  }
  return "error";
}

export function mediaAvailabilityLabel(
  availability: MediaAvailability,
): string {
  switch (availability) {
    case "local":
      return "On device";
    case "online_only":
      return "Online only";
    case "error":
      return "Unavailable";
  }
}

export function canOfferLocalRemoval(attachment: LocalAttachment): boolean {
  return (
    attachment.syncStatus === "complete" &&
    Boolean(attachment.remoteObjectKey) &&
    Boolean(attachment.localObjectKey)
  );
}

async function findCapture(
  store: CaptureStore,
  captureId: string,
): Promise<LocalCapture> {
  const capture = (await store.list()).find((item) => item.id === captureId);
  if (!capture) {
    throw new Error("Capture not found");
  }
  return capture;
}

function findAttachment(
  capture: LocalCapture,
  attachmentId: string,
): LocalAttachment {
  const attachment = capture.attachments.find((item) => item.id === attachmentId);
  if (!attachment) {
    throw new Error("Attachment not found");
  }
  return attachment;
}

export async function removeLocalOriginal(input: {
  store: CaptureStore;
  mediaStore: MediaStore;
  captureId: string;
  attachmentId: string;
  remote: RemoteMediaVerifier;
}): Promise<LocalAttachment> {
  const capture = await findCapture(input.store, input.captureId);
  const attachment = findAttachment(capture, input.attachmentId);

  if (!canOfferLocalRemoval(attachment) || !attachment.remoteObjectKey) {
    throw new Error("media_not_verified");
  }

  const verified = await input.remote.verify(attachment.remoteObjectKey);
  if (!verified) {
    throw new Error("media_not_verified");
  }

  if (attachment.localObjectKey) {
    await input.mediaStore.delete(attachment.localObjectKey);
  }

  await input.store.updateAttachment(input.captureId, input.attachmentId, {
    localObjectKey: null,
  });

  const updated = findAttachment(
    await findCapture(input.store, input.captureId),
    input.attachmentId,
  );
  return updated;
}

export async function restoreLocalOriginal(input: {
  store: CaptureStore;
  mediaStore: MediaStore;
  captureId: string;
  attachmentId: string;
  remote: RemoteMediaVerifier;
}): Promise<LocalAttachment> {
  const capture = await findCapture(input.store, input.captureId);
  const attachment = findAttachment(capture, input.attachmentId);

  if (
    attachment.syncStatus !== "complete" ||
    !attachment.remoteObjectKey
  ) {
    throw new Error("media_not_verified");
  }

  const bytes = await input.remote.download(attachment.remoteObjectKey);
  const localObjectKey = `${input.captureId}/${input.attachmentId}`;
  await input.mediaStore.put(localObjectKey, bytes);
  await input.store.updateAttachment(input.captureId, input.attachmentId, {
    localObjectKey,
  });

  return findAttachment(
    await findCapture(input.store, input.captureId),
    input.attachmentId,
  );
}
