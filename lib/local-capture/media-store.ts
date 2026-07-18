export type MediaStore = {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
};

export function createMemoryMediaStore(
  options: { failNextPutWith?: unknown } = {},
): MediaStore {
  const blobs = new Map<string, Blob>();
  let failure = options.failNextPutWith;

  return {
    async put(key, blob) {
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      blobs.set(key, blob);
    },
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(key) {
      blobs.delete(key);
    },
  };
}

const DB_NAME = "walking-thoughts-media";
const DB_VERSION = 1;

function openMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Media IndexedDB open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Media IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Media transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Media transaction failed"));
  });
}

export function createIdbMediaStore(): MediaStore {
  return {
    async put(key, blob) {
      const db = await openMediaDatabase();
      try {
        const transaction = db.transaction("blobs", "readwrite");
        transaction.objectStore("blobs").put(blob, key);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
    async get(key) {
      const db = await openMediaDatabase();
      try {
        const value = await requestToPromise(
          db.transaction("blobs", "readonly").objectStore("blobs").get(key),
        );
        return value instanceof Blob ? value : null;
      } finally {
        db.close();
      }
    },
    async delete(key) {
      const db = await openMediaDatabase();
      try {
        const transaction = db.transaction("blobs", "readwrite");
        transaction.objectStore("blobs").delete(key);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
  };
}
