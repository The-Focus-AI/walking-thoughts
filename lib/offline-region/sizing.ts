import type { LatLng, PackEstimate, RegionSelection } from "./types";

/** Canonical home Offline Region radius (~25 miles). */
export const DEFAULT_RADIUS_MILES = 25;
export const DEFAULT_RADIUS_KM = 40;

const KM_PER_MILE = 1.609344;

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function defaultHomeSelection(home: LatLng): RegionSelection {
  return {
    center: home,
    radiusKm: DEFAULT_RADIUS_KM,
    name: "Home Offline Region",
  };
}

/**
 * Estimated installed pack size before download.
 * Area-scaled model for trail-first vector packs (not network tile cache).
 */
export function estimatePack(selection: RegionSelection): PackEstimate {
  const radiusKm = selection.radiusKm;
  const area = Math.PI * radiusKm * radiusKm;
  const estimatedBytes = Math.round(1_800_000 + area * 3_200);
  const assetCount = Math.max(4, Math.round(3 + radiusKm / 10));
  return {
    radiusKm,
    radiusMiles: Number(kmToMiles(radiusKm).toFixed(1)),
    estimatedBytes,
    assetCount,
  };
}
