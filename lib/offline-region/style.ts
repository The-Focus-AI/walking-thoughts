import { layers, namedFlavor } from "@protomaps/basemaps";
import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { RegionManifest } from "./types";

type StyleInputs = {
  manifest: RegionManifest;
  basemapUrl: string;
  terrainUrl: string;
  contoursUrl: string;
  glyphsUrl: string;
};

const TRAIL_COLOR = "#8a4a2c";
const TRAIL_HALO = "#fdf6ec";
const CONTOUR_COLOR = "#a9834f";

function trailLayers(): LayerSpecification[] {
  const trailFilter = [
    "all",
    ["==", "kind", "path"],
    ["!has", "is_tunnel"],
    ["!has", "is_bridge"],
  ] as FilterSpecification;

  return [
    {
      id: "trails_casing",
      type: "line",
      source: "basemap",
      "source-layer": "roads",
      filter: trailFilter,
      minzoom: 10,
      paint: {
        "line-color": TRAIL_HALO,
        "line-opacity": 0.85,
        "line-width": [
          "interpolate",
          ["exponential", 1.6],
          ["zoom"],
          10,
          1.5,
          14,
          4,
          18,
          14,
        ],
      },
    },
    {
      id: "trails",
      type: "line",
      source: "basemap",
      "source-layer": "roads",
      filter: trailFilter,
      minzoom: 10,
      paint: {
        "line-color": TRAIL_COLOR,
        "line-dasharray": [2.5, 1.5],
        "line-width": [
          "interpolate",
          ["exponential", 1.6],
          ["zoom"],
          10,
          0.75,
          14,
          2,
          18,
          7,
        ],
      },
    },
  ];
}

function trailLabelLayer(): LayerSpecification {
  return {
    id: "trails_labels",
    type: "symbol",
    source: "basemap",
    "source-layer": "roads",
    filter: ["all", ["==", "kind", "path"], ["has", "name"]],
    minzoom: 13,
    layout: {
      "symbol-placement": "line",
      "text-font": ["Noto Sans Medium"],
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 18, 15],
    },
    paint: {
      "text-color": TRAIL_COLOR,
      "text-halo-color": TRAIL_HALO,
      "text-halo-width": 2,
    },
  };
}

function terrainLayers(): LayerSpecification[] {
  return [
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain",
      paint: {
        "hillshade-exaggeration": 0.35,
        "hillshade-shadow-color": "#5a4a3a",
        "hillshade-highlight-color": "#fffcf5",
      },
    },
    {
      id: "contours_regular",
      type: "line",
      source: "contours",
      "source-layer": "contour_10",
      minzoom: 13,
      paint: {
        "line-color": CONTOUR_COLOR,
        "line-opacity": 0.45,
        "line-width": 0.6,
      },
    },
    {
      id: "contours_index",
      type: "line",
      source: "contours",
      "source-layer": "contour_50",
      minzoom: 11,
      paint: {
        "line-color": CONTOUR_COLOR,
        "line-opacity": 0.65,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 1.6],
      },
    },
  ];
}

function contourLabelLayer(): LayerSpecification {
  return {
    id: "contours_labels",
    type: "symbol",
    source: "contours",
    "source-layer": "contour_50",
    minzoom: 13,
    layout: {
      "symbol-placement": "line",
      "text-font": ["Noto Sans Regular"],
      "text-field": ["concat", ["to-string", ["get", "ele"]], " m"],
      "text-size": 10,
    },
    paint: {
      "text-color": CONTOUR_COLOR,
      "text-halo-color": TRAIL_HALO,
      "text-halo-width": 1.5,
    },
  };
}

/**
 * A trail-first topographic style: walkable paths are drawn boldly above a
 * hillshaded, contoured base while driving detail stays muted underneath.
 */
export function trailFirstStyle(inputs: StyleInputs): StyleSpecification {
  const flavor = {
    ...namedFlavor("light"),
    // Mute driving-oriented emphasis so trails and terrain lead.
    highway: "#d9d2c8",
    major: "#e4ddd2",
    minor_a: "#ece6dc",
    minor_b: "#ece6dc",
  };

  const base = layers("basemap", flavor, { lang: "en" })
    .filter(
      (layer) =>
        layer.id !== "pois" &&
        layer.id !== "roads_shields" &&
        layer.id !== "roads_oneway",
    )
    .map((layer) => {
      if (layer.type !== "symbol" || !layer.layout) return layer;
      // Sprite icons are not packaged offline; keep text labels only.
      const layout = { ...layer.layout } as Record<string, unknown>;
      delete layout["icon-image"];
      return { ...layer, layout } as LayerSpecification;
    })
    .map((layer) => {
      // The flavor's generic "other" layer would double-draw paths under the
      // dedicated trail treatment.
      if (
        (layer.id !== "roads_other" && layer.id !== "roads_labels_minor") ||
        !("filter" in layer)
      ) {
        return layer;
      }
      return {
        ...layer,
        filter: ["all", layer.filter, ["!=", "kind", "path"]],
      } as LayerSpecification;
    });

  const styled: LayerSpecification[] = [];
  for (const layer of base) {
    if (layer.id === "water") styled.push(...terrainLayers());
    if (layer.id === "address_label") styled.push(...trailLayers());
    if (layer.id === "places_subplace") {
      styled.push(contourLabelLayer(), trailLabelLayer());
    }
    styled.push(layer);
  }

  return {
    version: 8,
    glyphs: inputs.glyphsUrl,
    sources: {
      basemap: {
        type: "vector",
        url: inputs.basemapUrl,
        attribution: inputs.manifest.attribution,
      },
      terrain: {
        type: "raster-dem",
        url: inputs.terrainUrl,
        encoding: "terrarium",
        tileSize: 256,
      },
      contours: {
        type: "vector",
        url: inputs.contoursUrl,
      },
    },
    layers: styled,
  };
}
