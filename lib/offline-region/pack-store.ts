import type {
  DownloadProgress,
  OfflineRegionManifest,
  PackStore,
} from "./types";

type MemorySlot = {
  manifest: OfflineRegionManifest | null;
  assets: Map<string, Uint8Array>;
};

type MemoryState = {
  active: MemorySlot;
  staging: MemorySlot;
  progress: DownloadProgress | null;
  failNextPutWith?: unknown;
};

function emptySlot(): MemorySlot {
  return { manifest: null, assets: new Map() };
}

const states = new Map<string, MemoryState>();

function stateFor(namespace: string): MemoryState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created: MemoryState = {
    active: emptySlot(),
    staging: emptySlot(),
    progress: null,
  };
  states.set(namespace, created);
  return created;
}

export function resetMemoryPackStore(namespace = "default"): void {
  states.set(namespace, {
    active: emptySlot(),
    staging: emptySlot(),
    progress: null,
  });
}

export function createMemoryPackStore(
  namespace = "default",
  options: { failNextPutWith?: { current?: unknown } } = {},
): PackStore {
  const state = () => stateFor(namespace);

  return {
    async readManifest(slot) {
      return state()[slot].manifest;
    },
    async writeManifest(slot, manifest) {
      state()[slot].manifest = structuredClone(manifest);
    },
    async readProgress() {
      return state().progress ? structuredClone(state().progress) : null;
    },
    async writeProgress(progress) {
      state().progress = progress ? structuredClone(progress) : null;
    },
    async putAsset(slot, assetId, bytes) {
      const db = state();
      if (options.failNextPutWith?.current !== undefined) {
        const error = options.failNextPutWith.current;
        options.failNextPutWith.current = undefined;
        throw error;
      }
      if (db.failNextPutWith) {
        const error = db.failNextPutWith;
        db.failNextPutWith = undefined;
        throw error;
      }
      db[slot].assets.set(assetId, bytes.slice());
    },
    async getAsset(slot, assetId) {
      const value = state()[slot].assets.get(assetId);
      return value ? value.slice() : null;
    },
    async listAssetIds(slot) {
      return [...state()[slot].assets.keys()];
    },
    async clearSlot(slot) {
      state()[slot] = emptySlot();
    },
    async activateStaging() {
      const db = state();
      db.active = {
        manifest: db.staging.manifest
          ? structuredClone(db.staging.manifest)
          : null,
        assets: new Map(
          [...db.staging.assets.entries()].map(([id, bytes]) => [
            id,
            bytes.slice(),
          ]),
        ),
      };
      db.staging = emptySlot();
      db.progress = null;
    },
  };
}

const DB_NAME = "walking-thoughts-offline-region";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline Region IDB open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline Region IDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline Region IDB aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Offline Region IDB failed"));
  });
}

function assetKey(slot: "active" | "staging", assetId: string): string {
  return `${slot}:${assetId}`;
}

export function createIdbPackStore(): PackStore {
  return {
    async readManifest(slot) {
      const db = await openDatabase();
      try {
        const value = await requestToPromise(
          db.transaction("meta", "readonly").objectStore("meta").get(`manifest:${slot}`),
        );
        return (value as OfflineRegionManifest | undefined) ?? null;
      } finally {
        db.close();
      }
    },
    async writeManifest(slot, manifest) {
      const db = await openDatabase();
      try {
        const transaction = db.transaction("meta", "readwrite");
        transaction.objectStore("meta").put(manifest, `manifest:${slot}`);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
    async readProgress() {
      const db = await openDatabase();
      try {
        const value = await requestToPromise(
          db.transaction("meta", "readonly").objectStore("meta").get("progress"),
        );
        return (value as DownloadProgress | undefined) ?? null;
      } finally {
        db.close();
      }
    },
    async writeProgress(progress) {
      const db = await openDatabase();
      try {
        const transaction = db.transaction("meta", "readwrite");
        if (progress) {
          transaction.objectStore("meta").put(progress, "progress");
        } else {
          transaction.objectStore("meta").delete("progress");
        }
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
    async putAsset(slot, assetId, bytes) {
      const db = await openDatabase();
      try {
        const transaction = db.transaction("assets", "readwrite");
        transaction
          .objectStore("assets")
          .put(bytes.slice().buffer, assetKey(slot, assetId));
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    },
    async getAsset(slot, assetId) {
      const db = await openDatabase();
      try {
        const value = await requestToPromise(
          db
            .transaction("assets", "readonly")
            .objectStore("assets")
            .get(assetKey(slot, assetId)),
        );
        if (value instanceof ArrayBuffer) {
          return new Uint8Array(value);
        }
        return null;
      } finally {
        db.close();
      }
    },
    async listAssetIds(slot) {
      const db = await openDatabase();
      try {
        const keys = (await requestToPromise(
          db.transaction("assets", "readonly").objectStore("assets").getAllKeys(),
        )) as string[];
        const prefix = `${slot}:`;
        return keys
          .filter((key) => typeof key === "string" && key.startsWith(prefix))
          .map((key) => key.slice(prefix.length));
      } finally {
        db.close();
      }
    },
    async clearSlot(slot) {
      const db = await openDatabase();
      try {
        const metaTx = db.transaction("meta", "readwrite");
        metaTx.objectStore("meta").delete(`manifest:${slot}`);
        await transactionDone(metaTx);

        const keys = (await requestToPromise(
          db.transaction("assets", "readonly").objectStore("assets").getAllKeys(),
        )) as string[];
        const prefix = `${slot}:`;
        const assetTx = db.transaction("assets", "readwrite");
        for (const key of keys) {
          if (typeof key === "string" && key.startsWith(prefix)) {
            assetTx.objectStore("assets").delete(key);
          }
        }
        await transactionDone(assetTx);
      } finally {
        db.close();
      }
    },
    async activateStaging() {
      const stagingManifest = await this.readManifest("staging");
      if (!stagingManifest) {
        throw new Error("staging_empty");
      }
      const assetIds = await this.listAssetIds("staging");
      // Copy into active first so a crash cannot wipe the verified pack.
      for (const assetId of assetIds) {
        const bytes = await this.getAsset("staging", assetId);
        if (bytes) {
          await this.putAsset("active", assetId, bytes);
        }
      }
      await this.writeManifest("active", stagingManifest);
      const keep = new Set(stagingManifest.assets.map((asset) => asset.id));
      const activeIds = await this.listAssetIds("active");
      const db = await openDatabase();
      try {
        const transaction = db.transaction("assets", "readwrite");
        for (const assetId of activeIds) {
          if (!keep.has(assetId)) {
            transaction.objectStore("assets").delete(assetKey("active", assetId));
          }
        }
        await transactionDone(transaction);
      } finally {
        db.close();
      }
      await this.clearSlot("staging");
      await this.writeProgress(null);
    },
  };
}
