import type { RegionDownloadProgress } from "./types";

/** Format pack bytes for Offline Region download UI (one decimal MB). */
export function formatRegionMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function regionDownloadProgressLabel(
  progress: RegionDownloadProgress | null,
  totalBytes: number,
): string {
  if (!progress || progress.totalBytes <= 0) {
    return `Downloading… ${formatRegionMegabytes(totalBytes)}`;
  }
  return `Downloading… ${formatRegionMegabytes(progress.downloadedBytes)} of ${formatRegionMegabytes(progress.totalBytes)}`;
}

export function regionDownloadPercent(
  progress: RegionDownloadProgress | null,
): number {
  if (!progress || progress.totalBytes <= 0) return 0;
  return Math.min(
    100,
    Math.round((progress.downloadedBytes / progress.totalBytes) * 100),
  );
}
