/**
 * Offline Region selection for Map Journal.
 * `fixture` ships under `/public/offline-region/fixture`.
 * `home` is served from Vercel Blob when
 * `NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE` is set, otherwise from a local
 * `mise run region:build` under `/public/offline-region/home`.
 */
export const DEFAULT_PUBLISHED_REGION = "fixture";
export const PREFERRED_HOME_REGION = "home";

export type RegionEnv = {
  NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE?: string;
};

/**
 * Public Blob (or other CDN) base URL for the home Offline Region pack,
 * without a trailing slash. Null when unset so the journal falls back to
 * the committed fixture.
 */
export function homeRegionBaseUrl(
  env: RegionEnv = process.env as RegionEnv,
): string | null {
  const value = env.NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export type RegionResolveOptions = {
  homeBaseUrl?: string | null;
};

function resolvedHomeBase(options?: RegionResolveOptions): string | null {
  if (options && "homeBaseUrl" in options) return options.homeBaseUrl ?? null;
  return homeRegionBaseUrl();
}

/**
 * Resolve which Offline Region the Map Journal should load.
 * Prefers Blob-hosted `home` when configured; otherwise the committed fixture.
 * `?region=fixture` and `?region=home` always win.
 */
export function resolveJournalRegion(
  requested: string | null | undefined,
  options?: RegionResolveOptions,
): string {
  if (requested === PREFERRED_HOME_REGION) return PREFERRED_HOME_REGION;
  if (requested === DEFAULT_PUBLISHED_REGION) return DEFAULT_PUBLISHED_REGION;
  if (requested && requested.trim().length > 0) return requested.trim();
  if (resolvedHomeBase(options)) return PREFERRED_HOME_REGION;
  return DEFAULT_PUBLISHED_REGION;
}

/**
 * Origin for pack downloads (`manifest.json`, PMTiles, fonts).
 * Home may be an absolute Blob URL; other regions stay on this origin.
 */
export function resolveRegionBaseUrl(
  region: string,
  options?: RegionResolveOptions,
): string {
  if (region === PREFERRED_HOME_REGION) {
    const home = resolvedHomeBase(options);
    if (home) return home;
  }
  return `/offline-region/${region}`;
}
