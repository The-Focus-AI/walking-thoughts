import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import type { BlobObject, PrivateBlobStore } from "./memory-blob-store";

function pathnameFor(userId: string, attachmentId: string): string {
  return `media/${userId}/${attachmentId}`;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
          bytes: await readStream(result.stream),
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
  };
}
