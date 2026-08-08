import { mergeRemoteThreads } from "@/lib/sync/hydrate";
import type { ServerThread } from "@/lib/sync/types";
import {
  createIdbMediaStore,
  createMemoryMediaStore,
  type MediaStore,
} from "./media-store";
import { resolveCommitDestination } from "./thread-destination";
import {
  applyEnrichmentBatchTransition,
  applyRemoteTrashTransition,
  applySyncBatchTransition,
  applyThreadSplitTransition,
  applyTrashSyncBatchTransition,
  fileThreadTransition,
  isHiddenByTrash,
  pendingTrashMutations,
  recentThreads,
  restoreFromTrashTransition,
  setCaptureSyncState,
  setThreadReviewedTransition,
  setThreadTodoDoneTransition,
  setTrashSyncStatus,
  threadCaptures,
  trashCaptureTransition,
  trashMapKey,
  trashNewestFirst,
  trashThreadTransition,
  updateAttachmentTransition,
  upsertThread,
  visibleCaptures,
} from "./transitions";
import type {
  AttachmentInput,
  CaptureLocation,
  CaptureStore,
  CommitOptions,
  EnrichmentBatchApplication,
  LocalAttachment,
  LocalCapture,
  LocalThread,
  LocalTrashRecord,
  SyncBatchApplication,
  TrashSyncApplication,
} from "./types";

const DB_NAME = "walking-thoughts";
const DB_VERSION = 5;
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
      const thumbnailObjectKey = `${localObjectKey}:thumb`;
      const blob = toBlob(input.bytes, input.mimeType);
      await mediaStore.put(localObjectKey, blob);
      writtenKeys.push(localObjectKey);
      // Retain a compact stand-in so offline Thread review stays meaningful
      // after the user removes the full local original.
      const thumb = new Blob(
        [`thumb:${input.fileName}:${input.kind}`],
        { type: "text/plain" },
      );
      await mediaStore.put(thumbnailObjectKey, thumb);
      writtenKeys.push(thumbnailObjectKey);
      attachments.push({
        id,
        kind: input.kind,
        mimeType: input.mimeType,
        fileName: input.fileName,
        byteLength: blob.size,
        localObjectKey,
        thumbnailObjectKey,
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

export function createMemoryCaptureStore(
  seed: {
    draft?: string;
    captures?: LocalCapture[];
    threads?: LocalThread[];
    trash?: LocalTrashRecord[];
    mediaStore?: MediaStore;
  } = {},
): CaptureStore {
  let draft = seed.draft ?? "";
  let captures = [...(seed.captures ?? [])];
  let threads = [...(seed.threads ?? [])];
  let trash = [...(seed.trash ?? [])];
  const mediaStore = seed.mediaStore ?? createMemoryMediaStore();

  return {
    async getDraft() {
      return draft;
    },
    async setDraft(text) {
      draft = text;
    },
    async list() {
      return newestFirst(visibleCaptures(captures, trash));
    },
    async listRecentThreads() {
      return recentThreads(threads, captures, trash);
    },
    async listThread(threadId) {
      if (isHiddenByTrash(trash, "thread", threadId)) {
        throw new Error("Thread not found");
      }
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) {
        throw new Error("Thread not found");
      }
      return {
        thread,
        captures: oldestBySequence(threadCaptures(captures, trash, threadId)),
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
        destination: options.destination ?? { type: "new_thread" },
        text: base.text || attachments[0]?.fileName || "Capture",
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
    async applyThreadSplit(split) {
      const next = applyThreadSplitTransition({ captures, threads }, split);
      captures = next.captures;
      threads = next.threads;
    },
    async applyThreadFiling(filing) {
      threads = fileThreadTransition(threads, filing);
    },

    async setThreadReviewed(threadId, reviewedAt) {
      threads = setThreadReviewedTransition(threads, threadId, reviewedAt);
    },
    async setThreadTodoDone(threadId, todoDoneAt) {
      threads = setThreadTodoDoneTransition(threads, threadId, todoDoneAt);
    },
    async markSyncing(ids) {
      captures = setCaptureSyncState(captures, ids, {
        status: "syncing",
        syncReason: null,
        syncRetryable: undefined,
      });
    },
    async restoreSavedLocally(ids) {
      captures = setCaptureSyncState(captures, ids, {
        status: "saved_locally",
        syncReason: null,
        syncRetryable: undefined,
      });
    },
    async applySyncBatch(batch: SyncBatchApplication) {
      const next = applySyncBatchTransition({ captures, threads }, batch);
      captures = next.captures;
      threads = next.threads;
    },
    async applyEnrichmentBatch(batch: EnrichmentBatchApplication) {
      const next = applyEnrichmentBatchTransition({ captures, threads }, batch);
      captures = next.captures;
      threads = next.threads;
    },
    async updateAttachment(captureId, attachmentId, patch) {
      captures = updateAttachmentTransition(
        captures,
        captureId,
        attachmentId,
        patch,
      );
    },
    async trashCapture(captureId, trashedAt = createTimestamp()) {
      const next = trashCaptureTransition(
        { captures, trash },
        captureId,
        trashedAt,
      );
      trash = next.trash;
      return next.record;
    },
    async trashThread(threadId, trashedAt = createTimestamp()) {
      const next = trashThreadTransition(
        { captures, threads, trash },
        threadId,
        trashedAt,
      );
      trash = next.trash;
      return next.record;
    },
    async restoreFromTrash(kind, targetId, now = createTimestamp()) {
      const next = restoreFromTrashTransition(
        trash,
        kind,
        targetId,
        now,
        createTimestamp(),
      );
      trash = next.trash;
      return next.record;
    },
    async listTrash() {
      return trashNewestFirst(trash);
    },
    async listPendingTrashMutations() {
      return pendingTrashMutations(trash);
    },
    async markTrashSyncing(idempotencyKeys) {
      trash = setTrashSyncStatus(trash, idempotencyKeys, "syncing");
    },
    async restoreTrashSavedLocally(idempotencyKeys) {
      trash = setTrashSyncStatus(trash, idempotencyKeys, "saved_locally");
    },
    async applyTrashSyncBatch(batch: TrashSyncApplication) {
      trash = applyTrashSyncBatchTransition(trash, batch);
    },
    async applyRemoteTrash(records) {
      trash = applyRemoteTrashTransition(trash, records);
    },
    async applyRemoteThreads(remoteThreads: ServerThread[]) {
      const merged = mergeRemoteThreads({
        localCaptures: captures,
        localThreads: threads,
        remoteThreads,
      });
      captures = merged.captures;
      threads = merged.threads;
      return { importedCaptureIds: merged.importedCaptureIds };
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
      if (!db.objectStoreNames.contains("trash")) {
        db.createObjectStore("trash", { keyPath: "id" });
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

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

type StoredLocalTrash = LocalTrashRecord & { id: string };

function toStoredTrash(record: LocalTrashRecord): StoredLocalTrash {
  return { ...record, id: trashMapKey(record.kind, record.targetId) };
}

async function readAllTrash(db: IDBDatabase): Promise<LocalTrashRecord[]> {
  const rows = (await requestToPromise(
    db.transaction("trash", "readonly").objectStore("trash").getAll(),
  )) as StoredLocalTrash[];
  return rows.map((row) => {
    const { id, ...record } = row;
    void id;
    return record;
  });
}

async function writeAllTrash(
  db: IDBDatabase,
  records: LocalTrashRecord[],
): Promise<void> {
  const transaction = db.transaction("trash", "readwrite");
  const store = transaction.objectStore("trash");
  store.clear();
  for (const record of records) {
    store.put(toStoredTrash(record));
  }
  await transactionDone(transaction);
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
    attachments: (value.attachments ?? []).map((attachment) => ({
      ...attachment,
      localObjectKey:
        attachment.localObjectKey === undefined
          ? null
          : attachment.localObjectKey,
      thumbnailObjectKey: attachment.thumbnailObjectKey ?? null,
      remoteObjectKey: attachment.remoteObjectKey ?? null,
    })),
  };
}

async function readAllCaptures(db: IDBDatabase): Promise<LocalCapture[]> {
  const rows = (await requestToPromise(
    db.transaction("captures", "readonly").objectStore("captures").getAll(),
  )) as LocalCapture[];
  return rows.map(normalizeCapture);
}

async function readAllThreads(db: IDBDatabase): Promise<LocalThread[]> {
  return (await requestToPromise(
    db.transaction("threads", "readonly").objectStore("threads").getAll(),
  )) as LocalThread[];
}

async function writeAllThreads(
  db: IDBDatabase,
  threads: LocalThread[],
): Promise<void> {
  const transaction = db.transaction("threads", "readwrite");
  const store = transaction.objectStore("threads");
  for (const thread of threads) {
    store.put(thread);
  }
  await transactionDone(transaction);
}

async function writeCapturesAndThreads(
  db: IDBDatabase,
  next: { captures: LocalCapture[]; threads: LocalThread[] },
  options: { deleteThreadId?: string | null } = {},
): Promise<void> {
  const transaction = db.transaction(["captures", "threads"], "readwrite");
  const captureStore = transaction.objectStore("captures");
  const threadStore = transaction.objectStore("threads");
  for (const capture of next.captures) {
    captureStore.put(capture);
  }
  for (const thread of next.threads) {
    threadStore.put(thread);
  }
  if (options.deleteThreadId) {
    threadStore.delete(options.deleteThreadId);
  }
  await transactionDone(transaction);
}

async function readCapturesAndThreads(
  db: IDBDatabase,
): Promise<{ captures: LocalCapture[]; threads: LocalThread[] }> {
  return {
    captures: await readAllCaptures(db),
    threads: await readAllThreads(db),
  };
}

export function createIdbCaptureStore(): CaptureStore {
  return {
    async getDraft() {
      return withDb(async (db) => {
        const value = await requestToPromise(
          db.transaction("drafts", "readonly").objectStore("drafts").get(DRAFT_KEY),
        );
        return typeof value === "string" ? value : "";
      });
    },

    async setDraft(text) {
      await withDb(async (db) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(text, DRAFT_KEY);
        await transactionDone(transaction);
      });
    },

    async list() {
      return withDb(async (db) => {
        const captures = await readAllCaptures(db);
        const trash = await readAllTrash(db);
        return newestFirst(visibleCaptures(captures, trash));
      });
    },

    async listRecentThreads() {
      return withDb(async (db) => {
        const threads = await readAllThreads(db);
        const trash = await readAllTrash(db);
        const captures = await readAllCaptures(db);
        return recentThreads(threads, captures, trash);
      });
    },

    async listThread(threadId) {
      return withDb(async (db) => {
        const trash = await readAllTrash(db);
        if (isHiddenByTrash(trash, "thread", threadId)) {
          throw new Error("Thread not found");
        }
        const thread = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").get(threadId),
        )) as LocalThread | undefined;
        if (!thread) {
          throw new Error("Thread not found");
        }
        const captures = await readAllCaptures(db);
        return {
          thread,
          captures: oldestBySequence(threadCaptures(captures, trash, threadId)),
        };
      });
    },

    async commit(text, location: CaptureLocation | null, options: CommitOptions = {}) {
      const inputs = options.attachments ?? [];
      const base = buildCaptureBase(text, location, inputs.length);
      const mediaStore = createIdbMediaStore();
      const attachments = await persistAttachments(mediaStore, base.id, inputs);
      return withDb(async (db) => {
        try {
          const existingThreads = await readAllThreads(db);

          const resolved = resolveCommitDestination({
            destination: options.destination ?? { type: "new_thread" },
            text: base.text || attachments[0]?.fileName || "Capture",
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
            attachments.flatMap((attachment) => {
              const keys = [
                attachment.localObjectKey,
                attachment.thumbnailObjectKey,
              ].filter((key): key is string => Boolean(key));
              return keys.map((key) => mediaStore.delete(key));
            }),
          );
          throw error;
        }
      });
    },

    async applyThreadSplit(split) {
      await withDb(async (db) => {
        const state = await readCapturesAndThreads(db);
        const next = applyThreadSplitTransition(state, split);
        await writeCapturesAndThreads(db, next, {
          deleteThreadId: split.trashedThreadId,
        });
      });
    },

    async applyThreadFiling(filing) {
      await withDb(async (db) => {
        const threads = await readAllThreads(db);
        await writeAllThreads(db, fileThreadTransition(threads, filing));
      });
    },

    async setThreadReviewed(threadId, reviewedAt) {
      await withDb(async (db) => {
        const threads = await readAllThreads(db);
        await writeAllThreads(
          db,
          setThreadReviewedTransition(threads, threadId, reviewedAt),
        );
      });
    },

    async setThreadTodoDone(threadId, todoDoneAt) {
      await withDb(async (db) => {
        const threads = await readAllThreads(db);
        await writeAllThreads(
          db,
          setThreadTodoDoneTransition(threads, threadId, todoDoneAt),
        );
      });
    },

    async markSyncing(ids) {
      await withDb(async (db) => {
        const captures = await readAllCaptures(db);
        const next = setCaptureSyncState(captures, ids, {
          status: "syncing",
          syncReason: null,
          syncRetryable: undefined,
        });
        await writeCaptures(db, next);
      });
    },

    async restoreSavedLocally(ids) {
      await withDb(async (db) => {
        const captures = await readAllCaptures(db);
        const next = setCaptureSyncState(captures, ids, {
          status: "saved_locally",
          syncReason: null,
          syncRetryable: undefined,
        });
        await writeCaptures(db, next);
      });
    },

    async applySyncBatch(batch: SyncBatchApplication) {
      await withDb(async (db) => {
        const state = await readCapturesAndThreads(db);
        await writeCapturesAndThreads(
          db,
          applySyncBatchTransition(state, batch),
        );
      });
    },

    async applyEnrichmentBatch(batch: EnrichmentBatchApplication) {
      await withDb(async (db) => {
        const state = await readCapturesAndThreads(db);
        await writeCapturesAndThreads(
          db,
          applyEnrichmentBatchTransition(state, batch),
        );
      });
    },

    async updateAttachment(captureId, attachmentId, patch) {
      await withDb(async (db) => {
        const captures = await readAllCaptures(db);
        await writeCaptures(
          db,
          updateAttachmentTransition(captures, captureId, attachmentId, patch),
        );
      });
    },

    async trashCapture(captureId, trashedAt = createTimestamp()) {
      return withDb(async (db) => {
        const captures = await readAllCaptures(db);
        const trash = await readAllTrash(db);
        const next = trashCaptureTransition(
          { captures, trash },
          captureId,
          trashedAt,
        );
        await writeAllTrash(db, next.trash);
        return next.record;
      });
    },

    async trashThread(threadId, trashedAt = createTimestamp()) {
      return withDb(async (db) => {
        const captures = await readAllCaptures(db);
        const threads = await readAllThreads(db);
        const trash = await readAllTrash(db);
        const next = trashThreadTransition(
          { captures, threads, trash },
          threadId,
          trashedAt,
        );
        await writeAllTrash(db, next.trash);
        return next.record;
      });
    },

    async restoreFromTrash(kind, targetId, now = createTimestamp()) {
      return withDb(async (db) => {
        const trash = await readAllTrash(db);
        const next = restoreFromTrashTransition(
          trash,
          kind,
          targetId,
          now,
          createTimestamp(),
        );
        if (next.trash !== trash) {
          await writeAllTrash(db, next.trash);
        }
        return next.record;
      });
    },

    async listTrash() {
      return withDb(async (db) => trashNewestFirst(await readAllTrash(db)));
    },

    async listPendingTrashMutations() {
      return withDb(async (db) => pendingTrashMutations(await readAllTrash(db)));
    },

    async markTrashSyncing(idempotencyKeys) {
      await withDb(async (db) => {
        const trash = await readAllTrash(db);
        await writeAllTrash(
          db,
          setTrashSyncStatus(trash, idempotencyKeys, "syncing"),
        );
      });
    },

    async restoreTrashSavedLocally(idempotencyKeys) {
      await withDb(async (db) => {
        const trash = await readAllTrash(db);
        await writeAllTrash(
          db,
          setTrashSyncStatus(trash, idempotencyKeys, "saved_locally"),
        );
      });
    },

    async applyTrashSyncBatch(batch: TrashSyncApplication) {
      await withDb(async (db) => {
        const trash = await readAllTrash(db);
        await writeAllTrash(db, applyTrashSyncBatchTransition(trash, batch));
      });
    },

    async applyRemoteTrash(records) {
      await withDb(async (db) => {
        const trash = await readAllTrash(db);
        await writeAllTrash(db, applyRemoteTrashTransition(trash, records));
      });
    },

    async applyRemoteThreads(remoteThreads: ServerThread[]) {
      return withDb(async (db) => {
        const state = await readCapturesAndThreads(db);
        const merged = mergeRemoteThreads({
          localCaptures: state.captures,
          localThreads: state.threads,
          remoteThreads,
        });
        await writeCapturesAndThreads(db, {
          captures: merged.captures,
          threads: merged.threads,
        });
        return { importedCaptureIds: merged.importedCaptureIds };
      });
    },
  };
}

async function writeCaptures(
  db: IDBDatabase,
  captures: LocalCapture[],
): Promise<void> {
  const transaction = db.transaction("captures", "readwrite");
  const store = transaction.objectStore("captures");
  for (const capture of captures) {
    store.put(capture);
  }
  await transactionDone(transaction);
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
