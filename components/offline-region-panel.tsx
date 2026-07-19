"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createMemoryPackCatalog } from "@/lib/offline-region/catalog";
import { getOfflineRegionManager } from "@/lib/offline-region/manager";
import { requestPersistentStorage } from "@/lib/local-capture/persistence";
import type {
  OfflineMapView,
  OfflineRegionStatus,
  RegionSelection,
} from "@/lib/offline-region/types";
import { DEFAULT_RADIUS_KM } from "@/lib/offline-region/sizing";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusSummary(status: OfflineRegionStatus): string {
  switch (status.state) {
    case "empty":
      return "No Offline Region downloaded yet";
    case "active":
      return `Offline Region ready · v${status.pack.manifest.version}`;
    case "downloading":
      return `Downloading Offline Region · ${status.progress.completedAssetIds.length}/${status.progress.totalAssets}`;
    case "error":
      return status.message;
  }
}

export function OfflineRegionPanel() {
  const manager = useMemo(() => getOfflineRegionManager(), []);
  const [home] = useState({ latitude: 45.5152, longitude: -122.6784 });
  const [selection, setSelection] = useState<RegionSelection>(() =>
    manager.defaultSelection(home),
  );
  const [status, setStatus] = useState<OfflineRegionStatus>({ state: "empty" });
  const [view, setView] = useState<OfflineMapView | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const estimate = manager.estimatePack(selection);

  async function refresh() {
    const next = await manager.getStatus();
    setStatus(next);
    if (next.state === "error") {
      setErrorAction(next.actionable);
    } else {
      setErrorAction(null);
    }
    if (next.state === "active") {
      setView(await manager.renderOffline());
    } else if (next.state === "downloading" && next.preservedActive) {
      setView({
        source: "offline_region",
        regionId: next.preservedActive.manifest.regionId,
        version: next.preservedActive.manifest.version,
        center: next.preservedActive.manifest.center,
        radiusKm: next.preservedActive.manifest.radiusKm,
        layers: next.preservedActive.manifest.style.layers,
        trailPriority: true,
        assetPaths: next.preservedActive.manifest.assets.map(
          (asset) => asset.path,
        ),
      });
    } else if (next.state === "empty") {
      setView(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Hydrate from origin-private pack storage after mount / restart.
    void manager.getStatus().then(async (next) => {
      if (cancelled) return;
      startTransition(() => {
        setStatus(next);
        setErrorAction(next.state === "error" ? next.actionable : null);
      });
      if (next.state === "active") {
        const offlineView = await manager.renderOffline();
        if (!cancelled) {
          startTransition(() => setView(offlineView));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [manager]);

  function download() {
    startTransition(() => {
      void (async () => {
        await requestPersistentStorage();
        const catalog = createMemoryPackCatalog();
        const result = await manager.startDownload(selection, catalog);
        setStatus(result);
        if (result.state === "error") {
          setErrorAction(result.actionable);
        } else if (result.state === "downloading") {
          const resumed = await manager.resumeDownload(catalog);
          setStatus(resumed);
        }
        await refresh();
      })();
    });
  }

  function resume() {
    startTransition(() => {
      void (async () => {
        const catalog = createMemoryPackCatalog();
        const result = await manager.resumeDownload(catalog);
        setStatus(result);
        if (result.state === "error") {
          setErrorAction(result.actionable);
        }
        await refresh();
      })();
    });
  }

  return (
    <section className="offline-region-panel" aria-label="Offline Region">
      <header className="offline-region-header">
        <h2>Offline Region</h2>
        <p>
          Explicit trail-first pack for walking without connectivity. Previously
          viewed network tiles are never treated as an Offline Region.
        </p>
      </header>

      <div className="offline-region-selection">
        <label>
          Radius (km)
          <input
            type="number"
            min={5}
            max={80}
            value={selection.radiusKm}
            aria-label="Offline Region radius in kilometers"
            onChange={(event) =>
              setSelection({
                ...selection,
                radiusKm: Number(event.target.value) || DEFAULT_RADIUS_KM,
              })
            }
          />
        </label>
        <p className="offline-region-estimate">
          About {estimate.radiusMiles} miles · estimated pack{" "}
          {formatBytes(estimate.estimatedBytes)} · {estimate.assetCount} assets
        </p>
      </div>

      <div className="offline-region-actions">
        <button type="button" disabled={isPending} onClick={download}>
          Download Offline Region
        </button>
        {status.state === "downloading" || status.state === "error" ? (
          <button type="button" disabled={isPending} onClick={resume}>
            Resume download
          </button>
        ) : null}
      </div>

      <p className="offline-region-status" role="status">
        {statusSummary(status)}
      </p>
      {errorAction ? (
        <p className="offline-region-actionable">{errorAction}</p>
      ) : null}

      {view ? (
        <div
          className="offline-region-map"
          aria-label="Airplane-mode Offline Region map"
          data-source={view.source}
          data-version={view.version}
        >
          <p className="offline-region-map-title">
            Trail-first Offline Region · v{view.version}
          </p>
          <p>
            Center {view.center.latitude.toFixed(3)},{" "}
            {view.center.longitude.toFixed(3)} · {view.radiusKm} km
          </p>
          <ul aria-label="Offline Region layers">
            {view.layers.map((layer) => (
              <li key={layer}>{layer}</li>
            ))}
          </ul>
          <p className="offline-region-map-note">
            Rendering from verified local pack ({view.assetPaths.length} assets).
            Not a network tile cache.
          </p>
        </div>
      ) : (
        <p className="offline-region-map-empty">
          Download a region to render maps in airplane mode.
        </p>
      )}
    </section>
  );
}
