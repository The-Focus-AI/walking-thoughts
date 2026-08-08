import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";

/**
 * A spot is a stable cluster of photo Captures within ~25 m across days
 * (docs/desk.md, D2). Nobody sets one up: routing a photo Thread to the
 * Timeline is enough, and the frames find each other by GPS.
 */
export const SPOT_RADIUS_METERS = 25;

export type TimelineFrame = {
  captureId: string;
  threadId: string;
  attachmentId: string;
  /** Local object keys for the photo, so the strip can render it offline. */
  localObjectKey: string | null;
  thumbnailObjectKey: string | null;
  fileName: string;
  dayKey: string;
  takenAt: string;
  latitude: number;
  longitude: number;
  /** Whole meters from the spot's settled center. */
  distanceMeters: number;
};

export type TimelineSpot = {
  /** Stable across recomputes: the founding Capture names the spot. */
  id: string;
  /** The earliest frame's Thread titles the spot. */
  name: string;
  center: { latitude: number; longitude: number };
  /** Distinct civil days with a frame here — "morning cow, day 41". */
  dayCount: number;
  /** Day order, oldest first. */
  frames: TimelineFrame[];
};

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance between two fixes, in meters. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) *
      sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

type CandidateFrame = Omit<TimelineFrame, "distanceMeters">;

type WorkingSpot = {
  id: string;
  center: { latitude: number; longitude: number };
  frames: CandidateFrame[];
};

/**
 * The photo Captures the Timeline draws from: located, image-carrying, and
 * belonging to a Thread the walker routed to the Timeline. Removed frames are
 * the walker's one edit at the strip — they leave the cluster input entirely,
 * and the Thread never notices.
 */
function candidateFrames(
  threads: LocalThread[],
  captures: LocalCapture[],
  removedCaptureIds: ReadonlySet<string>,
): CandidateFrame[] {
  const timelineThreads = new Map(
    threads
      .filter((thread) => thread.route === "timeline")
      .map((thread) => [thread.id, thread]),
  );
  const frames: CandidateFrame[] = [];
  for (const capture of captures) {
    if (removedCaptureIds.has(capture.id)) continue;
    if (!capture.location || !capture.threadId) continue;
    if (!timelineThreads.has(capture.threadId)) continue;
    const photo = capture.attachments.find(
      (attachment) => attachment.kind === "image",
    );
    if (!photo) continue;
    frames.push({
      captureId: capture.id,
      threadId: capture.threadId,
      attachmentId: photo.id,
      localObjectKey: photo.localObjectKey,
      thumbnailObjectKey: photo.thumbnailObjectKey ?? null,
      fileName: photo.fileName,
      dayKey: calendarDayKey(new Date(capture.createdAt)),
      takenAt: capture.createdAt,
      latitude: capture.location.latitude,
      longitude: capture.location.longitude,
    });
  }
  return frames.sort((a, b) =>
    a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0,
  );
}

/**
 * Cluster the Timeline's photo Captures into spots. Frames join, in capture
 * order, the nearest spot whose running-mean center is within the spot
 * radius, or found a new spot. The moving mean is what keeps a slowly
 * drifting cluster one spot while two gates 30 m apart stay two.
 */
export function timelineSpots(
  threads: LocalThread[],
  captures: LocalCapture[],
  removedCaptureIds: ReadonlySet<string> = new Set(),
): TimelineSpot[] {
  const spots: WorkingSpot[] = [];
  for (const frame of candidateFrames(threads, captures, removedCaptureIds)) {
    let nearest: WorkingSpot | null = null;
    let nearestDistance = Infinity;
    for (const spot of spots) {
      const separation = distanceMeters(spot.center, frame);
      if (separation <= SPOT_RADIUS_METERS && separation < nearestDistance) {
        nearest = spot;
        nearestDistance = separation;
      }
    }
    if (nearest) {
      nearest.frames.push(frame);
      const count = nearest.frames.length;
      nearest.center = {
        latitude:
          nearest.center.latitude +
          (frame.latitude - nearest.center.latitude) / count,
        longitude:
          nearest.center.longitude +
          (frame.longitude - nearest.center.longitude) / count,
      };
    } else {
      spots.push({
        id: `spot-${frame.captureId}`,
        center: { latitude: frame.latitude, longitude: frame.longitude },
        frames: [frame],
      });
    }
  }

  const titles = new Map(threads.map((thread) => [thread.id, thread.title]));
  return spots.map((spot) => ({
    id: spot.id,
    name: titles.get(spot.frames[0].threadId) || "Spot",
    center: spot.center,
    dayCount: new Set(spot.frames.map((frame) => frame.dayKey)).size,
    frames: spot.frames.map((frame) => ({
      ...frame,
      distanceMeters: Math.round(distanceMeters(spot.center, frame)),
    })),
  }));
}

export type TimelineSpotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { spotId: string; name: string; dayCount: number };
};

export type TimelineSpotCollection = {
  type: "FeatureCollection";
  features: TimelineSpotFeature[];
};

/** Spot markers for the map journal: one point per spot, labeled with days. */
export function timelineSpotMarkers(
  spots: TimelineSpot[],
): TimelineSpotCollection {
  return {
    type: "FeatureCollection",
    features: spots.map((spot) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [spot.center.longitude, spot.center.latitude] as [
          number,
          number,
        ],
      },
      properties: {
        spotId: spot.id,
        name: spot.name,
        dayCount: spot.dayCount,
      },
    })),
  };
}
