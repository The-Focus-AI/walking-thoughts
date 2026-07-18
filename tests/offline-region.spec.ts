import { expect, test } from "@playwright/test";
import {
  createMemoryPackCatalog,
  planVersionedCatalog,
} from "@/lib/offline-region/catalog";
import { createOfflineRegionManager } from "@/lib/offline-region/manager";
import {
  createMemoryPackStore,
  resetMemoryPackStore,
} from "@/lib/offline-region/pack-store";
import {
  DEFAULT_RADIUS_KM,
  DEFAULT_RADIUS_MILES,
  defaultHomeSelection,
  estimatePack,
} from "@/lib/offline-region/sizing";

const NS = "offline-region-tests";
const HOME = { latitude: 45.5152, longitude: -122.6784 };

test.beforeEach(() => {
  resetMemoryPackStore(NS);
});

test("selection defaults to ~25 mi / 40 km and shows pack size before download", async () => {
  const selection = defaultHomeSelection(HOME);
  expect(selection.radiusKm).toBe(DEFAULT_RADIUS_KM);
  expect(DEFAULT_RADIUS_MILES).toBe(25);

  const estimate = estimatePack(selection);
  expect(estimate.radiusKm).toBe(40);
  expect(estimate.radiusMiles).toBeCloseTo(24.9, 0);
  expect(estimate.estimatedBytes).toBeGreaterThan(1_000_000);
  expect(estimate.assetCount).toBeGreaterThanOrEqual(4);

  const manager = createOfflineRegionManager({
    store: createMemoryPackStore(NS),
  });
  expect(manager.defaultSelection(HOME)).toEqual(selection);
  expect(manager.estimatePack(selection).estimatedBytes).toBe(
    estimate.estimatedBytes,
  );
});

test("download resumes after interruption and only explicit packs render offline", async () => {
  const store = createMemoryPackStore(NS);
  const manager = createOfflineRegionManager({ store });
  const catalog = createMemoryPackCatalog({
    failAssetId: "asset-2",
    failTimes: 1,
  });
  const selection = defaultHomeSelection(HOME);

  await expect(manager.renderOffline()).rejects.toThrow("no_offline_region");

  const interrupted = await manager.startDownload(selection, catalog);
  expect(interrupted.state).toBe("downloading");
  if (interrupted.state !== "downloading") return;
  expect(interrupted.progress.completedAssetIds.length).toBeGreaterThan(0);
  expect(interrupted.progress.completedAssetIds.length).toBeLessThan(
    interrupted.progress.totalAssets,
  );

  const resumed = await manager.resumeDownload(catalog);
  expect(resumed.state).toBe("active");
  if (resumed.state !== "active") return;

  const view = await manager.renderOffline();
  expect(view.source).toBe("offline_region");
  expect(view.trailPriority).toBe(true);
  expect(view.layers).toContain("trails");
  expect(view.assetPaths.some((path) => path.includes("tiles"))).toBe(true);
  // Not a viewed-tile cache: render comes only from the verified pack slot.
  expect(await store.readManifest("active")).not.toBeNull();
  expect(await store.listAssetIds("active")).toHaveLength(
    resumed.pack.manifest.assets.length,
  );
});

test("integrity failure and storage failure preserve the verified pack", async () => {
  const failPut = { current: undefined as unknown };
  const store = createMemoryPackStore(NS, { failNextPutWith: failPut });
  const manager = createOfflineRegionManager({ store });
  const selection = defaultHomeSelection(HOME);

  const firstCatalog = createMemoryPackCatalog();
  const installed = await manager.startDownload(selection, firstCatalog);
  expect(installed.state).toBe("active");
  if (installed.state !== "active") return;
  const activeVersion = installed.pack.manifest.version;

  const { catalog: corruptCatalog } = await planVersionedCatalog(
    selection,
    2,
    { corruptAssetId: "asset-1" },
  );
  const integrity = await manager.startDownload(selection, corruptCatalog);
  expect(integrity.state).toBe("error");
  if (integrity.state !== "error") return;
  expect(integrity.code).toBe("integrity");
  expect(integrity.preservedActive?.manifest.version).toBe(activeVersion);
  expect((await manager.getStatus()).state).toBe("active");
  expect((await manager.renderOffline()).version).toBe(activeVersion);

  const { catalog: quotaCatalog } = await planVersionedCatalog(selection, 3);
  failPut.current = new DOMException("quota", "QuotaExceededError");
  const quota = await manager.startDownload(selection, quotaCatalog);
  expect(quota.state).toBe("error");
  if (quota.state !== "error") return;
  expect(quota.code).toBe("quota");
  expect(quota.actionable).toMatch(/Free device storage/i);
  expect(quota.preservedActive?.manifest.version).toBe(activeVersion);
  expect((await manager.renderOffline()).version).toBe(activeVersion);
});

test("version replacement activates only after the full pack verifies; restart keeps it", async () => {
  const store = createMemoryPackStore(NS);
  let persisted = false;
  const manager = createOfflineRegionManager({
    store,
    persist: async () => {
      persisted = true;
      return "persisted";
    },
  });
  const selection = defaultHomeSelection(HOME);

  const v1 = createMemoryPackCatalog();
  const first = await manager.startDownload(selection, v1);
  expect(first.state).toBe("active");
  expect(persisted).toBe(true);

  const { catalog: v2 } = await planVersionedCatalog(selection, 2);
  const updated = await manager.startDownload(selection, v2);
  expect(updated.state).toBe("active");
  if (updated.state !== "active") return;
  expect(updated.pack.manifest.version).toBe(2);

  // Simulate process restart with the same durable store namespace.
  const restarted = createOfflineRegionManager({
    store: createMemoryPackStore(NS),
  });
  const status = await restarted.getStatus();
  expect(status.state).toBe("active");
  if (status.state !== "active") return;
  expect(status.pack.manifest.version).toBe(2);
  const view = await restarted.renderOffline();
  expect(view.version).toBe(2);
  expect(view.source).toBe("offline_region");
});
