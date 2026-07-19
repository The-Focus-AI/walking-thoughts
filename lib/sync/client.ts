import type { CaptureStore, LocalCapture } from "@/lib/local-capture/types";
import type { SyncBatchResponse, SyncCapturePayload } from "./types";

export type SyncPushResult =
  | { unavailable: true }
  | SyncBatchResponse;

export type SyncTransport = {
  pushCaptures(captures: SyncCapturePayload[]): Promise<SyncPushResult>;
};

type SyncClientGlobals = typeof globalThis & {
  __WT_SYNC_TRANSPORT__?: SyncTransport;
};

function isBatch(result: SyncPushResult): result is SyncBatchResponse {
  return !("unavailable" in result);
}

function defaultTransport(): SyncTransport {
  const headers = (): HeadersInit => {
    const result: Record<string, string> = {
      "content-type": "application/json",
    };
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) {
      result["x-walking-thoughts-test-user"] = testUser;
    }
    return result;
  };

  return {
    async pushCaptures(captures) {
      const response = await fetch("/api/sync/captures", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ captures }),
      });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 503
      ) {
        return { unavailable: true };
      }
      if (!response.ok) {
        return {
          results: [],
          failures: captures.map((capture) => ({
            id: capture.id,
            status: "needs_attention" as const,
            reason: `http_${response.status}`,
            retryable: response.status >= 500,
          })),
        };
      }
      return (await response.json()) as SyncBatchResponse;
    },
  };
}

export function getSyncTransport(): SyncTransport {
  return (
    (globalThis as SyncClientGlobals).__WT_SYNC_TRANSPORT__ ?? defaultTransport()
  );
}

function toPayload(capture: LocalCapture): SyncCapturePayload {
  return {
    id: capture.id,
    text: capture.text,
    createdAt: capture.createdAt,
    location: capture.location,
    threadId: capture.threadId,
    sequence: capture.sequence,
    idempotencyKey: capture.id,
    attachments: capture.attachments.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
    })),
  };
}

/** True when every local media blob for this Capture has already uploaded. */
export function captureReadyForMetadataPush(capture: LocalCapture): boolean {
  return capture.attachments.every(
    (attachment) =>
      attachment.localObjectKey == null ||
      attachment.syncStatus === "complete",
  );
}

/**
 * Outbox eligibility: saved / needs attention / abandoned syncing, and media
 * already pushed when the Capture still holds a local original.
 */
function pendingCaptures(captures: LocalCapture[]): LocalCapture[] {
  return captures.filter(
    (capture) =>
      (capture.status === "saved_locally" ||
        capture.status === "needs_attention" ||
        capture.status === "syncing") &&
      captureReadyForMetadataPush(capture),
  );
}

export async function synchronizePendingCaptures(
  store: CaptureStore,
  transport: SyncTransport = getSyncTransport(),
): Promise<SyncBatchResponse> {
  const pending = pendingCaptures(await store.list());
  if (pending.length === 0) {
    return { results: [], failures: [] };
  }

  const ids = pending.map((capture) => capture.id);
  await store.markSyncing(ids);

  try {
    const result = await transport.pushCaptures(pending.map(toPayload));

    if (!isBatch(result)) {
      await store.restoreSavedLocally(ids);
      return { results: [], failures: [] };
    }

    await store.applySyncBatch(result);
    return result;
  } catch {
    const failures = ids.map((id) => ({
      id,
      status: "needs_attention" as const,
      reason: "transport_error",
      retryable: true,
    }));
    await store.applySyncBatch({ results: [], failures });
    return { results: [], failures };
  }
}
