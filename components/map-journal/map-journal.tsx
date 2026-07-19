"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CaptureComposer } from "@/components/capture-composer";
import { OfflineRegionPanel } from "@/components/offline-region-panel";
import { ThreadReview } from "@/components/map-journal/thread-review";
import { getCaptureStore } from "@/lib/local-capture/store";
import { clusterMarkers } from "@/lib/map-journal/cluster";
import { createLiveGpsSession } from "@/lib/map-journal/gps";
import { listMappableCaptures } from "@/lib/map-journal/mappable";
import type { GpsFix, JournalMarker, MappableCapture } from "@/lib/map-journal/types";
import { renderInstalledRegion } from "@/lib/offline-region/map";
import { createRegionStore } from "@/lib/offline-region/store";

const FIXTURE_BASE = "/offline-region/fixture";

type LayoutMode = "panel" | "sheet";

function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>("sheet");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const update = () => setMode(media.matches ? "panel" : "sheet");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mode;
}

function markerLabel(marker: JournalMarker): string {
  if (marker.clusterCount && marker.clusterCount > 1) {
    return `${marker.clusterCount} Captures`;
  }
  if (marker.kind === "text") return "Capture";
  return `${marker.kind} Capture`;
}

export function MapJournal() {
  const layout = useLayoutMode();
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerLayerRef = useRef<maplibregl.Marker[]>([]);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [captures, setCaptures] = useState<MappableCapture[]>([]);
  const [zoom, setZoom] = useState(13);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regionReady, setRegionReady] = useState(false);
  const [regionMessage, setRegionMessage] = useState("Preparing Offline Region…");
  const [gps, setGps] = useState<GpsFix>({ status: "pending" });
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [showRegionManager, setShowRegionManager] = useState(false);
  const [showLibrary, setShowLibrary] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("wt.map-journal.library") === "1";
  });

  const markers = useMemo(
    () => clusterMarkers(captures, zoom),
    [captures, zoom],
  );
  const selected = captures.find((capture) => capture.id === selectedId) ?? null;

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

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listMappableCaptures(getCaptureStore()).then((next) => {
        if (active) setCaptures(next);
      });
    };
    refresh();
    // CaptureComposer commits into the same store; poll while the journal is
    // mounted so new located Captures appear on the map without a library.
    const timer = window.setInterval(refresh, 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    const session = createLiveGpsSession();
    session.start();
    const stop = session.subscribe(setGps);
    return () => {
      stop();
      session.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const host = mapHostRef.current;
    if (!host) return;

    void (async () => {
      try {
        const store = createRegionStore(FIXTURE_BASE, "fixture");
        let manifest = await store.installed();
        if (!manifest) {
          setRegionMessage("Downloading Offline Region topography…");
          const available = await store.manifest();
          if (!available) {
            setRegionMessage("Offline Region pack is unavailable");
            return;
          }
          await store.install(available);
          manifest = available;
        }
        if (cancelled || !mapHostRef.current) return;
        const { map } = await renderInstalledRegion(
          mapHostRef.current,
          store,
          manifest,
        );
        if (cancelled) {
          map.remove();
          return;
        }
        mapRef.current = map;
        setZoom(map.getZoom());
        map.on("zoom", () => setZoom(map.getZoom()));
        setRegionReady(true);
        setRegionMessage("Offline Region topography ready");
      } catch (error) {
        if (!cancelled) {
          setRegionMessage(
            error instanceof Error
              ? error.message
              : "Could not open Offline Region map",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const marker of markerLayerRef.current) marker.remove();
      markerLayerRef.current = [];
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionReady) return;

    for (const marker of markerLayerRef.current) marker.remove();
    markerLayerRef.current = [];

    for (const marker of markers) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `map-journal-marker kind-${marker.kind}${
        marker.clusterCount && marker.clusterCount > 1 ? " clustered" : ""
      }${selectedId === marker.captureId ? " active" : ""}`;
      element.textContent =
        marker.clusterCount && marker.clusterCount > 1
          ? String(marker.clusterCount)
          : marker.kind === "image"
            ? "◉"
            : marker.kind === "audio"
              ? "◌"
              : marker.kind === "video"
                ? "▣"
                : "⌁";
      element.setAttribute("aria-label", markerLabel(marker));
      element.dataset.testid = marker.clusterCount && marker.clusterCount > 1
        ? "map-journal-cluster"
        : "map-journal-marker";
      if (marker.clusterCount && marker.clusterCount > 1) {
        element.dataset.clusterCount = String(marker.clusterCount);
      } else {
        element.dataset.captureId = marker.captureId;
      }
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (marker.clusterCount && marker.clusterCount > 1) {
          map.easeTo({
            center: [marker.longitude, marker.latitude],
            zoom: Math.min(18, map.getZoom() + 2),
          });
          return;
        }
        setSelectedId(marker.captureId);
      });
      const mapMarker = new maplibregl.Marker({ element })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);
      markerLayerRef.current.push(mapMarker);
    }
  }, [markers, regionReady, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionReady) return;
    if (gps.status !== "ready") {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      return;
    }
    if (!gpsMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "map-journal-gps";
      el.title = gps.lowAccuracy
        ? `GPS ±${Math.round(gps.accuracy)}m (low accuracy)`
        : `GPS ±${Math.round(gps.accuracy)}m`;
      gpsMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.longitude, gps.latitude])
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([gps.longitude, gps.latitude]);
    }
  }, [gps, regionReady]);

  return (
    <section className="map-journal" aria-label="Map Journal">
      <div className="map-journal-stage">
        <div
          ref={mapHostRef}
          className="map-journal-map"
          data-testid="map-journal-map"
          aria-label="Airplane-mode Offline Region map"
        />
        <div className="map-journal-chrome">
          <p className="map-journal-region" role="status">
            {regionMessage}
          </p>
          <p className="map-journal-gps-status" role="status">
            {gps.status === "ready"
              ? gps.lowAccuracy
                ? `GPS active · low accuracy (±${Math.round(gps.accuracy)} m)`
                : `GPS active (±${Math.round(gps.accuracy)} m)`
              : gps.status === "unavailable"
                ? `GPS: ${gps.reason}`
                : "GPS: locating…"}
          </p>
          <p className="map-journal-connectivity" role="note">
            {online
              ? "Online: Enrichment and sync can run. Topography stays on-device."
              : "Offline: Capture and map review stay on-device. Sync and Enrichment wait for connectivity."}
          </p>
          <button
            type="button"
            className="map-journal-manage"
            onClick={() => setShowRegionManager((value) => !value)}
          >
            {showRegionManager ? "Hide region tools" : "Offline Region tools"}
          </button>
        </div>
        {showRegionManager ? (
          <div className="map-journal-region-tools">
            <OfflineRegionPanel />
          </div>
        ) : null}
      </div>

      {selected ? (
        <ThreadReview
          capture={selected}
          layout={layout}
          online={online}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <aside className="map-journal-empty" aria-label="Capture dock">
          <h2>Map Journal</h2>
          <p>
            Located Captures appear on the Offline Region. Select a marker for
            Thread context and follow-up.
          </p>
          <p className="map-journal-count" role="status">
            {captures.length} located Capture{captures.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            className="map-journal-library-toggle"
            onClick={() =>
              setShowLibrary((value) => {
                const next = !value;
                window.sessionStorage.setItem(
                  "wt.map-journal.library",
                  next ? "1" : "0",
                );
                return next;
              })
            }
          >
            {showLibrary ? "Hide library" : "Show library"}
          </button>
          <CaptureComposer showLists={showLibrary} />
        </aside>
      )}
    </section>
  );
}
