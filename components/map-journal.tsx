"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { SyncRuntime } from "@/components/sync-runtime";
import { CaptureEntryView } from "@/components/thread-entries";
import { ThreadChat } from "@/components/thread-chat";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { getCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
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
import type { RegionManifest } from "@/lib/offline-region/types";
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
  | { phase: "ready"; manifest: RegionManifest };

type ThreadContext = {
  capture: LocalCapture;
  thread: LocalThread | null;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
};

export type MapJournalHook = {
  state: JournalState["phase"];
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
  const hookRef = useRef({
    state: "loading" as JournalState["phase"],
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
        if (active) {
          setError("The Offline Region download could not be verified");
        }
      } finally {
        if (active) setDownloading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [baseUrl, region]);

  // The map mounts once the region is installed.
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
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [state, baseUrl, region, openCapture]);

  // Live GPS only while the map surface is active; honest about absence.
  useEffect(() => {
    if (state.phase !== "ready") return;
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
        void (async () => {
          const map = mapRef.current;
          if (!map) return;
          const maplibre = await import("maplibre-gl");
          if (!gpsMarkerRef.current) {
            const dot = document.createElement("div");
            dot.className = "journal-gps-dot";
            gpsMarkerRef.current = new maplibre.default.Marker({ element: dot });
            gpsMarkerRef.current.setLngLat([next.longitude, next.latitude]);
            gpsMarkerRef.current.addTo(map);
          } else {
            gpsMarkerRef.current.setLngLat([next.longitude, next.latitude]);
          }
        })();
      },
      () => setGps({ status: "unavailable" }),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setGps({ status: "off" });
    };
  }, [state.phase]);

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
          <span data-testid="journal-gps">{gpsLabel}</span>
          <span data-testid="journal-connectivity">
            {online
              ? "Online — follow-ups enrich automatically"
              : "Offline — Captures save on this device; Enrichment resumes online"}
          </span>
        </div>
      </header>

      {state.phase === "loading" && <p role="status">Checking this device…</p>}

      {state.phase === "region-missing" && (
        <section className="journal-empty" role="status">
          <h1>The Map Journal needs your Offline Region.</h1>
          {state.manifest ? (
            <>
              <p>
                {state.manifest.name} — {state.manifest.radiusKm} km radius,{" "}
                {(state.manifest.totalBytes / 1_000_000).toFixed(1)} MB download.
              </p>
              <button
                type="button"
                onClick={() => void downloadRegion()}
                disabled={downloading}
              >
                {downloading ? "Downloading…" : "Download Offline Region"}
              </button>
            </>
          ) : (
            <p>
              No Offline Region pack is published for “{region}”. Open{" "}
              <a href="/journal?region=fixture">/journal?region=fixture</a> for
              the shipped fixture map, or publish home with{" "}
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
                    ✕
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
    </div>
  );
}
