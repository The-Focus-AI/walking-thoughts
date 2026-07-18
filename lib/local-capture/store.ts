import { resolveCommitDestination } from "./thread-destination";
import type {
  CaptureLocation,
  CaptureStore,
  CommitOptions,
  LocalCapture,
  LocalThread,
} from "./types";

const DB_NAME = "walking-thoughts";
const DB_VERSION = 2;
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

function buildCaptureBase(
  text: string,
  location: CaptureLocation | null,
): Omit<LocalCapture, "threadId" | "sequence"> {
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("Capture text is required");
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
  } = {},
): CaptureStore {
  let draft = seed.draft ?? "";
  let captures = [...(seed.captures ?? [])];
  let threads = [...(seed.threads ?? [])];

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
      const base = buildCaptureBase(text, location);
      const resolved = resolveCommitDestination({
        destination: options.destination ?? { type: "inbox" },
        text: base.text,
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
      };
      captures = [capture, ...captures];
      draft = "";
      return capture;
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
          cursor.update({
            ...value,
            threadId: value.threadId ?? null,
            sequence: value.sequence ?? 1,
          });
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
  };
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
      const base = buildCaptureBase(text, location);
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
          text: base.text,
          captures: existingCaptures,
          threads: existingThreads,
          createId,
          now: createTimestamp,
        });

        const capture: LocalCapture = {
          ...base,
          threadId: resolved.threadId,
          sequence: resolved.sequence,
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
