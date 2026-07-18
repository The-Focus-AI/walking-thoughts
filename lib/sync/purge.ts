import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import type { PurgeExpiredResult, ThreadRepository } from "./types";

export async function purgeExpiredTrash(
  repository: ThreadRepository,
  blobs: PrivateBlobStore,
  input: { userId: string; now: string; operationId: string },
): Promise<PurgeExpiredResult> {
  const result = await repository.purgeExpired(
    input.userId,
    input.now,
    input.operationId,
  );

  if (!result.duplicate) {
    for (const target of result.purged) {
      for (const attachmentId of target.attachmentIds) {
        if (blobs.delete) {
          await blobs.delete(input.userId, attachmentId);
        }
      }
    }
  } else {
    // Replay still ensures media stays gone without touching unrelated objects.
    for (const target of result.purged) {
      for (const attachmentId of target.attachmentIds) {
        if (blobs.delete) {
          await blobs.delete(input.userId, attachmentId);
        }
      }
    }
  }

  return result;
}
