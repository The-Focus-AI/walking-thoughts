import { sha256Hex } from "./checksum";
import { estimatePack } from "./sizing";
import type {
  OfflineRegionManifest,
  PackCatalog,
  PackAssetDescriptor,
  RegionSelection,
} from "./types";

function layerNames(): string[] {
  return [
    "trails",
    "contours",
    "hillshade",
    "water",
    "roads",
    "landcover",
    "places",
    "elevation-labels",
  ];
}

function regionIdFor(selection: RegionSelection): string {
  return `region:${selection.center.latitude.toFixed(4)},${selection.center.longitude.toFixed(4)}:${selection.radiusKm}`;
}

function assetPath(index: number): string {
  if (index === 0) return "style/trails.json";
  if (index === 1) return "tiles/metadata.json";
  return `tiles/chunk-${index}.bin`;
}

function assetPayload(
  regionId: string,
  version: number,
  assetId: string,
  index: number,
): string {
  if (index === 0) {
    return JSON.stringify({
      priority: "trails",
      layers: layerNames(),
      version,
    });
  }
  return `trail-first-pack:v${version}:${regionId}:${assetId}`;
}

export function encodePackAsset(input: {
  regionId: string;
  version: number;
  assetId: string;
  index: number;
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      regionId: input.regionId,
      version: input.version,
      assetId: input.assetId,
      payload: assetPayload(
        input.regionId,
        input.version,
        input.assetId,
        input.index,
      ),
    }),
  );
}

export type MemoryCatalogOptions = {
  corruptAssetId?: string;
  failAssetId?: string;
  failTimes?: number;
  version?: number;
};

/**
 * Deterministic trail-first pack catalog for tests and local demos.
 * Explicit Offline Region downloads — never a viewed-tile cache.
 */
export function createMemoryPackCatalog(
  options: MemoryCatalogOptions = {},
): PackCatalog {
  let failRemaining = options.failTimes ?? 1;
  const version = options.version ?? 1;

  return {
    async plan(selection) {
      const estimate = estimatePack(selection);
      const regionId = regionIdFor(selection);
      const assets: PackAssetDescriptor[] = [];
      for (let i = 0; i < estimate.assetCount; i += 1) {
        const id = `asset-${i}`;
        const bytes = encodePackAsset({
          regionId,
          version,
          assetId: id,
          index: i,
        });
        assets.push({
          id,
          path: assetPath(i),
          byteLength: bytes.byteLength,
          checksum: await sha256Hex(bytes),
        });
      }

      return {
        regionId,
        version,
        center: selection.center,
        radiusKm: selection.radiusKm,
        name: selection.name ?? "Home Offline Region",
        createdAt: `2026-07-18T12:00:0${version}.000Z`,
        assets,
        style: {
          priority: "trails",
          layers: layerNames(),
        },
      };
    },
    async fetchAsset(regionId, ver, assetId) {
      if (options.failAssetId === assetId && failRemaining > 0) {
        failRemaining -= 1;
        throw new Error("network_interrupted");
      }
      const index = Number(assetId.replace("asset-", ""));
      if (!Number.isFinite(index)) {
        throw new Error(`unknown_asset:${assetId}`);
      }
      let bytes = encodePackAsset({
        regionId,
        version: ver,
        assetId,
        index,
      });
      if (options.corruptAssetId === assetId) {
        bytes = Uint8Array.from([...bytes, 0xff]);
      }
      return bytes;
    },
  };
}

export async function planVersionedCatalog(
  selection: RegionSelection,
  version: number,
  options: MemoryCatalogOptions = {},
): Promise<{ catalog: PackCatalog; manifest: OfflineRegionManifest }> {
  const catalog = createMemoryPackCatalog({ ...options, version });
  const manifest = await catalog.plan(selection);
  return { catalog, manifest };
}
