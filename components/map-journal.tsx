"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { SyncRuntime } from "@/components/sync-runtime";
import { CaptureEntryView } from "@/components/thread-entries";
import { ThreadChat } from "@/components/thread-chat";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { getCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
import {
  formatRegionMegabytes,
  regionDownloadPercent,
  regionDownloadProgressLabel,
} from "@/lib/offline-region/download-copy";
import {
  addCaptureMarkerLayers,
  CLUSTER_LAYER,
  MARKER_LAYER,
  updateCaptureMarkers,
} from "@/lib/map-journal/map-layers";
import { captureMarkers } from "@/lib/map-journal/markers";
import {
  resolveJournalRegion,
  resolveRegionBaseUrl,
} from "@/lib/map-journal/region";
import { createRegionStore } from "@/lib/offline-region/store";
import type {
  RegionDownloadProgress,
  RegionManifest,
} from "@/lib/offline-region/types";
import { cacheShellResources } from "@/lib/offline-shell";

type GpsState =
  | { status: "off" }
  | { status: "unavailable" }
  | {
      status: "tracking";
      latitude: number;
      longitude: number;
      accuracy: number | null;
    };

type JournalState =
  | { phase: "loading" }
  | { phase: "region-missing"; manifest: RegionManifest | null }
  | { phase: "ready"; manifest: RegionManifest; source: "local" | "remote" };

type ThreadContext = {
  capture: LocalCapture;
  thread: LocalThread | null;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
};

export type MapJournalHook = {
  state: JournalState["phase"];
  /** Which pack renders: installed ("local"), streamed ("remote"), or null. */
  source: "local" | "remote" | null;
  markerCount: number;
  gps: GpsState;
  selectedCaptureId: string | null;
  refreshMarkers: () => Promise<void>;
};

declare global {
  interface Window {
    __WT_MAP_JOURNAL__?: MapJournalHook;
  }
}

export function MapJournal() {
  const searchParams = useSearchParams();
  const region = resolveJournalRegion(searchParams.get("region"));
  const baseUrl = resolveRegionBaseUrl(region);

  const [state, setState] = useState<JournalState>({ phase: "loading" });
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<RegionDownloadProgress | null>(null);
  const [gps, setGps] = useState<GpsState>({ status: "off" });
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [context, setContext] = useState<ThreadContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markerCount, setMarkerCount] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const gpsMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const centeredOnGpsRef = useRef(false);
  const lastFixRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );

  // Draws (or moves) the location pin and brings it on screen once per map
  // mount. Called from both the GPS watcher and map mount because either can
  // finish first — a fix that lands before the map exists must not be lost.
  const placeGpsPin = useCallback(
    async (
      map: import("maplibre-gl").Map,
      fix: { latitude: number; longitude: number },
    ) => {
      const maplibre = await import("maplibre-gl");
      if (!gpsMarkerRef.current) {
        const dot = document.createElement("div");
        dot.className = "journal-gps-dot";
        gpsMarkerRef.current = new maplibre.default.Marker({ element: dot });
        gpsMarkerRef.current.setLngLat([fix.longitude, fix.latitude]);
        gpsMarkerRef.current.addTo(map);
      } else {
        gpsMarkerRef.current.setLngLat([fix.longitude, fix.latitude]);
      }
      if (!centeredOnGpsRef.current) {
        const bounds = map.getMaxBounds();
        if (!bounds || bounds.contains([fix.longitude, fix.latitude])) {
          centeredOnGpsRef.current = true;
          map.easeTo({
            center: [fix.longitude, fix.latitude],
            zoom: Math.max(map.getZoom(), 15),
            duration: 800,
          });
        }
      }
    },
    [],
  );
  const hookRef = useRef({
    state: "loading" as JournalState["phase"],
    source: null as "local" | "remote" | null,
    gps,
    markerCount,
    selected: null as string | null,
  });

  const refreshMarkers = useCallback(async () => {
    const captures = await getCaptureStore().list();
    const markers = captureMarkers(captures);
    setMarkerCount(markers.features.length);
    if (mapRef.current) updateCaptureMarkers(mapRef.current, markers);
  }, []);

  const openCapture = useCallback(async (captureId: string) => {
    const store = getCaptureStore();
    const captures = await store.list();
    const capture = captures.find((item) => item.id === captureId);
    if (!capture) return;

    if (!capture.threadId) {
      setContext({ capture, thread: null, captures: [capture], enrichments: [] });
      return;
    }
    const view = await store.listThread(capture.threadId);
    const enrichments = await loadThreadEnrichments(capture.threadId);
    setContext({ capture, ...view, enrichments });
  }, []);

  // Expose the journal to the Playwright seam.
  useEffect(() => {
    hookRef.current = {
      state: state.phase,
      source: state.phase === "ready" ? state.source : null,
      gps,
      markerCount,
      selected: context?.capture.id ?? null,
    };
  }, [state, gps, markerCount, context]);

  useEffect(() => {
    window.__WT_MAP_JOURNAL__ = {
      get state() {
        return hookRef.current.state;
      },
      get source() {
        return hookRef.current.source;
      },
      get markerCount() {
        return hookRef.current.markerCount;
      },
      get gps() {
        return hookRef.current.gps;
      },
      get selectedCaptureId() {
        return hookRef.current.selected;
      },
      refreshMarkers,
    };
  }, [refreshMarkers]);

  // Region availability drives the whole surface. When a pack is published but
  // not yet on this device, install it automatically so /journal works on first
  // visit without a local `mise run region:build`.
  useEffect(() => {
    let active = true;
    void cacheShellResources(["/journal"]).catch(() => undefined);

    void (async () => {
      const store = createRegionStore(baseUrl, region);
      const installed = await store.installed();
      if (!active) return;
      if (installed) {
        setState({ phase: "ready", manifest: installed, source: "local" });
        return;
      }

      const manifest = await store.manifest();
      if (!active) return;
      if (!manifest) {
        setState({ phase: "region-missing", manifest: null });
        return;
      }

      // First paint from the published pack while the install runs — a fresh
      // origin or device opens on the map, not a download gate.
      if (typeof navigator === "undefined" || navigator.onLine) {
        setState({ phase: "ready", manifest, source: "remote" });
      } else {
        setState({ phase: "region-missing", manifest });
      }
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
        if (active) {
          setState((current) =>
            current.phase === "ready"
              ? { ...current, source: "local" }
              : { phase: "ready", manifest, source: "local" },
          );
        }
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

  const readyManifest = state.phase === "ready" ? state.manifest : null;
  const readySource = state.phase === "ready" ? state.source : null;

  // The map mounts as soon as a pack can render — installed, or streamed
  // from the published pack while the install finishes in the background.
  useEffect(() => {
    if (!readyManifest || !readySource || mapRef.current || !containerRef.current) {
      return;
    }
    const manifest = readyManifest;
    const container = containerRef.current;
    let disposed = false;

    void (async () => {
      const { renderInstalledRegion, renderRemoteRegion, withinRegionBounds } =
        await import("@/lib/offline-region/map");
      const fix = lastFixRef.current;
      const options = { center: fix };
      if (fix && withinRegionBounds(manifest, fix)) {
        centeredOnGpsRef.current = true;
      }
      const { map } =
        readySource === "local"
          ? await renderInstalledRegion(
              container,
              createRegionStore(baseUrl, region),
              manifest,
              options,
            )
          : await renderRemoteRegion(container, baseUrl, manifest, options);
      if (disposed) {
        map.remove();
        return;
      }
      mapRef.current = map;
      if (lastFixRef.current) void placeGpsPin(map, lastFixRef.current);

      const captures = await getCaptureStore().list();
      const markers = captureMarkers(captures);
      setMarkerCount(markers.features.length);

      const attach = () => {
        addCaptureMarkerLayers(map, markers);
        map.on("click", MARKER_LAYER, (event) => {
          const feature = event.features?.[0];
          const captureId = feature?.properties?.captureId as string | undefined;
          if (captureId) void openCapture(captureId);
        });
        map.on("click", CLUSTER_LAYER, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          map.easeTo({
            center: (feature.geometry as { coordinates: [number, number] })
              .coordinates,
            zoom: Math.min(map.getZoom() + 2, 17),
          });
        });
        for (const layer of [MARKER_LAYER, CLUSTER_LAYER]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      };

      if (map.isStyleLoaded()) attach();
      else map.once("load", attach);
    })().catch(() => {
      setError("The Offline Region could not be rendered");
    });

    return () => {
      disposed = true;
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      centeredOnGpsRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readySource flips remote→local without a remount
  }, [readyManifest, baseUrl, region, openCapture, placeGpsPin]);

  // Live GPS from the moment the surface opens — including while a pack
  // downloads — so the permission prompt and first fix land before the map
  // mounts and the sheet can open on the walker's position.
  useEffect(() => {
    if (state.phase === "loading") return;
    if (!("geolocation" in navigator)) {
      const timer = window.setTimeout(
        () => setGps({ status: "unavailable" }),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          status: "tracking" as const,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        };
        setGps(next);
        lastFixRef.current = next;
        const map = mapRef.current;
        if (map) void placeGpsPin(map, next);
      },
      () => setGps({ status: "unavailable" }),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setGps({ status: "off" });
    };
  }, [state.phase, placeGpsPin]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const downloadRegion = useCallback(async () => {
    if (state.phase !== "region-missing" || !state.manifest) return;
    const manifest = state.manifest;
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
      setState({ phase: "ready", manifest, source: "local" });
    } catch {
      setError(
        "The Offline Region download could not be verified. Stay online and try again.",
      );
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }, [state, baseUrl, region]);

  const gpsLabel =
    gps.status === "tracking"
      ? gps.accuracy === null
        ? "GPS locked"
        : gps.accuracy > 75
          ? `GPS approximate (±${Math.round(gps.accuracy)} m)`
          : `GPS ±${Math.round(gps.accuracy)} m`
      : gps.status === "unavailable"
        ? "GPS unavailable"
        : "GPS starting…";

  return (
    <div className="journal" data-selected={context ? "true" : "false"}>
      <SyncRuntime />
      <header className="journal-topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Map Journal</span>
        </Link>
        <div className="journal-status" role="status">
          <Link className="topbar-link" href="/offline-maps">
            Offline maps
          </Link>
          <span data-testid="journal-gps">{gpsLabel}</span>
          <span data-testid="journal-connectivity">
            {online
              ? "Network online — follow-ups enrich automatically"
              : "Network offline — Captures stay on this phone; Enrichment resumes online"}
          </span>
        </div>
      </header>

      {state.phase === "loading" && (
        <p role="status">Looking for trail maps on this device…</p>
      )}

      {state.phase === "region-missing" && (
        <section className="journal-empty" role="status">
          <h1>Download trail maps to open the Map Journal</h1>
          {state.manifest ? (
            <>
              <p>
                Save <strong>{state.manifest.name}</strong> —{" "}
                {state.manifest.radiusKm} km of trails and contours (
                {formatRegionMegabytes(state.manifest.totalBytes)}). The map
                stays on this phone after the download finishes.
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
                      style={{
                        width: `${regionDownloadPercent(progress)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => void downloadRegion()}>
                  Download Offline Region
                </button>
              )}
            </>
          ) : (
            <p>
              Trail maps are not published for “{region}” yet. Open{" "}
              <Link href="/journal?region=fixture">the fixture Map Journal</Link>{" "}
              for the sample Offline Region, or publish home with{" "}
              <code>mise run region:build</code> and{" "}
              <code>mise run region:publish</code>.
            </p>
          )}
        </section>
      )}

      {state.phase === "ready" && (
        <div className="journal-surface">
          <div
            ref={containerRef}
            className="journal-map"
            data-testid="journal-map"
          />

          {gps.status === "tracking" && (
            <button
              type="button"
              className="journal-locate"
              aria-label="Center the map on my location"
              data-testid="journal-locate"
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                map.easeTo({
                  center: [gps.longitude, gps.latitude],
                  zoom: Math.max(map.getZoom(), 15),
                  duration: 600,
                });
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path
                  d="M12 1v4M12 19v4M1 12h4M19 12h4"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          )}

          <aside
            className="journal-panel"
            aria-label="Thread context"
            hidden={!context}
          >
            {context?.thread ? (
              <ThreadChat
                threadId={context.thread.id}
                embedded
                onClose={() => {
                  setContext(null);
                  void refreshMarkers();
                }}
              />
            ) : context ? (
              <>
                <div className="journal-panel-head">
                  <div>
                    <h2>Inbox Capture</h2>
                    <p className="journal-place">
                      {new Date(context.capture.createdAt).toLocaleString()}
                      {context.capture.location
                        ? ` · ${context.capture.location.latitude.toFixed(4)}, ${context.capture.location.longitude.toFixed(4)}`
                        : " · location unavailable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="journal-close"
                    aria-label="Close Thread context"
                    onClick={() => setContext(null)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
                <section
                  className="journal-preview"
                  aria-label="Capture preview"
                >
                  <CaptureEntryView capture={context.capture} mediaPreviews />
                </section>
                <p className="journal-note" role="note">
                  This Capture is in the Inbox. It becomes its own Thread when
                  online processing begins; open the chat from there to continue.
                </p>
              </>
            ) : null}
          </aside>
        </div>
      )}

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      <DataHandlingDisclosure />
      <AppNav />
    </div>
  );
}
