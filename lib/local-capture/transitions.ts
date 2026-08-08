import { expiresAtFrom } from "@/lib/sync/trash";
import { titleFromText } from "./thread-destination";
import type {
  CaptureStore,
  EnrichmentBatchApplication,
  LocalCapture,
  LocalThread,
  LocalTrashKind,
  LocalTrashRecord,
  SyncBatchApplication,
  TrashSyncApplication,
} from "./types";

/**
 * The domain rules of the capture store as pure transitions over
 * `{ captures, threads, trash }`. The memory store applies them to its
 * arrays directly; the IndexedDB store loads state, applies the same
 * function, and writes the result back — so a rule can never be fixed in
 * one store and stay broken in the other.
 */

export type ThreadSplitApplication = Parameters<
  CaptureStore["applyThreadSplit"]
>[0];
export type ThreadFilingApplication = Parameters<
  CaptureStore["applyThreadFiling"]
>[0];
export type RemoteTrashRecord = Parameters<
  CaptureStore["applyRemoteTrash"]
>[0][number];

export function trashMapKey(kind: LocalTrashKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

export function activeTrash(records: LocalTrashRecord[]): LocalTrashRecord[] {
  return records.filter((record) => record.pendingAction !== "restore");
}

export function isHiddenByTrash(
  trash: LocalTrashRecord[],
  kind: LocalTrashKind,
  targetId: string,
): boolean {
  return activeTrash(trash).some(
    (record) => record.kind === kind && record.targetId === targetId,
  );
}

export function visibleCaptures(
  captures: LocalCapture[],
  trash: LocalTrashRecord[],
): LocalCapture[] {
  return captures.filter(
    (capture) =>
      !isHiddenByTrash(trash, "capture", capture.id) &&
      !(
        capture.threadId && isHiddenByTrash(trash, "thread", capture.threadId)
      ),
  );
}

/** Threads still visible: not trashed themselves and holding a visible Capture. */
export function recentThreads(
  threads: LocalThread[],
  captures: LocalCapture[],
  trash: LocalTrashRecord[],
): LocalThread[] {
  const visibleThreadIds = new Set(
    visibleCaptures(captures, trash)
      .map((capture) => capture.threadId)
      .filter((threadId): threadId is string => threadId !== null),
  );
  return threads
    .filter(
      (thread) =>
        !isHiddenByTrash(trash, "thread", thread.id) &&
        visibleThreadIds.has(thread.id),
    )
    .sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
}

/** A Thread's Captures for review, minus individually trashed ones. */
export function threadCaptures(
  captures: LocalCapture[],
  trash: LocalTrashRecord[],
  threadId: string,
): LocalCapture[] {
  return captures.filter(
    (capture) =>
      capture.threadId === threadId &&
      !isHiddenByTrash(trash, "capture", capture.id),
  );
}

export function upsertThread(
  threads: LocalThread[],
  thread: LocalThread,
): LocalThread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)];
}

function attachmentIdsForCapture(capture: LocalCapture | undefined): string[] {
  return capture?.attachments.map((attachment) => attachment.id) ?? [];
}

function attachmentIdsForThread(
  captures: LocalCapture[],
  threadId: string,
): string[] {
  return captures
    .filter((capture) => capture.threadId === threadId)
    .flatMap((capture) => attachmentIdsForCapture(capture));
}

export function setCaptureSyncState(
  captures: LocalCapture[],
  ids: string[],
  patch: Pick<LocalCapture, "status" | "syncReason" | "syncRetryable">,
): LocalCapture[] {
  const idSet = new Set(ids);
  return captures.map((capture) =>
    idSet.has(capture.id) ? { ...capture, ...patch } : capture,
  );
}

export function applySyncBatchTransition(
  state: { captures: LocalCapture[]; threads: LocalThread[] },
  batch: SyncBatchApplication,
): { captures: LocalCapture[]; threads: LocalThread[] } {
  const byId = new Map(state.captures.map((capture) => [capture.id, capture]));
  let threads = state.threads;
  for (const result of batch.results) {
    const current = byId.get(result.id);
    if (!current) continue;
    byId.set(result.id, {
      ...current,
      status: "enriching",
      threadId: result.threadId,
      sequence: result.sequence,
      syncReason: null,
      syncRetryable: undefined,
    });
    if (!threads.some((thread) => thread.id === result.threadId)) {
      threads = upsertThread(threads, {
        id: result.threadId,
        title: titleFromText(current.text),
        revision: result.sequence,
        updatedAt: current.createdAt,
      });
    } else {
      threads = threads.map((thread) =>
        thread.id === result.threadId
          ? {
              ...thread,
              revision: Math.max(thread.revision, result.sequence),
              updatedAt: current.createdAt,
            }
          : thread,
      );
    }
  }
  for (const failure of batch.failures) {
    const current = byId.get(failure.id);
    if (!current) continue;
    byId.set(failure.id, {
      ...current,
      status: "needs_attention",
      syncReason: failure.reason,
      syncRetryable: failure.retryable,
    });
  }
  return { captures: [...byId.values()], threads };
}

export function applyEnrichmentBatchTransition(
  state: { captures: LocalCapture[]; threads: LocalThread[] },
  batch: EnrichmentBatchApplication,
): { captures: LocalCapture[]; threads: LocalThread[] } {
  const byId = new Map(state.captures.map((capture) => [capture.id, capture]));
  let threads = state.threads;
  for (const result of batch.results) {
    const current = byId.get(result.id);
    if (!current) continue;
    byId.set(result.id, {
      ...current,
      status: result.status,
      syncReason: result.reason ?? null,
      syncRetryable: result.retryable,
    });
    if (result.threadTitle) {
      threads = threads.map((thread) =>
        thread.id === result.threadId
          ? { ...thread, title: result.threadTitle as string }
          : thread,
      );
    }
  }
  return { captures: [...byId.values()], threads };
}

export function applyThreadSplitTransition(
  state: { captures: LocalCapture[]; threads: LocalThread[] },
  split: ThreadSplitApplication,
): { captures: LocalCapture[]; threads: LocalThread[] } {
  const moveByCapture = new Map(
    split.moves.map((move) => [move.captureId, move]),
  );
  const captures = state.captures.map((capture) => {
    const move = moveByCapture.get(capture.id);
    if (!move) return capture;
    return {
      ...capture,
      threadId: move.threadId,
      sequence: 1,
      status: "enriching" as const,
      syncReason: null,
      syncRetryable: undefined,
    };
  });
  let threads = state.threads;
  for (const move of split.moves) {
    if (!threads.some((thread) => thread.id === move.threadId)) {
      threads = upsertThread(threads, {
        id: move.threadId,
        title: move.title,
        revision: 1,
        updatedAt: move.createdAt,
      });
    }
  }
  if (split.trashedThreadId) {
    threads = threads.filter((thread) => thread.id !== split.trashedThreadId);
  }
  return { captures, threads };
}

export function fileThreadTransition(
  threads: LocalThread[],
  filing: ThreadFilingApplication,
): LocalThread[] {
  return threads.map((thread) =>
    thread.id === filing.threadId
      ? {
          ...thread,
          reviewedAt: filing.reviewedAt,
          kind: filing.kind ?? thread.kind ?? null,
          projectId:
            filing.projectId === undefined
              ? (thread.projectId ?? null)
              : filing.projectId,
          projectName:
            filing.projectId === undefined
              ? (thread.projectName ?? null)
              : (filing.projectName ?? null),
          researchVerdict:
            filing.researchVerdict === undefined
              ? (thread.researchVerdict ?? null)
              : filing.researchVerdict,
          route:
            filing.route === undefined
              ? (thread.route ?? null)
              : filing.route,
          specHandoff:
            filing.specHandoff === undefined
              ? (thread.specHandoff ?? null)
              : filing.specHandoff,
        }
      : thread,
  );
}

export function setThreadTodoDoneTransition(
  threads: LocalThread[],
  threadId: string,
  todoDoneAt: string | null,
): LocalThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, todoDoneAt } : thread,
  );
}

export function setThreadReviewedTransition(
  threads: LocalThread[],
  threadId: string,
  reviewedAt: string | null,
): LocalThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, reviewedAt } : thread,
  );
}

export function updateAttachmentTransition(
  captures: LocalCapture[],
  captureId: string,
  attachmentId: string,
  patch: Partial<LocalCapture["attachments"][number]>,
): LocalCapture[] {
  return captures.map((capture) => {
    if (capture.id !== captureId) return capture;
    return {
      ...capture,
      attachments: capture.attachments.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, ...patch }
          : attachment,
      ),
    };
  });
}

export function trashCaptureTransition(
  state: { captures: LocalCapture[]; trash: LocalTrashRecord[] },
  captureId: string,
  trashedAt: string,
): { trash: LocalTrashRecord[]; record: LocalTrashRecord } {
  const capture = state.captures.find((item) => item.id === captureId);
  if (!capture) throw new Error("Capture not found");
  const record: LocalTrashRecord = {
    kind: "capture",
    targetId: captureId,
    trashedAt,
    expiresAt: expiresAtFrom(trashedAt),
    attachmentIds: attachmentIdsForCapture(capture),
    syncStatus: "saved_locally",
    pendingAction: "trash",
    idempotencyKey: `trash:capture:${captureId}:${trashedAt}`,
  };
  return {
    record,
    trash: [
      record,
      ...state.trash.filter(
        (item) => !(item.kind === "capture" && item.targetId === captureId),
      ),
    ],
  };
}

export function trashThreadTransition(
  state: {
    captures: LocalCapture[];
    threads: LocalThread[];
    trash: LocalTrashRecord[];
  },
  threadId: string,
  trashedAt: string,
): { trash: LocalTrashRecord[]; record: LocalTrashRecord } {
  if (!state.threads.some((thread) => thread.id === threadId)) {
    throw new Error("Thread not found");
  }
  const record: LocalTrashRecord = {
    kind: "thread",
    targetId: threadId,
    trashedAt,
    expiresAt: expiresAtFrom(trashedAt),
    attachmentIds: attachmentIdsForThread(state.captures, threadId),
    syncStatus: "saved_locally",
    pendingAction: "trash",
    idempotencyKey: `trash:thread:${threadId}:${trashedAt}`,
  };
  return {
    record,
    trash: [
      record,
      ...state.trash.filter(
        (item) => !(item.kind === "thread" && item.targetId === threadId),
      ),
    ],
  };
}

/**
 * Restore from trash. A record that never left the device is simply dropped;
 * a synced one flips to a pending restore mutation. Returns the input array
 * unchanged (same reference) when there is nothing to restore.
 */
export function restoreFromTrashTransition(
  trash: LocalTrashRecord[],
  kind: LocalTrashKind,
  targetId: string,
  now: string,
  restoredAt: string,
): { trash: LocalTrashRecord[]; record: LocalTrashRecord | null } {
  const existing = trash.find(
    (item) => item.kind === kind && item.targetId === targetId,
  );
  if (!existing) return { trash, record: null };
  if (existing.expiresAt <= now) {
    throw new Error("trash_expired");
  }
  if (
    existing.syncStatus === "saved_locally" &&
    existing.pendingAction === "trash"
  ) {
    return {
      record: null,
      trash: trash.filter(
        (item) => !(item.kind === kind && item.targetId === targetId),
      ),
    };
  }
  const record: LocalTrashRecord = {
    ...existing,
    syncStatus: "saved_locally",
    pendingAction: "restore",
    idempotencyKey: `restore:${kind}:${targetId}:${restoredAt}`,
  };
  return {
    record,
    trash: trash.map((item) =>
      item.kind === kind && item.targetId === targetId ? record : item,
    ),
  };
}

export function trashNewestFirst(
  records: LocalTrashRecord[],
): LocalTrashRecord[] {
  return activeTrash(records).sort((a, b) =>
    a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0,
  );
}

export function pendingTrashMutations(
  trash: LocalTrashRecord[],
): LocalTrashRecord[] {
  return trash.filter(
    (item) =>
      item.pendingAction !== null &&
      (item.syncStatus === "saved_locally" ||
        item.syncStatus === "needs_attention"),
  );
}

export function setTrashSyncStatus(
  trash: LocalTrashRecord[],
  idempotencyKeys: string[],
  syncStatus: "syncing" | "saved_locally",
): LocalTrashRecord[] {
  const keys = new Set(idempotencyKeys);
  return trash.map((item) =>
    keys.has(item.idempotencyKey) ? { ...item, syncStatus } : item,
  );
}

export function applyTrashSyncBatchTransition(
  trash: LocalTrashRecord[],
  batch: TrashSyncApplication,
): LocalTrashRecord[] {
  let next = trash;
  for (const result of batch.results) {
    if (result.record === null) {
      next = next.filter(
        (item) => item.idempotencyKey !== result.idempotencyKey,
      );
      continue;
    }
    const record: LocalTrashRecord = {
      kind: result.record.kind,
      targetId: result.record.targetId,
      trashedAt: result.record.trashedAt,
      expiresAt: result.record.expiresAt,
      attachmentIds: result.record.attachmentIds,
      syncStatus: "complete",
      pendingAction: null,
      idempotencyKey: result.idempotencyKey,
    };
    next = [
      record,
      ...next.filter(
        (item) =>
          item.idempotencyKey !== result.idempotencyKey &&
          !(item.kind === record.kind && item.targetId === record.targetId),
      ),
    ];
  }
  for (const failure of batch.failures) {
    next = next.map((item) =>
      item.idempotencyKey === failure.idempotencyKey
        ? { ...item, syncStatus: "needs_attention" }
        : item,
    );
  }
  return next;
}

export function applyRemoteTrashTransition(
  trash: LocalTrashRecord[],
  records: RemoteTrashRecord[],
): LocalTrashRecord[] {
  const remoteKeys = new Set(
    records.map((record) => trashMapKey(record.kind, record.targetId)),
  );
  const pendingLocal = trash.filter(
    (item) =>
      item.pendingAction !== null &&
      (item.syncStatus === "saved_locally" ||
        item.syncStatus === "needs_attention" ||
        item.syncStatus === "syncing"),
  );
  const remoteRecords: LocalTrashRecord[] = records.map((record) => ({
    ...record,
    syncStatus: "complete",
    pendingAction: null,
    idempotencyKey: `remote:${record.kind}:${record.targetId}:${record.trashedAt}`,
  }));
  return [
    ...pendingLocal.filter(
      (item) => !remoteKeys.has(trashMapKey(item.kind, item.targetId)),
    ),
    ...remoteRecords,
  ];
}
