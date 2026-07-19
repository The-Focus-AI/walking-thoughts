/**
 * Offline Region selection for Map Journal / Offline page / home hero.
 * `fixture` ships under `/public/offline-region/fixture` for tests and demos.
 * `home` is the public Blob-hosted Cornwall Bridge pack.
 */
export const DEFAULT_PUBLISHED_REGION = "fixture";
export const PREFERRED_HOME_REGION = "home";

/**
 * Public Blob base for the home offline Region pack (no trailing slash).
 * Not a secret — same default as `fnox.toml` / `NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE`.
 */
export const PUBLIC_HOME_REGION_BASE =
  "https://dfshk3veycwqp13u.public.blob.vercel-storage.com/offline-region/home";

export type RegionEnv = {
  NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE?: string;
};

/**
 * Public Blob (or other CDN) base URL for the home offline Region pack,
 * without a trailing slash.
 *
 * - Non-empty value → that URL
 * - Explicit empty / whitespace → null (fixture; Playwright sets this)
 * - Unset → {@link PUBLIC_HOME_REGION_BASE}
 *
 * Product calls must use the zero-arg form so Next.js can inline
 * `process.env.NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE` at build time. Passing
 * `process.env` as an object breaks that inlining and silently fell back to
 * the village fixture in production.
 */
export function homeRegionBaseUrl(env?: RegionEnv): string | null {
  if (env !== undefined) {
    if (!("NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE" in env)) {
      return PUBLIC_HOME_REGION_BASE;
    }
    const value = env.NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE?.trim() ?? "";
    if (!value) return null;
    return value.replace(/\/+$/, "");
  }

  // Direct member access — required for Next.js NEXT_PUBLIC inlining.
  const baked = process.env.NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE;
  if (typeof baked === "undefined") {
    return PUBLIC_HOME_REGION_BASE;
  }
  const value = baked.trim();
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
 * Prefers Blob-hosted `home` when a home base is available; otherwise fixture.
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
