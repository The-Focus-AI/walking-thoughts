import { markerKindFor } from "./mappable";
import type { JournalMarker, MappableCapture } from "./types";

const CELL_DEG_BY_ZOOM: Record<number, number> = {
  8: 0.2,
  9: 0.12,
  10: 0.08,
  11: 0.05,
  12: 0.03,
  13: 0.015,
  14: 0.008,
  15: 0.004,
  16: 0.002,
  17: 0.001,
  18: 0.0005,
};

function cellSize(zoom: number): number {
  const keyed = Math.max(8, Math.min(18, Math.round(zoom)));
  return CELL_DEG_BY_ZOOM[keyed] ?? 0.01;
}

/**
 * Grid clustering for Map Journal markers. Pure so Playwright unit tests do
 * not need MapLibre.
 */
export function clusterMarkers(
  captures: MappableCapture[],
  zoom: number,
): JournalMarker[] {
  if (captures.length === 0) return [];
  const size = cellSize(zoom);
  if (size <= 0.001 || zoom >= 15) {
    return captures.map((capture) => ({
      id: capture.id,
      captureId: capture.id,
      threadId: capture.threadId,
      latitude: capture.latitude,
      longitude: capture.longitude,
      kind: markerKindFor(capture),
    }));
  }

  const buckets = new Map<string, MappableCapture[]>();
  for (const capture of captures) {
    const key = `${Math.floor(capture.latitude / size)}:${Math.floor(capture.longitude / size)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(capture);
    buckets.set(key, bucket);
  }

  const markers: JournalMarker[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length === 1) {
      const capture = bucket[0]!;
      markers.push({
        id: capture.id,
        captureId: capture.id,
        threadId: capture.threadId,
        latitude: capture.latitude,
        longitude: capture.longitude,
        kind: markerKindFor(capture),
      });
      continue;
    }
    const latitude =
      bucket.reduce((sum, item) => sum + item.latitude, 0) / bucket.length;
    const longitude =
      bucket.reduce((sum, item) => sum + item.longitude, 0) / bucket.length;
    markers.push({
      id: `cluster:${key}`,
      captureId: bucket[0]!.id,
      threadId: bucket[0]!.threadId,
      latitude,
      longitude,
      kind: markerKindFor(bucket[0]!),
      clusterCount: bucket.length,
    });
  }
  return markers;
}
