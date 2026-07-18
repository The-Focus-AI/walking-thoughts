import { expiresAtFrom } from "@/lib/sync/trash";
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
  LocalTrashKind,
  LocalTrashRecord,
  SyncBatchApplication,
  TrashSyncApplication,
} from "./types";

const DB_NAME = "walking-thoughts";
const DB_VERSION = 5;
const DRAFT_KEY = "composer";

function trashMapKey(kind: LocalTrashKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

function activeTrash(records: LocalTrashRecord[]): LocalTrashRecord[] {
  return records.filter((record) => record.pendingAction !== "restore");
}

function isHiddenByTrash(
  trash: LocalTrashRecord[],
  kind: LocalTrashKind,
  targetId: string,
): boolean {
  return activeTrash(trash).some(
    (record) => record.kind === kind && record.targetId === targetId,
  );
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
    trash?: LocalTrashRecord[];
    mediaStore?: MediaStore;
  } = {},
): CaptureStore {
  let draft = seed.draft ?? "";
  let captures = [...(seed.captures ?? [])];
  let threads = [...(seed.threads ?? [])];
  let trash = [...(seed.trash ?? [])];
  const mediaStore = seed.mediaStore ?? createMemoryMediaStore();

  function visibleCaptures(): LocalCapture[] {
    return captures.filter(
      (capture) =>
        !isHiddenByTrash(trash, "capture", capture.id) &&
        !(
          capture.threadId &&
          isHiddenByTrash(trash, "thread", capture.threadId)
        ),
    );
  }

  function visibleThreads(): LocalThread[] {
    const visible = visibleCaptures();
    return threads.filter(
      (thread) =>
        !isHiddenByTrash(trash, "thread", thread.id) &&
        visible.some((capture) => capture.threadId === thread.id),
    );
  }

  return {
    async getDraft() {
      return draft;
    },
    async setDraft(text) {
      draft = text;
    },
    async list() {
      return newestFirst(visibleCaptures());
    },
    async listInbox() {
      return newestFirst(
        visibleCaptures().filter((capture) => capture.threadId === null),
      );
    },
    async listRecentThreads() {
      return [...visibleThreads()].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      );
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
        captures: oldestBySequence(
          visibleCaptures().filter((capture) => capture.threadId === threadId),
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
    async trashCapture(captureId, trashedAt = createTimestamp()) {
      const capture = captures.find((item) => item.id === captureId);
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
      trash = [
        record,
        ...trash.filter(
          (item) => !(item.kind === "capture" && item.targetId === captureId),
        ),
      ];
      return record;
    },
    async trashThread(threadId, trashedAt = createTimestamp()) {
      if (!threads.some((thread) => thread.id === threadId)) {
        throw new Error("Thread not found");
      }
      const record: LocalTrashRecord = {
        kind: "thread",
        targetId: threadId,
        trashedAt,
        expiresAt: expiresAtFrom(trashedAt),
        attachmentIds: attachmentIdsForThread(captures, threadId),
        syncStatus: "saved_locally",
        pendingAction: "trash",
        idempotencyKey: `trash:thread:${threadId}:${trashedAt}`,
      };
      trash = [
        record,
        ...trash.filter(
          (item) => !(item.kind === "thread" && item.targetId === threadId),
        ),
      ];
      return record;
    },
    async restoreFromTrash(kind, targetId, now = createTimestamp()) {
      const existing = trash.find(
        (item) => item.kind === kind && item.targetId === targetId,
      );
      if (!existing) return null;
      if (existing.expiresAt <= now) {
        throw new Error("trash_expired");
      }
      if (existing.syncStatus === "saved_locally" && existing.pendingAction === "trash") {
        trash = trash.filter(
          (item) => !(item.kind === kind && item.targetId === targetId),
        );
        return null;
      }
      const record: LocalTrashRecord = {
        ...existing,
        syncStatus: "saved_locally",
        pendingAction: "restore",
        idempotencyKey: `restore:${kind}:${targetId}:${createTimestamp()}`,
      };
      trash = trash.map((item) =>
        item.kind === kind && item.targetId === targetId ? record : item,
      );
      return record;
    },
    async listTrash() {
      return activeTrash(trash).sort((a, b) =>
        a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0,
      );
    },
    async listPendingTrashMutations() {
      return trash.filter(
        (item) =>
          item.pendingAction !== null &&
          (item.syncStatus === "saved_locally" ||
            item.syncStatus === "needs_attention"),
      );
    },
    async markTrashSyncing(idempotencyKeys) {
      const keys = new Set(idempotencyKeys);
      trash = trash.map((item) =>
        keys.has(item.idempotencyKey)
          ? { ...item, syncStatus: "syncing" }
          : item,
      );
    },
    async restoreTrashSavedLocally(idempotencyKeys) {
      const keys = new Set(idempotencyKeys);
      trash = trash.map((item) =>
        keys.has(item.idempotencyKey)
          ? { ...item, syncStatus: "saved_locally" }
          : item,
      );
    },
    async applyTrashSyncBatch(batch: TrashSyncApplication) {
      for (const result of batch.results) {
        if (result.record === null) {
          trash = trash.filter(
            (item) => item.idempotencyKey !== result.idempotencyKey,
          );
          continue;
        }
        const next: LocalTrashRecord = {
          kind: result.record.kind,
          targetId: result.record.targetId,
          trashedAt: result.record.trashedAt,
          expiresAt: result.record.expiresAt,
          attachmentIds: result.record.attachmentIds,
          syncStatus: "complete",
          pendingAction: null,
          idempotencyKey: result.idempotencyKey,
        };
        trash = [
          next,
          ...trash.filter(
            (item) =>
              item.idempotencyKey !== result.idempotencyKey &&
              !(
                item.kind === next.kind && item.targetId === next.targetId
              ),
          ),
        ];
      }
      for (const failure of batch.failures) {
        trash = trash.map((item) =>
          item.idempotencyKey === failure.idempotencyKey
            ? { ...item, syncStatus: "needs_attention" }
            : item,
        );
      }
    },
    async applyRemoteTrash(records) {
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
      trash = [
        ...pendingLocal.filter(
          (item) => !remoteKeys.has(trashMapKey(item.kind, item.targetId)),
        ),
        ...remoteRecords,
      ];
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
        const captures = (
          (await requestToPromise(
            db.transaction("captures", "readonly").objectStore("captures").getAll(),
          )) as LocalCapture[]
        ).map(normalizeCapture);
        const trash = await readAllTrash(db);
        const visible = captures.filter(
          (capture) =>
            !isHiddenByTrash(trash, "capture", capture.id) &&
            !(
              capture.threadId &&
              isHiddenByTrash(trash, "thread", capture.threadId)
            ),
        );
        return newestFirst(visible);
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
        const threads = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").getAll(),
        )) as LocalThread[];
        const trash = await readAllTrash(db);
        const captures = (
          (await requestToPromise(
            db.transaction("captures", "readonly").objectStore("captures").getAll(),
          )) as LocalCapture[]
        ).map(normalizeCapture);
        const visibleCaptureThreadIds = new Set(
          captures
            .filter(
              (capture) =>
                !isHiddenByTrash(trash, "capture", capture.id) &&
                !(
                  capture.threadId &&
                  isHiddenByTrash(trash, "thread", capture.threadId)
                ),
            )
            .map((capture) => capture.threadId)
            .filter((threadId): threadId is string => threadId !== null),
        );
        return threads
          .filter(
            (thread) =>
              !isHiddenByTrash(trash, "thread", thread.id) &&
              visibleCaptureThreadIds.has(thread.id),
          )
          .sort((a, b) =>
            a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
          );
      } finally {
        db.close();
      }
    },

    async listThread(threadId) {
      const db = await openDatabase();
      try {
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
        const captures = await requestToPromise(
          db.transaction("captures", "readonly").objectStore("captures").getAll(),
        );
        return {
          thread,
          captures: oldestBySequence(
            (captures as LocalCapture[])
              .map(normalizeCapture)
              .filter(
                (capture) =>
                  capture.threadId === threadId &&
                  !isHiddenByTrash(trash, "capture", capture.id),
              ),
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

    async trashCapture(captureId, trashedAt = createTimestamp()) {
      const db = await openDatabase();
      try {
        const capture = (await requestToPromise(
          db.transaction("captures", "readonly").objectStore("captures").get(captureId),
        )) as LocalCapture | undefined;
        if (!capture) throw new Error("Capture not found");
        const trash = await readAllTrash(db);
        const record: LocalTrashRecord = {
          kind: "capture",
          targetId: captureId,
          trashedAt,
          expiresAt: expiresAtFrom(trashedAt),
          attachmentIds: attachmentIdsForCapture(normalizeCapture(capture)),
          syncStatus: "saved_locally",
          pendingAction: "trash",
          idempotencyKey: `trash:capture:${captureId}:${trashedAt}`,
        };
        await writeAllTrash(db, [
          record,
          ...trash.filter(
            (item) => !(item.kind === "capture" && item.targetId === captureId),
          ),
        ]);
        return record;
      } finally {
        db.close();
      }
    },

    async trashThread(threadId, trashedAt = createTimestamp()) {
      const db = await openDatabase();
      try {
        const thread = (await requestToPromise(
          db.transaction("threads", "readonly").objectStore("threads").get(threadId),
        )) as LocalThread | undefined;
        if (!thread) throw new Error("Thread not found");
        const captures = (
          (await requestToPromise(
            db.transaction("captures", "readonly").objectStore("captures").getAll(),
          )) as LocalCapture[]
        ).map(normalizeCapture);
        const trash = await readAllTrash(db);
        const record: LocalTrashRecord = {
          kind: "thread",
          targetId: threadId,
          trashedAt,
          expiresAt: expiresAtFrom(trashedAt),
          attachmentIds: attachmentIdsForThread(captures, threadId),
          syncStatus: "saved_locally",
          pendingAction: "trash",
          idempotencyKey: `trash:thread:${threadId}:${trashedAt}`,
        };
        await writeAllTrash(db, [
          record,
          ...trash.filter(
            (item) => !(item.kind === "thread" && item.targetId === threadId),
          ),
        ]);
        return record;
      } finally {
        db.close();
      }
    },

    async restoreFromTrash(kind, targetId, now = createTimestamp()) {
      const db = await openDatabase();
      try {
        const trash = await readAllTrash(db);
        const existing = trash.find(
          (item) => item.kind === kind && item.targetId === targetId,
        );
        if (!existing) return null;
        if (existing.expiresAt <= now) {
          throw new Error("trash_expired");
        }
        if (
          existing.syncStatus === "saved_locally" &&
          existing.pendingAction === "trash"
        ) {
          await writeAllTrash(
            db,
            trash.filter(
              (item) => !(item.kind === kind && item.targetId === targetId),
            ),
          );
          return null;
        }
        const record: LocalTrashRecord = {
          ...existing,
          syncStatus: "saved_locally",
          pendingAction: "restore",
          idempotencyKey: `restore:${kind}:${targetId}:${createTimestamp()}`,
        };
        await writeAllTrash(
          db,
          trash.map((item) =>
            item.kind === kind && item.targetId === targetId ? record : item,
          ),
        );
        return record;
      } finally {
        db.close();
      }
    },

    async listTrash() {
      const db = await openDatabase();
      try {
        return activeTrash(await readAllTrash(db)).sort((a, b) =>
          a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0,
        );
      } finally {
        db.close();
      }
    },

    async listPendingTrashMutations() {
      const db = await openDatabase();
      try {
        return (await readAllTrash(db)).filter(
          (item) =>
            item.pendingAction !== null &&
            (item.syncStatus === "saved_locally" ||
              item.syncStatus === "needs_attention"),
        );
      } finally {
        db.close();
      }
    },

    async markTrashSyncing(idempotencyKeys) {
      const db = await openDatabase();
      try {
        const keys = new Set(idempotencyKeys);
        const trash = await readAllTrash(db);
        await writeAllTrash(
          db,
          trash.map((item) =>
            keys.has(item.idempotencyKey)
              ? { ...item, syncStatus: "syncing" }
              : item,
          ),
        );
      } finally {
        db.close();
      }
    },

    async restoreTrashSavedLocally(idempotencyKeys) {
      const db = await openDatabase();
      try {
        const keys = new Set(idempotencyKeys);
        const trash = await readAllTrash(db);
        await writeAllTrash(
          db,
          trash.map((item) =>
            keys.has(item.idempotencyKey)
              ? { ...item, syncStatus: "saved_locally" }
              : item,
          ),
        );
      } finally {
        db.close();
      }
    },

    async applyTrashSyncBatch(batch: TrashSyncApplication) {
      const db = await openDatabase();
      try {
        let trash = await readAllTrash(db);
        for (const result of batch.results) {
          if (result.record === null) {
            trash = trash.filter(
              (item) => item.idempotencyKey !== result.idempotencyKey,
            );
            continue;
          }
          const next: LocalTrashRecord = {
            kind: result.record.kind,
            targetId: result.record.targetId,
            trashedAt: result.record.trashedAt,
            expiresAt: result.record.expiresAt,
            attachmentIds: result.record.attachmentIds,
            syncStatus: "complete",
            pendingAction: null,
            idempotencyKey: result.idempotencyKey,
          };
          trash = [
            next,
            ...trash.filter(
              (item) =>
                item.idempotencyKey !== result.idempotencyKey &&
                !(item.kind === next.kind && item.targetId === next.targetId),
            ),
          ];
        }
        for (const failure of batch.failures) {
          trash = trash.map((item) =>
            item.idempotencyKey === failure.idempotencyKey
              ? { ...item, syncStatus: "needs_attention" }
              : item,
          );
        }
        await writeAllTrash(db, trash);
      } finally {
        db.close();
      }
    },

    async applyRemoteTrash(records) {
      const db = await openDatabase();
      try {
        const trash = await readAllTrash(db);
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
        await writeAllTrash(db, [
          ...pendingLocal.filter(
            (item) => !remoteKeys.has(trashMapKey(item.kind, item.targetId)),
          ),
          ...remoteRecords,
        ]);
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
