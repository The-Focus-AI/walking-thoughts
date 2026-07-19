import maplibregl from "maplibre-gl";
import { FileSource, PMTiles, Protocol } from "pmtiles";
import type { RegionStore } from "./store";
import { trailFirstStyle } from "./style";
import type { RegionManifest } from "./types";

let pmtilesProtocol: Protocol | null = null;
const glyphStores = new Map<string, RegionStore>();
const glyphManifests = new Map<string, RegionManifest>();

function ensureProtocols(): Protocol {
  if (pmtilesProtocol) return pmtilesProtocol;

  pmtilesProtocol = new Protocol({ metadata: true });
  maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

  // Glyph ranges load from origin-private file storage so text keeps working
  // in airplane mode: region-glyphs://<region>/<fontstack>/<range>.pbf
  maplibregl.addProtocol("region-glyphs", async (params) => {
    const segments = params.url
      .replace("region-glyphs://", "")
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    const [region, fontstack, range] = segments;
    const store = glyphStores.get(region);
    const manifest = glyphManifests.get(region);
    if (!store || !manifest) {
      throw new Error(`Offline Region ${region} glyphs are not registered`);
    }
    const file = await store.openFile(manifest, `fonts/${fontstack}/${range}`);
    return { data: await file.arrayBuffer() };
  });

  return pmtilesProtocol;
}

export type RegionMap = {
  map: maplibregl.Map;
  firstRenderMs: Promise<number>;
};

export async function renderInstalledRegion(
  container: HTMLElement,
  store: RegionStore,
  manifest: RegionManifest,
): Promise<RegionMap> {
  const protocol = ensureProtocols();
  glyphStores.set(manifest.region, store);
  glyphManifests.set(manifest.region, manifest);

  const keys: Record<string, string> = {};
  for (const artifact of manifest.artifacts) {
    const file = await store.openFile(manifest, artifact.path);
    // FileSource keys by file name; qualify it so regions cannot collide.
    const named = new File([file], `${manifest.region}-v${manifest.version}-${artifact.path}`);
    protocol.add(new PMTiles(new FileSource(named)));
    keys[artifact.path] = named.name;
  }

  const style = trailFirstStyle({
    manifest,
    basemapUrl: `pmtiles://${keys["basemap.pmtiles"]}`,
    terrainUrl: `pmtiles://${keys["terrain.pmtiles"]}`,
    contoursUrl: `pmtiles://${keys["contours.pmtiles"]}`,
    glyphsUrl: `region-glyphs://${manifest.region}/{fontstack}/{range}.pbf`,
  });

  const constructed = performance.now();
  const map = new maplibregl.Map({
    container,
    style,
    center: [manifest.center.longitude, manifest.center.latitude],
    zoom: 13,
    minZoom: 8,
    maxZoom: 18,
    maxBounds: [
      [manifest.bounds[0], manifest.bounds[1]],
      [manifest.bounds[2], manifest.bounds[3]],
    ],
    attributionControl: { compact: false },
    // Lets tests read pixels back to prove the region actually painted.
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
  );

  const firstRenderMs = new Promise<number>((resolve) => {
    map.once("idle", () => resolve(performance.now() - constructed));
  });

  (window as Window & { __WT_REGION_MAP__?: maplibregl.Map }).__WT_REGION_MAP__ =
    map;

  return { map, firstRenderMs };
}
