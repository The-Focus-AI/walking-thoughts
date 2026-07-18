import type { PrivateBlobStore } from "./memory-blob-store";

export class MediaAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createMediaAccessService(blobs: PrivateBlobStore) {
  return {
    async read(input: { userId: string | null; attachmentId: string }) {
      if (!input.userId) {
        throw new MediaAccessError(401, "signed_out");
      }

      const object = await blobs.get(input.userId, input.attachmentId);
      if (object) {
        return {
          mimeType: object.mimeType,
          bytes: object.bytes,
          publicUrl: undefined as undefined,
        };
      }

      if (
        blobs.existsForOtherUser &&
        (await blobs.existsForOtherUser(input.userId, input.attachmentId))
      ) {
        throw new MediaAccessError(403, "forbidden");
      }

      throw new MediaAccessError(404, "not_found");
    },
  };
}
