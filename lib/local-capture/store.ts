import {
  createIdbMediaStore,
  createMemoryMediaStore,
  type MediaStore,
} from "./media-store";
import { resolveCommitDestination, titleFromText } from "./thread-destination";
import type {
  AttachmentInput,
  CaptureLocation,
  CaptureStore,
  CommitOptions,
  LocalAttachment,
  LocalCapture,
  LocalThread,
  SyncBatchApplication,
} from "./types";

const DB_NAME = "walking-thoughts";
const DB_VERSION = 4;
const DRAFT_KEY = "composer";

type CaptureStoreGlobals = typeof globalThis & {
  __WT_CAPTURE_STORE__?: CaptureStore;
};

function createId(): string {
  return crypto.randomUUID();
}

function createTimestamp(): string {
  return new Date().toISOString();
}

function normalizeText(text: string): string {
  return text.trim();
}

function newestFirst(captures: LocalCapture[]): LocalCapture[] {
  return [...captures].sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return b.sequence - a.sequence;
  });
}

function oldestBySequence(captures: LocalCapture[]): LocalCapture[] {
  return [...captures].sort((a, b) => a.sequence - b.sequence);
}

function toBlob(bytes: AttachmentInput["bytes"], mimeType: string): Blob {
  if (bytes instanceof Blob) return bytes;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copy into a fresh ArrayBuffer-backed Uint8Array for BlobPart typing.
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new Blob([copy], { type: mimeType });
}

async function persistAttachments(
  mediaStore: MediaStore,
  captureId: string,
  inputs: AttachmentInput[],
): Promise<LocalAttachment[]> {
  const writtenKeys: string[] = [];
  try {
    const attachments: LocalAttachment[] = [];
    for (const input of inputs) {
      const id = input.id ?? createId();
      const localObjectKey = `${captureId}/${id}`;
      const blob = toBlob(input.bytes, input.mimeType);
      await mediaStore.put(localObjectKey, blob);
      writtenKeys.push(localObjectKey);
      attachments.push({
        id,
        kind: input.kind,
        mimeType: input.mimeType,
        fileName: input.fileName,
        byteLength: blob.size,
        localObjectKey,
        remoteObjectKey: null,
        syncStatus: "saved_locally",
      });
    }
    return attachments;
  } catch (error) {
    await Promise.allSettled(
      writtenKeys.map((key) => mediaStore.delete(key)),
    );
    throw error;
  }
}

function buildCaptureBase(
  text: string,
  location: CaptureLocation | null,
  attachmentCount: number,
): Omit<LocalCapture, "threadId" | "sequence" | "attachments"> {
  const normalized = normalizeText(text);
  if (!normalized && attachmentCount === 0) {
    throw new Error("Capture text or media is required");
  }

  return {
    id: createId(),
    text: normalized,
    createdAt: createTimestamp(),
    location,
    status: "saved_locally",
  };
}

function upsertThread(threads: LocalThread[], thread: LocalThread): LocalThread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)];
}

export function createMemoryCaptureStore(
  seed: {
    draft?: string;
    captures?: LocalCapture[];
    threads?: LocalThread[];
    mediaStore?: MediaStore;
  } = {},
): CaptureStore {
  let draft = seed.draft ?? "";
  let captures = [...(seed.captures ?? [])];
  let threads = [...(seed.threads ?? [])];
  const mediaStore = seed.mediaStore ?? createMemoryMediaStore();

  return {
    async getDraft() {
      return draft;
    },
    async setDraft(text) {
      draft = text;
    },
    async list() {
      return newestFirst(captures);
    },
    async listInbox() {
      return newestFirst(captures.filter((capture) => capture.threadId === null));
    },
    async listRecentThreads() {
      return [...threads].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      );
    },
    async listThread(threadId) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) {
        throw new Error("Thread not found");
      }
      return {
        thread,
        captures: oldestBySequence(
          captures.filter((capture) => capture.threadId === threadId),
        ),
      };
    },
    async commit(text, location, options: CommitOptions = {}) {
      const inputs = options.attachments ?? [];
      const base = buildCaptureBase(text, location, inputs.length);
      const attachments = await persistAttachments(
        mediaStore,
        base.id,
        inputs,
      );
      const resolved = resolveCommitDestination({
        destination: options.destination ?? { type: "inbox" },
        text: base.text || attachments[0]?.fileName || "Capture",
        captures,
        threads,
        createId,
        now: createTimestamp,
      });
      if (resolved.thread) {
        threads = upsertThread(threads, resolved.thread);
      }
      const capture: LocalCapture = {
        ...base,
        threadId: resolved.threadId,
        sequence: resolved.sequence,
        attachments,
      };
      captures = [capture, ...captures];
      draft = "";
      return capture;
    },
    async markSyncing(ids) {
      const idSet = new Set(ids);
      captures = captures.map((capture) =>
        idSet.has(capture.id)
          ? {
              ...capture,
              status: "syncing",
              syncReason: null,
              syncRetryable: undefined,
            }
          : capture,
      );
    },
    async restoreSavedLocally(ids) {
      const idSet = new Set(ids);
      captures = captures.map((capture) =>
        idSet.has(capture.id)
          ? {
              ...capture,
              status: "saved_locally",
              syncReason: null,
              syncRetryable: undefined,
            }
          : capture,
      );
    },
    async applySyncBatch(batch: SyncBatchApplication) {
      const byId = new Map(captures.map((capture) => [capture.id, capture]));
      for (const result of batch.results) {
        const current = byId.get(result.id);
        if (!current) continue;
        const next: LocalCapture = {
          ...current,
          status: "complete",
          threadId: result.threadId,
          sequence: result.sequence,
          syncReason: null,
          syncRetryable: undefined,
        };
        byId.set(result.id, next);
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
      captures = [...byId.values()];
    },
    async updateAttachment(captureId, attachmentId, patch) {
      captures = captures.map((capture) => {
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
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts");
      }
      if (!db.objectStoreNames.contains("captures")) {
        db.createObjectStore("captures", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("threads")) {
        db.createObjectStore("threads", { keyPath: "id" });
      }

      const transaction = request.transaction;
      if (transaction && db.objectStoreNames.contains("captures")) {
        const store = transaction.objectStore("captures");
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as LocalCapture;
          cursor.update(normalizeCapture(value));
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function normalizeCapture(value: LocalCapture): LocalCapture {
  return {
    ...value,
    threadId: value.threadId ?? null,
    sequence: value.sequence ?? 1,
    status: value.status ?? "saved_locally",
    syncReason: value.syncReason ?? null,
    attachments: value.attachments ?? [],
  };
}

async function rewriteCaptureStatuses(
  ids: string[],
  patch: Pick<LocalCapture, "status" | "syncReason" | "syncRetryable">,
): Promise<void> {
  const idSet = new Set(ids);
  const db = await openDatabase();
  try {
    const existing = (
      (await requestToPromise(
        db.transaction("captures", "readonly").objectStore("captures").getAll(),
      )) as LocalCapture[]
    ).map(normalizeCapture);
    const transaction = db.transaction("captures", "readwrite");
    const store = transaction.objectStore("captures");
    for (const capture of existing) {
      if (!idSet.has(capture.id)) continue;
      store.put({ ...capture, ...patch });
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export function createIdbCaptureStore(): CaptureStore {
  return {
    async getDraft() {
      const db = await openDatabase();
      try {
        const value = await requestToPromise(
          db.transaction("drafts", "readonly").objectStore("drafts").get(DRAFT_KEY),
        );
        return typeof value === "string" ? value : "";
      } finally {
        db.close();
      }
    },

    async setDraft(text) {
      const db = await openDatabase();
      try {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(text, DRAFT_KEY);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },

    async list() {
      const db = await openDatabase();
      try {
        const captures = await requestToPromise(
          db.transaction("captures", "readonly").objectStore("captures").getAll(),
        );
        return newestFirst((captures as LocalCapture[]).map(normalizeCapture));
      } finally {
        db.close();
      }
    },

    async listInbox() {
      const captures = await this.list();
      return captures.filter((capture) => capture.threadId === null);
    },

    async listRecentThreads() {
      const db = await openDatabase();
      try {
        const threads = await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").getAll(),
        );
        return [...(threads as LocalThread[])].sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      } finally {
        db.close();
      }
    },

    async listThread(threadId) {
      const db = await openDatabase();
      try {
        const thread = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").get(threadId),
        )) as LocalThread | undefined;
        if (!thread) {
          throw new Error("Thread not found");
        }
        const captures = await requestToPromise(
          db.transaction("captures", "readonly").objectStore("captures").getAll(),
        );
        return {
          thread,
          captures: oldestBySequence(
            (captures as LocalCapture[])
              .map(normalizeCapture)
              .filter((capture) => capture.threadId === threadId),
          ),
        };
      } finally {
        db.close();
      }
    },

    async commit(text, location: CaptureLocation | null, options: CommitOptions = {}) {
      const inputs = options.attachments ?? [];
      const base = buildCaptureBase(text, location, inputs.length);
      const mediaStore = createIdbMediaStore();
      const attachments = await persistAttachments(mediaStore, base.id, inputs);
      const db = await openDatabase();
      try {
        const existingThreads = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").getAll(),
        )) as LocalThread[];
        const existingCaptures = (
          (await requestToPromise(
            db.transaction("captures", "readonly").objectStore("captures").getAll(),
          )) as LocalCapture[]
        ).map(normalizeCapture);

        const resolved = resolveCommitDestination({
          destination: options.destination ?? { type: "inbox" },
          text: base.text || attachments[0]?.fileName || "Capture",
          captures: existingCaptures,
          threads: existingThreads,
          createId,
          now: createTimestamp,
        });

        const capture: LocalCapture = {
          ...base,
          threadId: resolved.threadId,
          sequence: resolved.sequence,
          attachments,
        };

        const transaction = db.transaction(
          ["captures", "drafts", "threads"],
          "readwrite",
        );
        transaction.objectStore("captures").put(capture);
        transaction.objectStore("drafts").put("", DRAFT_KEY);
        if (resolved.thread) {
          transaction.objectStore("threads").put(resolved.thread);
        }
        await transactionDone(transaction);
        return capture;
      } catch (error) {
        await Promise.allSettled(
          attachments.map((attachment) =>
            mediaStore.delete(attachment.localObjectKey),
          ),
        );
        throw error;
      } finally {
        db.close();
      }
    },

    async markSyncing(ids) {
      await rewriteCaptureStatuses(ids, {
        status: "syncing",
        syncReason: null,
        syncRetryable: undefined,
      });
    },

    async restoreSavedLocally(ids) {
      await rewriteCaptureStatuses(ids, {
        status: "saved_locally",
        syncReason: null,
        syncRetryable: undefined,
      });
    },

    async applySyncBatch(batch: SyncBatchApplication) {
      const db = await openDatabase();
      try {
        const existingCaptures = (
          (await requestToPromise(
            db.transaction("captures", "readonly").objectStore("captures").getAll(),
          )) as LocalCapture[]
        ).map(normalizeCapture);
        const existingThreads = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").getAll(),
        )) as LocalThread[];
        const byId = new Map(
          existingCaptures.map((capture) => [capture.id, capture]),
        );
        let threads = [...existingThreads];

        for (const result of batch.results) {
          const current = byId.get(result.id);
          if (!current) continue;
          byId.set(result.id, {
            ...current,
            status: "complete",
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

        const transaction = db.transaction(["captures", "threads"], "readwrite");
        const captureStore = transaction.objectStore("captures");
        const threadStore = transaction.objectStore("threads");
        for (const capture of byId.values()) {
          captureStore.put(capture);
        }
        for (const thread of threads) {
          threadStore.put(thread);
        }
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },

    async updateAttachment(captureId, attachmentId, patch) {
      const db = await openDatabase();
      try {
        const existing = (await requestToPromise(
          db.transaction("captures", "readonly").objectStore("captures").get(captureId),
        )) as LocalCapture | undefined;
        if (!existing) return;
        const next = normalizeCapture({
          ...existing,
          attachments: (existing.attachments ?? []).map((attachment) =>
            attachment.id === attachmentId
              ? { ...attachment, ...patch }
              : attachment,
          ),
        });
        const transaction = db.transaction("captures", "readwrite");
        transaction.objectStore("captures").put(next);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
  };
}

let defaultStore: CaptureStore | null = null;

export function getCaptureStore(): CaptureStore {
  const hooked = (globalThis as CaptureStoreGlobals).__WT_CAPTURE_STORE__;
  if (hooked) return hooked;

  if (!defaultStore) {
    defaultStore = createIdbCaptureStore();
    (globalThis as CaptureStoreGlobals).__WT_CAPTURE_STORE__ = defaultStore;
  }
  return defaultStore;
}
