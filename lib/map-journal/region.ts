/**
 * Published Offline Region packs under `/public/offline-region/`.
 * Only `fixture` ships in the repo today; `home` is optional after
 * `mise run region:build`.
 */
export const DEFAULT_PUBLISHED_REGION = "fixture";
export const PREFERRED_HOME_REGION = "home";

/**
 * Resolve which Offline Region the Map Journal should load.
 * Defaults to the committed fixture so `/journal` works without a local build.
 * `?region=home` still selects home when that pack is published.
 */
export function resolveJournalRegion(
  requested: string | null | undefined,
): string {
  if (requested === PREFERRED_HOME_REGION) return PREFERRED_HOME_REGION;
  if (requested === DEFAULT_PUBLISHED_REGION) return DEFAULT_PUBLISHED_REGION;
  if (requested && requested.trim().length > 0) return requested.trim();
  return DEFAULT_PUBLISHED_REGION;
}
