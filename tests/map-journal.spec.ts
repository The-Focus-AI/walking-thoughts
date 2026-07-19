import { expect, test } from "@playwright/test";
import { clusterMarkers } from "@/lib/map-journal/cluster";
import { createLiveGpsSession } from "@/lib/map-journal/gps";
import {
  listMappableCaptures,
  markerKindFor,
  toMappableCapture,
} from "@/lib/map-journal/mappable";
import {
  createMemoryCaptureStore,
} from "@/lib/local-capture/store";

test("lists only Captures that have a location", async () => {
  const store = createMemoryCaptureStore();
  await store.commit("No coords", null);
  await store.commit("Ridge owl", {
    latitude: 39.1,
    longitude: -78.2,
    accuracy: 12,
  });
  await store.commit(
    "Photo of creek",
    { latitude: 39.11, longitude: -78.21, accuracy: 8 },
    {
      attachments: [
        {
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "creek.jpg",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    },
  );

  const mappable = await listMappableCaptures(store);
  expect(mappable).toHaveLength(2);
  expect(mappable.map((item) => item.text)).toEqual([
    "Ridge owl",
    "Photo of creek",
  ]);
  expect(markerKindFor(mappable[1]!)).toBe("image");
  expect(toMappableCapture((await store.list())[0]!)).toBeNull();
});

test("clusters nearby Captures when zoomed out and expands when zoomed in", () => {
  const captures = [
    {
      id: "a",
      threadId: "a",
      text: "one",
      createdAt: "2026-07-19T00:00:00.000Z",
      latitude: 39.1,
      longitude: -78.2,
      accuracy: 10,
      status: "complete" as const,
      mediaKinds: [],
    },
    {
      id: "b",
      threadId: "b",
      text: "two",
      createdAt: "2026-07-19T00:01:00.000Z",
      latitude: 39.1005,
      longitude: -78.2005,
      accuracy: 10,
      status: "complete" as const,
      mediaKinds: ["image" as const],
    },
    {
      id: "c",
      threadId: "c",
      text: "far",
      createdAt: "2026-07-19T00:02:00.000Z",
      latitude: 40.5,
      longitude: -79.5,
      accuracy: 10,
      status: "complete" as const,
      mediaKinds: [],
    },
  ];

  const zoomedOut = clusterMarkers(captures, 10);
  expect(zoomedOut.some((marker) => (marker.clusterCount ?? 1) >= 2)).toBe(
    true,
  );
  expect(zoomedOut).toHaveLength(2);

  const zoomedIn = clusterMarkers(captures, 16);
  expect(zoomedIn).toHaveLength(3);
  expect(zoomedIn.every((marker) => marker.clusterCount == null)).toBe(true);
});

test("live GPS starts only while active and reports low accuracy honestly", () => {
  const fixes: Array<{
    coords: { latitude: number; longitude: number; accuracy: number };
  }> = [];
  let watchId = 0;
  const geolocation = {
    watchPosition(
      success: PositionCallback,
      _error?: PositionErrorCallback | null,
    ) {
      watchId += 1;
      queueMicrotask(() => {
        const next = fixes.shift();
        if (!next) return;
        success({
          coords: next.coords,
          timestamp: Date.now(),
        } as GeolocationPosition);
      });
      return watchId;
    },
    clearWatch() {
      watchId = 0;
    },
  };

  const session = createLiveGpsSession(geolocation, {
    lowAccuracyMeters: 50,
  });
  expect(session.read().status).toBe("pending");

  fixes.push({
    coords: { latitude: 39.1, longitude: -78.2, accuracy: 120 },
  });
  session.start();
  return new Promise<void>((resolve) => {
    const stop = session.subscribe((fix) => {
      if (fix.status !== "ready") return;
      expect(fix.lowAccuracy).toBe(true);
      expect(fix.accuracy).toBe(120);
      session.stop();
      expect(session.read().status).toBe("pending");
      stop();
      resolve();
    });
  });
});
