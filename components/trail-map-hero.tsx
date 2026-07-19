"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  resolveJournalRegion,
  resolveRegionBaseUrl,
} from "@/lib/map-journal/region";
import { createRegionStore } from "@/lib/offline-region/store";
import type { RegionManifest } from "@/lib/offline-region/types";

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
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

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
      try {
        await store.install(manifest);
        if (active) setState({ phase: "ready", manifest });
      } catch {
        if (active) setError("The Offline Region download could not be verified");
      } finally {
        if (active) setDownloading(false);
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

  async function download() {
    if (state.phase !== "region-missing" || !state.manifest) return;
    setDownloading(true);
    setError(null);
    try {
      const store = createRegionStore(baseUrl, region);
      await store.install(state.manifest);
      setState({ phase: "ready", manifest: state.manifest });
    } catch {
      setError("The Offline Region download could not be verified");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="trail-map-hero" aria-label="Offline Region map">
      {state.phase === "loading" ? (
        <p className="trail-map-hero-status" role="status">
          Checking Offline Region…
        </p>
      ) : null}

      {state.phase === "region-missing" ? (
        <div className="trail-map-hero-missing" role="status">
          <p className="eyebrow">Offline Region</p>
          <h2>Map your walks</h2>
          {state.manifest ? (
            <>
              <p>
                {state.manifest.name} — {state.manifest.radiusKm} km ·{" "}
                {(state.manifest.totalBytes / 1_000_000).toFixed(1)} MB
              </p>
              <button type="button" onClick={() => void download()} disabled={downloading}>
                {downloading ? "Downloading…" : "Download Offline Region"}
              </button>
            </>
          ) : (
            <p>
              No Offline Region pack is published. Open{" "}
              <Link href="/journal?region=fixture">Map Journal (fixture)</Link>.
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
                v{state.manifest.version} · {state.manifest.radiusKm} km · ready
              </p>
            </div>
            <Link className="trail-map-hero-cta" href="/journal">
              Open Map Journal
            </Link>
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
