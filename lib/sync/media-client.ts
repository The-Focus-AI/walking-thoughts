import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import type { CaptureStore, LocalCapture } from "@/lib/local-capture/types";

export type MediaTransport = {
  upload(input: {
    attachmentId: string;
    operationId: string;
    mimeType: string;
    bytes: Blob;
  }): Promise<{ attachmentId: string; duplicate: boolean }>;
};

type MediaGlobals = typeof globalThis & {
  __WT_MEDIA_TRANSPORT__?: MediaTransport;
};

function defaultMediaTransport(): MediaTransport {
  const headers = (): HeadersInit => {
    const result: Record<string, string> = {};
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) {
      result["x-walking-thoughts-test-user"] = testUser;
    }
    return result;
  };

  return {
    async upload({ attachmentId, operationId, mimeType, bytes }) {
      const body = new FormData();
      body.set("attachmentId", attachmentId);
      body.set("operationId", operationId);
      body.set("mimeType", mimeType);
      body.set("file", bytes, attachmentId);
      const response = await fetch("/api/sync/media", {
        method: "POST",
        headers: headers(),
        body,
      });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 503
      ) {
        throw new Error("media_sync_unavailable");
      }
      if (!response.ok) {
        throw new Error(`media_upload_${response.status}`);
      }
      return (await response.json()) as {
        attachmentId: string;
        duplicate: boolean;
      };
    },
  };
}

export function getMediaTransport(): MediaTransport {
  return (
    (globalThis as MediaGlobals).__WT_MEDIA_TRANSPORT__ ??
    defaultMediaTransport()
  );
}

function pendingMedia(captures: LocalCapture[]) {
  return captures.flatMap((capture) =>
    capture.attachments
      .filter(
        (attachment) =>
          attachment.syncStatus === "saved_locally" ||
          attachment.syncStatus === "needs_attention",
      )
      .map((attachment) => ({ capture, attachment })),
  );
}

export async function synchronizePendingMedia(
  store: CaptureStore,
  transport: MediaTransport = getMediaTransport(),
  mediaStore = createIdbMediaStore(),
): Promise<void> {
  const pending = pendingMedia(await store.list());
  if (pending.length === 0) return;

  for (const { capture, attachment } of pending) {
    try {
      const blob = await mediaStore.get(attachment.localObjectKey);
      if (!blob) {
        throw new Error("local_media_missing");
      }
      const result = await transport.upload({
        attachmentId: attachment.id,
        operationId: attachment.id,
        mimeType: attachment.mimeType,
        bytes: blob,
      });
      await store.updateAttachment(capture.id, attachment.id, {
        syncStatus: "complete",
        remoteObjectKey: result.attachmentId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "media_sync_unavailable"
      ) {
        continue;
      }
      await store.updateAttachment(capture.id, attachment.id, {
        syncStatus: "needs_attention",
      });
    }
  }
}
