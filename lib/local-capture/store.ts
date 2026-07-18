import type { CaptureLocation, CaptureStore, LocalCapture } from "./types";

const DB_NAME = "walking-thoughts";
const DB_VERSION = 1;
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

function buildCapture(
  text: string,
  location: CaptureLocation | null,
): LocalCapture {
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

function newestFirst(captures: LocalCapture[]): LocalCapture[] {
  return [...captures].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

export function createMemoryCaptureStore(
  seed: { draft?: string; captures?: LocalCapture[] } = {},
): CaptureStore {
  let draft = seed.draft ?? "";
  let captures = [...(seed.captures ?? [])];

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
    async commit(text, location) {
      const capture = buildCapture(text, location);
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
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
        return newestFirst(captures as LocalCapture[]);
      } finally {
        db.close();
      }
    },

    async commit(text, location: CaptureLocation | null) {
      const capture = buildCapture(text, location);
      const db = await openDatabase();
      try {
        const transaction = db.transaction(["captures", "drafts"], "readwrite");
        transaction.objectStore("captures").put(capture);
        transaction.objectStore("drafts").put("", DRAFT_KEY);
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

