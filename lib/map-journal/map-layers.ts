import type maplibregl from "maplibre-gl";
import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { CaptureMarkerCollection } from "./markers";

export const MARKERS_SOURCE = "capture-markers";
export const CLUSTER_LAYER = "capture-clusters";
export const CLUSTER_COUNT_LAYER = "capture-cluster-counts";
export const MARKER_LAYER = "capture-marker-points";
export const MARKER_GLYPH_LAYER = "capture-marker-glyphs";

const MARKER_COLORS: DataDrivenPropertyValueSpecification<string> = [
  "match",
  ["get", "kind"],
  "image",
  "#2f5e46",
  "video",
  "#6a3d78",
  "audio",
  "#a05c22",
  "#17402b",
];

/**
 * Media-aware Capture markers with zoomed-out clustering, drawn above the
 * trail-first basemap. Uses circle + text layers only so no sprite assets are
 * required offline.
 */
export function addCaptureMarkerLayers(
  map: maplibregl.Map,
  markers: CaptureMarkerCollection,
): void {
  map.addSource(MARKERS_SOURCE, {
    type: "geojson",
    data: markers,
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 46,
  });

  map.addLayer({
    id: CLUSTER_LAYER,
    type: "circle",
    source: MARKERS_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#17402b",
      "circle-opacity": 0.92,
      "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26],
      "circle-stroke-color": "#fdf6ec",
      "circle-stroke-width": 2.5,
    },
  });

  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: "symbol",
    source: MARKERS_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "point_count"]],
      "text-font": ["Noto Sans Medium"],
      "text-size": 13,
    },
    paint: { "text-color": "#fdf6ec" },
  });

  map.addLayer({
    id: MARKER_LAYER,
    type: "circle",
    source: MARKERS_SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": MARKER_COLORS,
      "circle-radius": 13,
      "circle-stroke-color": "#fdf6ec",
      "circle-stroke-width": 2.5,
    },
  });

  map.addLayer({
    id: MARKER_GLYPH_LAYER,
    type: "symbol",
    source: MARKERS_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "glyph"],
      "text-font": ["Noto Sans Medium"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#fdf6ec" },
  });
}

export function updateCaptureMarkers(
  map: maplibregl.Map,
  markers: CaptureMarkerCollection,
): void {
  const source = map.getSource(MARKERS_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;
  source?.setData(markers as never);
}
