import { titleFromText } from "@/lib/local-capture/thread-destination";
import type {
  ServerThread,
  SyncBatchResponse,
  SyncCapturePayload,
  SyncCaptureResult,
  ThreadRepository,
} from "./types";

type StoredCapture = SyncCapturePayload & { userId: string };
type StoredThread = {
  id: string;
  userId: string;
  title: string;
  revision: number;
  updatedAt: string;
};

type MemoryState = {
  captures: Map<string, StoredCapture>;
  threads: Map<string, StoredThread>;
  /** idempotencyKey -> capture id */
  idempotency: Map<string, string>;
};

function createState(): MemoryState {
  return {
    captures: new Map(),
    threads: new Map(),
    idempotency: new Map(),
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
        .filter((thread) => thread.userId === userId)
        .sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );

      return threads.map((thread) => {
        const captures = [...db.captures.values()]
          .filter(
            (capture) =>
              capture.userId === userId && capture.threadId === thread.id,
          )
          .sort((a, b) => a.sequence - b.sequence)
          .map((capture) => ({
            id: capture.id,
            text: capture.text,
            createdAt: capture.createdAt,
            location: capture.location,
            sequence: capture.sequence,
          }));
        return {
          id: thread.id,
          title: thread.title,
          revision: thread.revision,
          updatedAt: thread.updatedAt,
          captures,
        } satisfies ServerThread;
      });
    },
  };
}
