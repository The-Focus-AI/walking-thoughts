import { matchesChecksum } from "./checksum";
import { createMemoryPackCatalog } from "./catalog";
import {
  createIdbPackStore,
  createMemoryPackStore,
} from "./pack-store";
import {
  defaultHomeSelection,
  estimatePack as estimatePackSize,
} from "./sizing";
import type {
  DownloadProgress,
  LatLng,
  OfflineMapView,
  OfflineRegionManager,
  OfflineRegionManifest,
  OfflineRegionStatus,
  PackCatalog,
  PackStore,
  VerifiedPack,
} from "./types";

type ManagerOptions = {
  store?: PackStore;
  persist?: () => Promise<"persisted" | "not_persisted" | "unsupported">;
  now?: () => string;
};

function isQuotaError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "QuotaExceededError") ||
    (error instanceof Error && /quota/i.test(error.message))
  );
}

async function readActivePack(store: PackStore): Promise<VerifiedPack | null> {
  const manifest = await store.readManifest("active");
  if (!manifest) return null;
  const assetIds = await store.listAssetIds("active");
  let installedBytes = 0;
  for (const asset of manifest.assets) {
    if (!assetIds.includes(asset.id)) return null;
    const bytes = await store.getAsset("active", asset.id);
    if (!bytes) return null;
    if (!(await matchesChecksum(bytes, asset.checksum))) return null;
    installedBytes += bytes.byteLength;
  }
  return {
    manifest,
    verifiedAt: manifest.createdAt,
    installedBytes,
  };
}

async function verifyStaging(
  store: PackStore,
  manifest: OfflineRegionManifest,
): Promise<boolean> {
  for (const asset of manifest.assets) {
    const bytes = await store.getAsset("staging", asset.id);
    if (!bytes) return false;
    if (bytes.byteLength !== asset.byteLength) return false;
    if (!(await matchesChecksum(bytes, asset.checksum))) return false;
  }
  return true;
}

function progressFrom(
  manifest: OfflineRegionManifest,
  completedAssetIds: string[],
): DownloadProgress {
  const completed = new Set(completedAssetIds);
  const receivedBytes = manifest.assets
    .filter((asset) => completed.has(asset.id))
    .reduce((sum, asset) => sum + asset.byteLength, 0);
  const totalBytes = manifest.assets.reduce(
    (sum, asset) => sum + asset.byteLength,
    0,
  );
  return {
    regionId: manifest.regionId,
    version: manifest.version,
    completedAssetIds: [...completed],
    totalAssets: manifest.assets.length,
    receivedBytes,
    totalBytes,
  };
}

export function createOfflineRegionManager(
  options: ManagerOptions = {},
): OfflineRegionManager {
  const store = options.store ?? createMemoryPackStore();
  const persist = options.persist ?? (async () => "unsupported" as const);
  const now = options.now ?? (() => new Date().toISOString());

  async function downloadRemaining(
    catalog: PackCatalog,
    manifest: OfflineRegionManifest,
    completedAssetIds: string[],
  ): Promise<OfflineRegionStatus> {
    const completed = new Set(completedAssetIds);
    await store.writeManifest("staging", manifest);

    for (const asset of manifest.assets) {
      if (completed.has(asset.id)) continue;
      try {
        const bytes = await catalog.fetchAsset(
          manifest.regionId,
          manifest.version,
          asset.id,
        );
        if (!(await matchesChecksum(bytes, asset.checksum))) {
          const active = await readActivePack(store);
          await store.clearSlot("staging");
          await store.writeProgress(null);
          return {
            state: "error",
            code: "integrity",
            message: `Integrity check failed for ${asset.id}`,
            actionable:
              "Retry the Offline Region download. Your current verified pack is unchanged.",
            preservedActive: active,
          };
        }
        await store.putAsset("staging", asset.id, bytes);
        completed.add(asset.id);
        const progress = progressFrom(manifest, [...completed]);
        await store.writeProgress(progress);
      } catch (error) {
        const active = await readActivePack(store);
        const progress = progressFrom(manifest, [...completed]);
        await store.writeProgress(progress);
        if (isQuotaError(error)) {
          return {
            state: "error",
            code: "quota",
            message: "Device storage quota exceeded while downloading",
            actionable:
              "Free device storage, then resume the Offline Region download. The previous verified pack is still available.",
            preservedActive: active,
          };
        }
        if (
          error instanceof Error &&
          error.message === "network_interrupted"
        ) {
          return {
            state: "downloading",
            progress,
            preservedActive: active,
          };
        }
        return {
          state: "error",
          code: "network",
          message: error instanceof Error ? error.message : "Download failed",
          actionable:
            "Reconnect and resume the Offline Region download. The previous verified pack is still available.",
          preservedActive: active,
        };
      }
    }

    const ok = await verifyStaging(store, manifest);
    if (!ok) {
      const active = await readActivePack(store);
      await store.clearSlot("staging");
      await store.writeProgress(null);
      return {
        state: "error",
        code: "integrity",
        message: "Staging pack failed final integrity verification",
        actionable:
          "Retry the Offline Region update. Your current verified pack was not replaced.",
        preservedActive: active,
      };
    }

    await store.activateStaging();
    const active = await readActivePack(store);
    if (!active) {
      return {
        state: "error",
        code: "storage",
        message: "Activation failed after verification",
        actionable: "Retry the Offline Region download.",
        preservedActive: null,
      };
    }
    return { state: "active", pack: { ...active, verifiedAt: now() } };
  }

  return {
    defaultSelection(home: LatLng) {
      return defaultHomeSelection(home);
    },
    estimatePack(selection) {
      return estimatePackSize(selection);
    },
    async getStatus() {
      const active = await readActivePack(store);
      const progress = await store.readProgress();
      const staging = await store.readManifest("staging");

      if (progress && staging) {
        return {
          state: "downloading",
          progress,
          preservedActive: active,
        };
      }
      if (active) {
        return { state: "active", pack: active, download: progress };
      }
      return { state: "empty" };
    },
    async startDownload(selection, catalog = createMemoryPackCatalog()) {
      await persist();
      const manifest = await catalog.plan(selection);
      await store.clearSlot("staging");
      await store.writeProgress(progressFrom(manifest, []));
      return downloadRemaining(catalog, manifest, []);
    },
    async resumeDownload(catalog = createMemoryPackCatalog()) {
      await persist();
      const staging = await store.readManifest("staging");
      const progress = await store.readProgress();
      if (!staging || !progress) {
        const active = await readActivePack(store);
        return active
          ? { state: "active", pack: active }
          : { state: "empty" };
      }
      return downloadRemaining(
        catalog,
        staging,
        progress.completedAssetIds,
      );
    },
    async renderOffline(): Promise<OfflineMapView> {
      const active = await readActivePack(store);
      if (!active) {
        throw new Error("no_offline_region");
      }
      return {
        source: "offline_region",
        regionId: active.manifest.regionId,
        version: active.manifest.version,
        center: active.manifest.center,
        radiusKm: active.manifest.radiusKm,
        layers: active.manifest.style.layers,
        trailPriority: true,
        assetPaths: active.manifest.assets.map((asset) => asset.path),
      };
    },
  };
}

type ManagerGlobals = typeof globalThis & {
  __WT_OFFLINE_REGION_MANAGER__?: OfflineRegionManager;
};

export function getOfflineRegionManager(): OfflineRegionManager {
  const hooked = (globalThis as ManagerGlobals).__WT_OFFLINE_REGION_MANAGER__;
  if (hooked) return hooked;

  const manager = createOfflineRegionManager({
    store:
      typeof indexedDB === "undefined"
        ? createMemoryPackStore("default")
        : createIdbPackStore(),
    persist: async () => {
      const { requestPersistentStorage } = await import(
        "@/lib/local-capture/persistence"
      );
      return requestPersistentStorage();
    },
  });
  (globalThis as ManagerGlobals).__WT_OFFLINE_REGION_MANAGER__ = manager;
  return manager;
}
