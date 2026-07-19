"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createRegionStore,
  RegionIntegrityError,
  type RegionStore,
} from "@/lib/offline-region/store";
import { cacheShellResources } from "@/lib/offline-shell";
import type {
  RegionDownloadProgress,
  RegionManifest,
  RegionStorage,
} from "@/lib/offline-region/types";

type TracerState =
  | { phase: "loading" }
  | { phase: "unpublished" }
  | { phase: "available"; manifest: RegionManifest }
  | {
      phase: "downloading";
      manifest: RegionManifest;
      progress: RegionDownloadProgress;
    }
  | { phase: "failed"; manifest: RegionManifest; reason: string }
  | { phase: "installed"; manifest: RegionManifest };

export type TracerMetrics = {
  packBytes: number | null;
  downloadedBytes: number | null;
  installedBytes: number | null;
  firstRenderMs: number | null;
  storage: RegionStorage | null;
};

export type TracerHook = {
  state: string;
  metrics: TracerMetrics;
  styleLayerIds: () => string[];
  attribution: () => string;
  canvasPainted: () => boolean;
};

declare global {
  interface Window {
    __WT_REGION_TRACER__?: TracerHook;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

async function cacheTracerShell(): Promise<void> {
  try {
    await cacheShellResources(["/region-tracer"]);
  } catch {
    // Offline shell caching is best-effort; the map itself lives in OPFS.
  }
}

export function RegionTracer() {
  // Region selection stays client-side so the one cached tracer page keeps
  // working for any region in airplane mode.
  const searchParams = useSearchParams();
  const region = searchParams.get("region") === "fixture" ? "fixture" : "home";
  const baseUrl = `/offline-region/${region}`;

  const [state, setState] = useState<TracerState>({ phase: "loading" });
  const [metrics, setMetrics] = useState<TracerMetrics>({
    packBytes: null,
    downloadedBytes: null,
    installedBytes: null,
    firstRenderMs: null,
    storage: null,
  });
  const storeRef = useRef<RegionStore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const stateRef = useRef(state);
  const metricsRef = useRef(metrics);

  useEffect(() => {
    stateRef.current = state;
    metricsRef.current = metrics;
  }, [state, metrics]);

  useEffect(() => {
    window.__WT_REGION_TRACER__ = {
      get state() {
        return stateRef.current.phase;
      },
      get metrics() {
        return metricsRef.current;
      },
      styleLayerIds: () =>
        mapRef.current ? mapRef.current.getStyle().layers.map((l) => l.id) : [],
      attribution: () =>
        document.querySelector(".maplibregl-ctrl-attrib")?.textContent ?? "",
      canvasPainted: () => {
        const canvas = mapRef.current?.getCanvas();
        if (!canvas) return false;
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) return false;
        const pixels = new Uint8Array(64 * 64 * 4);
        gl.readPixels(
          Math.floor(canvas.width / 2) - 32,
          Math.floor(canvas.height / 2) - 32,
          64,
          64,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        const first = [pixels[0], pixels[1], pixels[2]].join(",");
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] === 0) continue;
          const color = [
            pixels[index],
            pixels[index + 1],
            pixels[index + 2],
          ].join(",");
          if (color !== first && color !== "0,0,0") return true;
        }
        return false;
      },
    };
  }, []);

  const renderMap = useCallback(
    async (manifest: RegionManifest) => {
      const store = storeRef.current;
      const container = containerRef.current;
      if (!store || !container || mapRef.current) return;

      const { renderInstalledRegion } = await import("@/lib/offline-region/map");
      const { map, firstRenderMs } = await renderInstalledRegion(
        container,
        store,
        manifest,
      );
      mapRef.current = map;

      const [renderMs, storage] = await Promise.all([
        firstRenderMs,
        store.storage(),
      ]);
      const installedBytes = manifest.totalBytes;
      setMetrics((current) => ({
        ...current,
        installedBytes,
        firstRenderMs: Math.round(renderMs),
        storage,
      }));
    },
    [],
  );

  useEffect(() => {
    const store = createRegionStore(baseUrl, region);
    storeRef.current = store;
    let active = true;

    void cacheTracerShell();

    void (async () => {
      const installed = await store.installed();
      if (installed) {
        if (!active) return;
        setState({ phase: "installed", manifest: installed });
        setMetrics((current) => ({
          ...current,
          packBytes: installed.totalBytes,
        }));
        return;
      }

      const manifest = await store.manifest();
      if (!active) return;
      if (!manifest) {
        setState({ phase: "unpublished" });
        return;
      }
      setMetrics((current) => ({ ...current, packBytes: manifest.totalBytes }));
      setState({ phase: "available", manifest });
    })();

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [baseUrl, region]);

  useEffect(() => {
    if (state.phase === "installed") void renderMap(state.manifest);
  }, [state, renderMap]);

  const download = useCallback(async () => {
    const store = storeRef.current;
    if (!store || state.phase !== "available") return;
    const manifest = state.manifest;

    setState({
      phase: "downloading",
      manifest,
      progress: { downloadedBytes: 0, totalBytes: manifest.totalBytes, currentPath: "" },
    });
    try {
      await store.install(manifest, (progress) => {
        setState({ phase: "downloading", manifest, progress });
        setMetrics((current) => ({
          ...current,
          downloadedBytes: progress.downloadedBytes,
        }));
      });
      setState({ phase: "installed", manifest });
    } catch (error) {
      const reason =
        error instanceof RegionIntegrityError
          ? error.message
          : "Download failed. The previous state of this device is unchanged.";
      setState({ phase: "failed", manifest, reason });
    }
  }, [state]);

  return (
    <section className="region-tracer">
      <header className="region-tracer-header">
        <h1>Offline Region tracer</h1>
        <p className="region-tracer-sub">
          Trail-first topographic map, packaged for airplane mode.
        </p>
      </header>

      {state.phase === "loading" && <p role="status">Checking this device…</p>}

      {state.phase === "unpublished" && (
        <p role="status">
          The Offline Region artifact for “{region}” has not been published to
          this deployment. Build it with <code>mise run region:build</code>.
        </p>
      )}

      {state.phase === "available" && (
        <div className="region-tracer-offer" role="status">
          <p>
            <strong>{state.manifest.name}</strong> —{" "}
            {state.manifest.radiusKm} km radius Offline Region.
          </p>
          <p>
            Download size:{" "}
            <strong data-testid="pack-size">
              {formatBytes(state.manifest.totalBytes)}
            </strong>
          </p>
          <button type="button" onClick={() => void download()}>
            Download Offline Region
          </button>
        </div>
      )}

      {state.phase === "downloading" && (
        <p role="status">
          Downloading… {formatBytes(state.progress.downloadedBytes)} of{" "}
          {formatBytes(state.progress.totalBytes)}
        </p>
      )}

      {state.phase === "failed" && (
        <div role="alert" className="region-tracer-error">
          <p>Offline Region could not be verified.</p>
          <p>{state.reason}</p>
          <button
            type="button"
            onClick={() => setState({ phase: "available", manifest: state.manifest })}
          >
            Try again
          </button>
        </div>
      )}

      {state.phase === "installed" && (
        <>
          <p role="status" data-testid="region-ready">
            {state.manifest.name} is stored on this device and renders without
            connectivity.
          </p>
          <div
            ref={containerRef}
            className="region-tracer-map"
            data-testid="region-map"
          />
          <dl className="region-tracer-metrics">
            <div>
              <dt>Pack size</dt>
              <dd>{formatBytes(state.manifest.totalBytes)}</dd>
            </div>
            <div>
              <dt>First render</dt>
              <dd data-testid="render-ms">
                {metrics.firstRenderMs === null
                  ? "measuring…"
                  : `${metrics.firstRenderMs} ms`}
              </dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd data-testid="storage-persisted">
                {metrics.storage === null
                  ? "checking…"
                  : metrics.storage.persisted
                    ? "persistent"
                    : "best-effort"}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
