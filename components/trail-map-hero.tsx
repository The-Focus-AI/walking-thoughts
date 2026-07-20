"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  formatRegionMegabytes,
  regionDownloadPercent,
  regionDownloadProgressLabel,
} from "@/lib/offline-region/download-copy";
import {
  resolveJournalRegion,
  resolveRegionBaseUrl,
} from "@/lib/map-journal/region";
import { createRegionStore } from "@/lib/offline-region/store";
import type {
  RegionDownloadProgress,
  RegionManifest,
} from "@/lib/offline-region/types";

type HeroState =
  | { phase: "loading" }
  | { phase: "region-missing"; manifest: RegionManifest | null }
  | { phase: "ready"; manifest: RegionManifest };

/**
 * Map-as-home-hero (prototype Map A): Offline Region is the first plane.
 * Place review stays on Map Journal — this is glance + entry.
 */
export function TrailMapHero() {
  const region = resolveJournalRegion(null);
  const baseUrl = resolveRegionBaseUrl(region);
  const [state, setState] = useState<HeroState>({ phase: "loading" });
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<RegionDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

  async function installManifest(manifest: RegionManifest) {
    setDownloading(true);
    setError(null);
    setProgress({
      downloadedBytes: 0,
      totalBytes: manifest.totalBytes,
      currentPath: "",
    });
    try {
      const store = createRegionStore(baseUrl, region);
      await store.install(manifest, (next) => setProgress(next));
      setState({ phase: "ready", manifest });
    } catch {
      setError(
        "The Offline Region download could not be verified. Stay online and try again.",
      );
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const store = createRegionStore(baseUrl, region);
      const installed = await store.installed();
      if (!active) return;
      if (installed) {
        setState({ phase: "ready", manifest: installed });
        return;
      }
      const manifest = await store.manifest();
      if (!active) return;
      if (!manifest) {
        setState({ phase: "region-missing", manifest: null });
        return;
      }
      setState({ phase: "region-missing", manifest });
      setDownloading(true);
      setProgress({
        downloadedBytes: 0,
        totalBytes: manifest.totalBytes,
        currentPath: "",
      });
      try {
        await store.install(manifest, (next) => {
          if (active) setProgress(next);
        });
        if (active) setState({ phase: "ready", manifest });
      } catch {
        if (active) {
          setError(
            "The Offline Region download could not be verified. Stay online and try again.",
          );
        }
      } finally {
        if (active) {
          setDownloading(false);
          setProgress(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [baseUrl, region]);

  useEffect(() => {
    if (state.phase !== "ready" || mapRef.current || !containerRef.current) {
      return;
    }
    const manifest = state.manifest;
    const container = containerRef.current;
    let disposed = false;
    void (async () => {
      const { renderInstalledRegion } = await import("@/lib/offline-region/map");
      const store = createRegionStore(baseUrl, region);
      const { map } = await renderInstalledRegion(container, store, manifest);
      if (disposed) {
        map.remove();
        return;
      }
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [state, baseUrl, region]);

  const percent =
    state.phase === "region-missing" && state.manifest
      ? regionDownloadPercent(progress)
      : 0;

  return (
    <section className="trail-map-hero" aria-label="Offline Region map">
      {state.phase === "loading" ? (
        <p className="trail-map-hero-status" role="status">
          Looking for trail maps…
        </p>
      ) : null}

      {state.phase === "region-missing" ? (
        <div className="trail-map-hero-missing" role="status">
          <p className="eyebrow">Offline Region</p>
          <h2>Download trail maps</h2>
          {state.manifest ? (
            <>
              <p>
                Save <strong>{state.manifest.name}</strong> on this phone —{" "}
                {state.manifest.radiusKm} km of trails, contours, and place
                names ({formatRegionMegabytes(state.manifest.totalBytes)}).
                Works without signal once the download finishes.
              </p>
              {downloading ? (
                <div
                  className="trail-map-hero-progress"
                  data-testid="offline-region-download-progress"
                >
                  <p>
                    {regionDownloadProgressLabel(
                      progress,
                      state.manifest.totalBytes,
                    )}
                  </p>
                  <div
                    className="trail-map-hero-progress-track"
                    aria-hidden="true"
                  >
                    <div
                      className="trail-map-hero-progress-fill"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="offline-maps-actions">
                  <button
                    type="button"
                    onClick={() => void installManifest(state.manifest!)}
                  >
                    Download Offline Region
                  </button>
                  <Link className="offline-maps-secondary" href="/offline-maps">
                    Maps details
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p>
              Trail maps are not published for this install yet. Open{" "}
              <Link href="/offline-maps">Maps</Link> for status, or the{" "}
              <Link href="/journal?region=fixture">fixture Map Journal</Link>.
            </p>
          )}
        </div>
      ) : null}

      {state.phase === "ready" ? (
        <>
          <div
            ref={containerRef}
            className="trail-map-hero-map"
            data-testid="trail-map-hero"
          />
          <div className="trail-map-hero-overlay">
            <div>
              <p className="eyebrow">Offline Region</p>
              <p className="trail-map-hero-name">{state.manifest.name}</p>
              <p className="trail-map-hero-meta">
                Maps ready offline · v{state.manifest.version} ·{" "}
                {state.manifest.radiusKm} km
              </p>
            </div>
            <div className="offline-maps-actions">
              <Link className="trail-map-hero-cta" href="/journal">
                Open Map Journal
              </Link>
              <Link className="offline-maps-secondary" href="/offline-maps">
                Maps
              </Link>
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
