import { expect, test } from "@playwright/test";
import type {
  LocalCapture,
  LocalThread,
  ThreadRoute,
} from "@/lib/local-capture/types";
import {
  distanceMeters,
  SPOT_RADIUS_METERS,
  timelineSpotMarkers,
  timelineSpots,
} from "@/lib/map-journal/timeline-spots";

// The cow gate from the day-routing prototype, near enough.
const GATE = { latitude: 41.9503, longitude: -73.5642 };
const METERS_PER_DEGREE_LATITUDE = 111_320;

/** A fix some meters north/east of a base — small offsets, flat-earth math. */
function offset(
  base: { latitude: number; longitude: number },
  north: number,
  east: number,
) {
  return {
    latitude: base.latitude + north / METERS_PER_DEGREE_LATITUDE,
    longitude:
      base.longitude +
      east /
        (METERS_PER_DEGREE_LATITUDE *
          Math.cos((base.latitude * Math.PI) / 180)),
  };
}

function thread(
  id: string,
  title: string,
  route: ThreadRoute | null = "timeline",
): LocalThread {
  return {
    id,
    title,
    revision: 1,
    updatedAt: "2026-08-08T12:00:00.000Z",
    reviewedAt: route ? "2026-08-08T12:00:00.000Z" : null,
    route,
  };
}

function photoCapture(
  id: string,
  threadId: string,
  createdAt: string,
  location: { latitude: number; longitude: number } | null,
): LocalCapture {
  return {
    id,
    text: "",
    createdAt,
    location: location ? { ...location, accuracy: 8 } : null,
    status: "complete",
    threadId,
    sequence: 1,
    attachments: [
      {
        id: `${id}-photo`,
        kind: "image",
        mimeType: "image/jpeg",
        fileName: `${id}.jpg`,
        byteLength: 3,
        localObjectKey: `${id}/photo`,
        thumbnailObjectKey: `${id}/photo:thumb`,
        remoteObjectKey: null,
        syncStatus: "complete",
      },
    ],
  };
}

test("photo Captures at the same spot across days cluster into one strip", () => {
  const threads = [
    thread("t1", "Morning cow at the gate"),
    thread("t2", "Cow again"),
    thread("t3", "Cow, foggy"),
  ];
  // Shuffled input: capture order comes from timestamps, not array order.
  const captures = [
    photoCapture("c3", "t3", "2026-08-07T12:31:00.000Z", offset(GATE, 12, -6)),
    photoCapture("c1", "t1", "2026-08-05T12:24:00.000Z", GATE),
    photoCapture("c2", "t2", "2026-08-06T12:26:00.000Z", offset(GATE, 8, 5)),
  ];

  const spots = timelineSpots(threads, captures);
  expect(spots).toHaveLength(1);
  const [spot] = spots;
  expect(spot.name).toBe("Morning cow at the gate");
  expect(spot.dayCount).toBe(3);
  expect(spot.frames.map((frame) => frame.captureId)).toEqual([
    "c1",
    "c2",
    "c3",
  ]);
  expect(spot.frames.map((frame) => frame.dayKey)).toEqual([
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
  ]);
  for (const frame of spot.frames) {
    expect(frame.distanceMeters).toBeLessThanOrEqual(SPOT_RADIUS_METERS);
    expect(frame.attachmentId).toBe(`${frame.captureId}-photo`);
  }
});

test("two spots 30 m apart stay separate, and frames join the nearest", () => {
  const upperGate = offset(GATE, 30, 0);
  const threads = [
    thread("t1", "Lower gate"),
    thread("t2", "Upper gate"),
    thread("t3", "Upper gate, later"),
  ];
  const captures = [
    photoCapture("lower", "t1", "2026-08-05T12:00:00.000Z", GATE),
    photoCapture("upper", "t2", "2026-08-06T12:00:00.000Z", upperGate),
    photoCapture(
      "upper2",
      "t3",
      "2026-08-07T12:00:00.000Z",
      offset(upperGate, -5, 0),
    ),
  ];

  const spots = timelineSpots(threads, captures);
  expect(spots).toHaveLength(2);
  const lower = spots.find((spot) => spot.name === "Lower gate")!;
  const upper = spots.find((spot) => spot.name === "Upper gate")!;
  expect(lower.frames.map((frame) => frame.captureId)).toEqual(["lower"]);
  expect(upper.frames.map((frame) => frame.captureId)).toEqual([
    "upper",
    "upper2",
  ]);
  expect(
    distanceMeters(lower.center, upper.center),
  ).toBeGreaterThan(SPOT_RADIUS_METERS);
});

test("a drifting cluster stays one spot", () => {
  // Each frame is ~12 m past the last — 36 m of total drift, but never more
  // than the spot radius from the running-mean center.
  const threads = [thread("t1", "Cow gate")];
  const captures = [0, 12, 24, 36].map((north, index) =>
    photoCapture(
      `c${index}`,
      "t1",
      `2026-08-0${index + 4}T12:00:00.000Z`,
      offset(GATE, north, 0),
    ),
  );

  const spots = timelineSpots(threads, captures);
  expect(spots).toHaveLength(1);
  expect(spots[0].dayCount).toBe(4);
  expect(spots[0].frames).toHaveLength(4);
});

test("only located photo Captures of Timeline-routed Threads become frames", () => {
  const threads = [
    thread("t-timeline", "Cow gate"),
    thread("t-journal", "Pond study", "journal"),
    thread("t-unrouted", "Not settled yet", null),
  ];
  const textOnly: LocalCapture = {
    ...photoCapture("text", "t-timeline", "2026-08-05T12:40:00.000Z", GATE),
    attachments: [],
    text: "No photo here",
  };
  const captures = [
    photoCapture("kept", "t-timeline", "2026-08-05T12:00:00.000Z", GATE),
    photoCapture("no-gps", "t-timeline", "2026-08-06T12:00:00.000Z", null),
    photoCapture("journal", "t-journal", "2026-08-05T12:10:00.000Z", GATE),
    photoCapture("unrouted", "t-unrouted", "2026-08-05T12:20:00.000Z", GATE),
    textOnly,
  ];

  const spots = timelineSpots(threads, captures);
  expect(spots).toHaveLength(1);
  expect(spots[0].frames.map((frame) => frame.captureId)).toEqual(["kept"]);
});

test("a removed frame leaves the strip without touching the rest", () => {
  const threads = [thread("t1", "Cow gate"), thread("t2", "Cow, day two")];
  const captures = [
    photoCapture("c1", "t1", "2026-08-05T12:00:00.000Z", GATE),
    photoCapture("c2", "t2", "2026-08-06T12:00:00.000Z", offset(GATE, 6, 3)),
  ];

  // Removing the founding frame keeps the spot alive on what remains.
  const spots = timelineSpots(threads, captures, new Set(["c1"]));
  expect(spots).toHaveLength(1);
  expect(spots[0].frames.map((frame) => frame.captureId)).toEqual(["c2"]);
  expect(spots[0].dayCount).toBe(1);
  expect(spots[0].name).toBe("Cow, day two");

  // Removing everything removes the spot.
  expect(timelineSpots(threads, captures, new Set(["c1", "c2"]))).toEqual([]);
});

test("spot markers carry the day count to the map", () => {
  const threads = [thread("t1", "Cow gate")];
  const captures = [
    photoCapture("c1", "t1", "2026-08-05T12:00:00.000Z", GATE),
    photoCapture("c2", "t1", "2026-08-06T12:00:00.000Z", offset(GATE, 4, 4)),
  ];

  const markers = timelineSpotMarkers(timelineSpots(threads, captures));
  expect(markers.features).toHaveLength(1);
  const [feature] = markers.features;
  expect(feature.properties).toMatchObject({
    spotId: "spot-c1",
    name: "Cow gate",
    dayCount: 2,
  });
  expect(feature.geometry.coordinates[0]).toBeCloseTo(GATE.longitude, 3);
  expect(feature.geometry.coordinates[1]).toBeCloseTo(GATE.latitude, 3);
});
