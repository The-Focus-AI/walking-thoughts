import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";
import type { BlobObject, PrivateBlobStore } from "./memory-blob-store";

function pathnameFor(userId: string, attachmentId: string): string {
  return `media/${userId}/${attachmentId}`;
}

/**
 * Private Vercel Blob adapter. Objects live under `media/<userId>/…` and are
 * uploaded with `access: "private"`, so no permanent public URL exists; the
 * application serves bytes only through its authenticated media routes.
 */
export function createVercelBlobStore(token: string): PrivateBlobStore {
  return {
    async put(input) {
      const pathname = pathnameFor(input.userId, input.attachmentId);

      // Client-generated attachment ids are stable across sync retries, so an
      // existing object means this operation already succeeded.
      try {
        await head(pathname, { token });
        return { attachmentId: input.attachmentId, duplicate: true };
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
      }

      await put(pathname, Buffer.from(input.bytes), {
        access: "private",
        token,
        contentType: input.mimeType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      return { attachmentId: input.attachmentId, duplicate: false };
    },

    async get(userId, attachmentId): Promise<BlobObject | null> {
      const pathname = pathnameFor(userId, attachmentId);
      try {
        const result = await get(pathname, { access: "private", token });
        if (!result || result.statusCode !== 200) return null;
        return {
          userId,
          attachmentId,
          mimeType: result.blob.contentType,
          bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
          operationId: "",
        };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },

    async delete(userId, attachmentId) {
      const pathname = pathnameFor(userId, attachmentId);
      try {
        await head(pathname, { token });
      } catch (error) {
        if (error instanceof BlobNotFoundError) return { deleted: false };
        throw error;
      }
      await del(pathname, { token });
      return { deleted: true };
    },

    // Lets the media route answer 403 rather than 404 when a caller probes
    // an attachment identifier that belongs to someone else.
    async existsForOtherUser(userId, attachmentId) {
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: "media/", token, cursor });
        for (const blob of page.blobs) {
          if (
            blob.pathname.endsWith(`/${attachmentId}`) &&
            blob.pathname !== pathnameFor(userId, attachmentId)
          ) {
            return true;
          }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return false;
    },
  };
}
