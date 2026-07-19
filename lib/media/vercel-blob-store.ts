import { del, get, head, put } from "@vercel/blob";
import type { PrivateBlobStore } from "./memory-blob-store";

function objectPath(userId: string, attachmentId: string): string {
  return `users/${userId}/attachments/${attachmentId}`;
}

function indexPath(attachmentId: string): string {
  return `indexes/attachments/${attachmentId}`;
}

function operationPath(userId: string, operationId: string): string {
  return `users/${userId}/ops/${operationId}`;
}

async function readPrivateBytes(
  pathname: string,
  token: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const result = await get(pathname, {
    access: "private",
    token,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const buffer = await new Response(result.stream).arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    contentType: result.blob.contentType || "application/octet-stream",
  };
}

async function readPrivateText(
  pathname: string,
  token: string,
): Promise<string | null> {
  const loaded = await readPrivateBytes(pathname, token);
  if (!loaded) return null;
  return new TextDecoder().decode(loaded.bytes);
}

/**
 * Private Vercel Blob adapter. Paths are user-scoped; a reverse index lets
 * cross-user identifier checks return 403 despite single-user v1.
 */
export function createVercelBlobStore(token: string): PrivateBlobStore {
  return {
    async put(input) {
      const existingOp = await readPrivateText(
        operationPath(input.userId, input.operationId),
        token,
      );
      if (existingOp) {
        return { attachmentId: existingOp, duplicate: true };
      }

      const pathname = objectPath(input.userId, input.attachmentId);
      const body = Buffer.from(input.bytes);
      await put(pathname, body, {
        access: "private",
        token,
        contentType: input.mimeType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      await put(indexPath(input.attachmentId), input.userId, {
        access: "private",
        token,
        contentType: "text/plain",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      await put(
        operationPath(input.userId, input.operationId),
        input.attachmentId,
        {
          access: "private",
          token,
          contentType: "text/plain",
          addRandomSuffix: false,
          allowOverwrite: true,
        },
      );
      return { attachmentId: input.attachmentId, duplicate: false };
    },

    async get(userId, attachmentId) {
      const loaded = await readPrivateBytes(
        objectPath(userId, attachmentId),
        token,
      );
      if (!loaded) return null;
      return {
        userId,
        attachmentId,
        mimeType: loaded.contentType,
        bytes: loaded.bytes,
        operationId: "",
      };
    },

    async delete(userId, attachmentId) {
      const pathname = objectPath(userId, attachmentId);
      try {
        await head(pathname, { token });
      } catch {
        return { deleted: false };
      }
      await del(pathname, { token });
      try {
        await del(indexPath(attachmentId), { token });
      } catch {
        // Index cleanup is best effort.
      }
      return { deleted: true };
    },

    async existsForOtherUser(userId, attachmentId) {
      const owner = await readPrivateText(indexPath(attachmentId), token);
      return Boolean(owner && owner !== userId);
    },
  };
}
