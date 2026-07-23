import { titleFromText } from "@/lib/local-capture/thread-destination";
import { expiresAtFrom, isExpired } from "./trash";
import type {
  PurgeExpiredResult,
  PurgeTarget,
  ServerThread,
  SyncBatchResponse,
  SyncCapturePayload,
  SyncCaptureResult,
  ThreadRepository,
  ThreadSplitResult,
  TrashBatchResponse,
  TrashMutation,
  TrashMutationResult,
  TrashRecord,
} from "./types";

type StoredCapture = SyncCapturePayload & { userId: string };
type StoredThread = {
  id: string;
  userId: string;
  title: string;
  revision: number;
  updatedAt: string;
  reviewedAt?: string | null;
};

type MemoryState = {
  captures: Map<string, StoredCapture>;
  threads: Map<string, StoredThread>;
  /** idempotencyKey -> capture id */
  idempotency: Map<string, string>;
  trash: Map<string, TrashRecord & { userId: string }>;
  trashOps: Map<string, TrashMutationResult>;
  purgeOps: Map<string, PurgeExpiredResult>;
};

function createState(): MemoryState {
  return {
    captures: new Map(),
    threads: new Map(),
    idempotency: new Map(),
    trash: new Map(),
    trashOps: new Map(),
    purgeOps: new Map(),
  };
}

const states = new Map<string, MemoryState>();

function stateFor(namespace: string): MemoryState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created = createState();
  states.set(namespace, created);
  return created;
}

export function resetMemoryThreadRepository(namespace = "default"): void {
  states.set(namespace, createState());
}

function trashKey(userId: string, kind: string, targetId: string): string {
  return `${userId}:${kind}:${targetId}`;
}

function isTrashed(
  db: MemoryState,
  userId: string,
  kind: "capture" | "thread",
  targetId: string,
): boolean {
  return db.trash.has(trashKey(userId, kind, targetId));
}

function collectAttachmentIds(
  db: MemoryState,
  userId: string,
  kind: "capture" | "thread",
  targetId: string,
  provided: string[] | undefined,
): string[] {
  if (provided && provided.length > 0) {
    return [...new Set(provided)];
  }
  if (kind === "capture") {
    const capture = db.captures.get(`${userId}:${targetId}`);
    return (capture?.attachments ?? []).map((attachment) => attachment.id);
  }
  return [...db.captures.values()]
    .filter(
      (capture) =>
        capture.userId === userId && capture.threadId === targetId,
    )
    .flatMap((capture) =>
      (capture.attachments ?? []).map((attachment) => attachment.id),
    );
}

function applyTrash(
  db: MemoryState,
  userId: string,
  mutation: TrashMutation,
): TrashMutationResult {
  const opKey = `${userId}:${mutation.idempotencyKey}`;
  const prior = db.trashOps.get(opKey);
  if (prior) return prior;

  if (mutation.action === "trash") {
    if (!mutation.trashedAt) {
      throw new Error("trashedAt_required");
    }
    const key = trashKey(userId, mutation.kind, mutation.targetId);
    const existing = db.trash.get(key);
    if (existing) {
      const result: TrashMutationResult = {
        idempotencyKey: mutation.idempotencyKey,
        status: "complete",
        record: {
          kind: existing.kind,
          targetId: existing.targetId,
          trashedAt: existing.trashedAt,
          expiresAt: existing.expiresAt,
          attachmentIds: existing.attachmentIds,
        },
      };
      db.trashOps.set(opKey, result);
      return result;
    }

    const record: TrashRecord = {
      kind: mutation.kind,
      targetId: mutation.targetId,
      trashedAt: mutation.trashedAt,
      expiresAt: expiresAtFrom(mutation.trashedAt),
      attachmentIds: collectAttachmentIds(
        db,
        userId,
        mutation.kind,
        mutation.targetId,
        mutation.attachmentIds,
      ),
    };
    db.trash.set(key, { ...record, userId });
    const result: TrashMutationResult = {
      idempotencyKey: mutation.idempotencyKey,
      status: "complete",
      record,
    };
    db.trashOps.set(opKey, result);
    return result;
  }

  // restore
  const key = trashKey(userId, mutation.kind, mutation.targetId);
  const existing = db.trash.get(key);
  if (existing) {
    const now = mutation.now ?? new Date().toISOString();
    if (isExpired(existing.expiresAt, now)) {
      throw new Error("trash_expired");
    }
  }
  db.trash.delete(key);
  const result: TrashMutationResult = {
    idempotencyKey: mutation.idempotencyKey,
    status: "complete",
    record: null,
  };
  db.trashOps.set(opKey, result);
  return result;
}

function permanentlyRemove(
  db: MemoryState,
  userId: string,
  record: TrashRecord & { userId: string },
): PurgeTarget {
  if (record.kind === "capture") {
    const existing = db.captures.get(`${userId}:${record.targetId}`);
    db.captures.delete(`${userId}:${record.targetId}`);
    if (existing?.threadId) {
      const remaining = [...db.captures.values()].some(
        (capture) =>
          capture.userId === userId && capture.threadId === existing.threadId,
      );
      if (!remaining) {
        db.threads.delete(`${userId}:${existing.threadId}`);
      }
    }
  } else {
    const captureIds = [...db.captures.values()]
      .filter(
        (capture) =>
          capture.userId === userId && capture.threadId === record.targetId,
      )
      .map((capture) => capture.id);
    for (const captureId of captureIds) {
      db.captures.delete(`${userId}:${captureId}`);
    }
    db.threads.delete(`${userId}:${record.targetId}`);
  }
  db.trash.delete(trashKey(userId, record.kind, record.targetId));
  return {
    kind: record.kind,
    targetId: record.targetId,
    attachmentIds: [...record.attachmentIds],
  };
}

export function createMemoryThreadRepository(
  namespace = "default",
): ThreadRepository {
  const state = () => stateFor(namespace);

  return {
    async upsertCaptures(userId, captures) {
      const results: SyncCaptureResult[] = [];
      const failures: SyncBatchResponse["failures"] = [];
      const db = state();

      for (const payload of captures) {
        try {
          const idempotencyScope = `${userId}:${payload.idempotencyKey}`;
          const existingId = db.idempotency.get(idempotencyScope);
          if (existingId) {
            const existing = db.captures.get(`${userId}:${existingId}`);
            if (!existing?.threadId) {
              throw new Error("Stored Capture missing Thread");
            }
            results.push({
              id: existing.id,
              threadId: existing.threadId,
              sequence: existing.sequence,
              status: "complete",
            });
            continue;
          }

          let threadId = payload.threadId;
          if (!threadId) {
            threadId = payload.id;
            db.threads.set(`${userId}:${threadId}`, {
              id: threadId,
              userId,
              title: titleFromText(payload.text),
              revision: payload.sequence,
              updatedAt: payload.createdAt,
            });
          } else {
            const key = `${userId}:${threadId}`;
            const existingThread = db.threads.get(key);
            if (!existingThread) {
              db.threads.set(key, {
                id: threadId,
                userId,
                title: titleFromText(payload.text),
                revision: payload.sequence,
                updatedAt: payload.createdAt,
              });
            } else {
              db.threads.set(key, {
                ...existingThread,
                revision: Math.max(existingThread.revision, payload.sequence),
                updatedAt:
                  payload.createdAt > existingThread.updatedAt
                    ? payload.createdAt
                    : existingThread.updatedAt,
              });
            }
          }

          const stored: StoredCapture = {
            ...payload,
            threadId,
            userId,
          };
          db.captures.set(`${userId}:${payload.id}`, stored);
          db.idempotency.set(idempotencyScope, payload.id);
          results.push({
            id: payload.id,
            threadId,
            sequence: payload.sequence,
            status: "complete",
          });
        } catch (error) {
          failures.push({
            id: payload.id,
            status: "needs_attention",
            reason: error instanceof Error ? error.message : "sync_failed",
            retryable: true,
          });
        }
      }

      return { results, failures };
    },

    async listThreads(userId) {
      const db = state();
      const threads = [...db.threads.values()]
        .filter(
          (thread) =>
            thread.userId === userId &&
            !isTrashed(db, userId, "thread", thread.id),
        )
        .sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );

      return threads
        .map((thread) => {
          const captures = [...db.captures.values()]
            .filter(
              (capture) =>
                capture.userId === userId &&
                capture.threadId === thread.id &&
                !isTrashed(db, userId, "capture", capture.id),
            )
            .sort((a, b) => a.sequence - b.sequence)
            .map((capture) => ({
              id: capture.id,
              text: capture.text,
              createdAt: capture.createdAt,
              location: capture.location,
              sequence: capture.sequence,
              attachments: capture.attachments ?? [],
            }));
          return {
            id: thread.id,
            title: thread.title,
            revision: thread.revision,
            updatedAt: thread.updatedAt,
            reviewedAt: thread.reviewedAt ?? null,
            captures,
          } satisfies ServerThread;
        })
        .filter((thread) => thread.captures.length > 0);
    },

    async splitThread(userId, threadId, now = new Date().toISOString()) {
      const db = state();
      const captures = [...db.captures.values()]
        .filter(
          (capture) =>
            capture.userId === userId &&
            capture.threadId === threadId &&
            !isTrashed(db, userId, "capture", capture.id),
        )
        .sort((a, b) => a.sequence - b.sequence);

      const result: ThreadSplitResult = { moves: [], trashedThreadId: null };
      if (captures.length <= 1) return result;

      for (const capture of captures) {
        const newThreadId = capture.id;
        const title = titleFromText(capture.text || "Capture");
        const key = `${userId}:${newThreadId}`;
        if (!db.threads.has(key)) {
          db.threads.set(key, {
            id: newThreadId,
            userId,
            title,
            revision: 1,
            updatedAt: capture.createdAt,
          });
        }
        db.captures.set(`${userId}:${capture.id}`, {
          ...capture,
          threadId: newThreadId,
          sequence: 1,
        });
        result.moves.push({
          captureId: capture.id,
          threadId: newThreadId,
          title,
          createdAt: capture.createdAt,
        });
      }

      // Media now belongs to the moved Captures — the emptied Thread's
      // Trash record must not claim (and later purge) any attachments.
      applyTrash(db, userId, {
        action: "trash",
        kind: "thread",
        targetId: threadId,
        trashedAt: now,
        attachmentIds: [],
        idempotencyKey: `split:${threadId}`,
      });
      result.trashedThreadId = threadId;
      return result;
    },

    async applyTrashMutations(userId, mutations) {
      const db = state();
      const results: TrashMutationResult[] = [];
      const failures: TrashBatchResponse["failures"] = [];

      for (const mutation of mutations) {
        try {
          results.push(applyTrash(db, userId, mutation));
        } catch (error) {
          failures.push({
            idempotencyKey: mutation.idempotencyKey,
            status: "needs_attention",
            reason: error instanceof Error ? error.message : "trash_failed",
            retryable: true,
          });
        }
      }

      return { results, failures };
    },

    async listTrash(userId) {
      const db = state();
      return [...db.trash.values()]
        .filter((record) => record.userId === userId)
        .map((entry) => {
          const { userId: trashUserId, ...record } = entry;
          void trashUserId;
          return record;
        })
        .sort((a, b) =>
          a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0,
        );
    },

    async purgeExpired(userId, now, operationId) {
      const db = state();
      const opKey = `${userId}:${operationId}`;
      const prior = db.purgeOps.get(opKey);
      if (prior) {
        return { ...prior, duplicate: true };
      }

      const expired = [...db.trash.values()].filter(
        (record) =>
          record.userId === userId && isExpired(record.expiresAt, now),
      );
      const purged: PurgeTarget[] = expired.map((record) =>
        permanentlyRemove(db, userId, record),
      );
      const result: PurgeExpiredResult = { purged, duplicate: false };
      db.purgeOps.set(opKey, result);
      return result;
    },

    async updateThreadTitle(userId, threadId, title) {
      const db = state();
      const key = `${userId}:${threadId}`;
      const existing = db.threads.get(key);
      if (!existing) return;
      db.threads.set(key, { ...existing, title });
    },

    async setThreadReviewed(userId, threadId, reviewedAt) {
      const db = state();
      const key = `${userId}:${threadId}`;
      const existing = db.threads.get(key);
      if (!existing) throw new Error("thread_not_found");
      db.threads.set(key, { ...existing, reviewedAt });
      return { threadId, reviewedAt };
    },
  };
}
