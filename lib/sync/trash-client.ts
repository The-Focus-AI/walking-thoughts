import type { CaptureStore, LocalTrashRecord } from "@/lib/local-capture/types";
import type { TrashBatchResponse, TrashMutation, TrashRecord } from "./types";

export type TrashPushResult = { unavailable: true } | TrashBatchResponse;

export type TrashTransport = {
  pushTrashMutations(mutations: TrashMutation[]): Promise<TrashPushResult>;
  pullTrash(): Promise<{ unavailable: true } | { records: TrashRecord[] }>;
};

type TrashClientGlobals = typeof globalThis & {
  __WT_TRASH_TRANSPORT__?: TrashTransport;
};

function isBatch(result: TrashPushResult): result is TrashBatchResponse {
  return !("unavailable" in result);
}

function headers(): HeadersInit {
  const result: Record<string, string> = {
    "content-type": "application/json",
  };
  const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
  if (testUser) {
    result["x-walking-thoughts-test-user"] = testUser;
  }
  return result;
}

function defaultTransport(): TrashTransport {
  return {
    async pushTrashMutations(mutations) {
      const response = await fetch("/api/sync/trash", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ mutations }),
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
          failures: mutations.map((mutation) => ({
            idempotencyKey: mutation.idempotencyKey,
            status: "needs_attention" as const,
            reason: `http_${response.status}`,
            retryable: response.status >= 500,
          })),
        };
      }
      return (await response.json()) as TrashBatchResponse;
    },
    async pullTrash() {
      const response = await fetch("/api/sync/trash", {
        method: "GET",
        headers: headers(),
      });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 503
      ) {
        return { unavailable: true };
      }
      if (!response.ok) {
        return { unavailable: true };
      }
      const body = (await response.json()) as { records?: TrashRecord[] };
      return { records: body.records ?? [] };
    },
  };
}

export function getTrashTransport(): TrashTransport {
  return (
    (globalThis as TrashClientGlobals).__WT_TRASH_TRANSPORT__ ??
    defaultTransport()
  );
}

function toMutation(record: LocalTrashRecord): TrashMutation {
  if (!record.pendingAction) {
    throw new Error("pending_action_required");
  }
  return {
    action: record.pendingAction,
    kind: record.kind,
    targetId: record.targetId,
    trashedAt: record.trashedAt,
    attachmentIds: record.attachmentIds,
    idempotencyKey: record.idempotencyKey,
    now: new Date().toISOString(),
  };
}

export async function synchronizeTrash(
  store: CaptureStore,
  transport: TrashTransport = getTrashTransport(),
): Promise<TrashBatchResponse> {
  const pending = await store.listPendingTrashMutations();
  let pushResult: TrashBatchResponse = { results: [], failures: [] };

  if (pending.length > 0) {
    const keys = pending.map((record) => record.idempotencyKey);
    await store.markTrashSyncing(keys);
    const result = await transport.pushTrashMutations(pending.map(toMutation));
    if (!isBatch(result)) {
      await store.restoreTrashSavedLocally(keys);
    } else {
      await store.applyTrashSyncBatch(result);
      pushResult = result;
    }
  }

  const pull = await transport.pullTrash();
  if (!("unavailable" in pull)) {
    await store.applyRemoteTrash(pull.records);
  }

  return pushResult;
}
