import { expect, type Page } from "@playwright/test";
import type { MapJournalHook } from "@/components/map-journal";
import type { CaptureStore } from "@/lib/local-capture/types";

export const JOURNAL_URL = "/journal?region=fixture";

// Inside the fixture region (1.5 km around Cornwall CT).
export const TRAIL_FORK = {
  latitude: 41.8452,
  longitude: -73.3301,
  accuracy: 9,
};
export const NEARBY_LEDGE = {
  latitude: 41.8449,
  longitude: -73.3297,
  accuracy: 12,
};
export const FAR_MEADOW = {
  latitude: 41.8391,
  longitude: -73.3352,
  accuracy: 8,
};

export type JournalWindow = Window & {
  __WT_MAP_JOURNAL__?: MapJournalHook;
  __WT_CAPTURE_STORE__?: CaptureStore;
  __WT_REGION_MAP__?: import("maplibre-gl").Map;
};

export function journal(page: Page) {
  return page.evaluate(() => {
    const hook = (window as JournalWindow).__WT_MAP_JOURNAL__;
    return hook
      ? {
          state: hook.state,
          markerCount: hook.markerCount,
          gps: hook.gps,
          selectedCaptureId: hook.selectedCaptureId,
        }
      : null;
  });
}

export async function installFixtureRegion(page: Page) {
  await page.goto(JOURNAL_URL);
  await page.getByRole("button", { name: "Download Offline Region" }).click();
  await expect(page.getByTestId("journal-map")).toBeVisible({
    timeout: 30_000,
  });
}

export async function waitForIdleMap(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const map = (window as JournalWindow).__WT_REGION_MAP__;
          if (!map) return false;
          if (map.loaded()) return true;
          await new Promise<void>((resolve) =>
            map.once("idle", () => resolve()),
          );
          return true;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function jumpToIdle(
  page: Page,
  center: [number, number],
  zoom: number,
) {
  await page.evaluate(
    async ({ center, zoom }) => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
      map.jumpTo({ center, zoom });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
    },
    { center, zoom },
  );
}

export async function seedThreadWithCaptures(page: Page) {
  return page.evaluate(
    async ({ trailFork, nearbyLedge, farMeadow }) => {
      const store = (window as JournalWindow).__WT_CAPTURE_STORE__;
      if (!store) throw new Error("Capture store hook missing");
      const first = await store.commit(
        "Fresh bobcat tracks at the trail fork",
        trailFork,
        { destination: { type: "new_thread" } },
      );
      if (!first.threadId) throw new Error("New Thread was not created");
      await store.commit("Second set of tracks on the ledge", nearbyLedge, {
        destination: { type: "thread", threadId: first.threadId },
      });
      await store.commit("Meadow full of milkweed", farMeadow, {
        destination: { type: "new_thread" },
      });
      return { captureId: first.id, threadId: first.threadId };
    },
    { trailFork: TRAIL_FORK, nearbyLedge: NEARBY_LEDGE, farMeadow: FAR_MEADOW },
  );
}

export async function refreshJournalMarkers(page: Page) {
  await page.evaluate(() =>
    (window as JournalWindow).__WT_MAP_JOURNAL__!.refreshMarkers(),
  );
}

export async function clickCaptureMarker(
  page: Page,
  latitude: number,
  longitude: number,
) {
  const point = await page.evaluate(
    ({ lat, lng }) => {
      const map = (window as JournalWindow).__WT_REGION_MAP__;
      if (!map) return null;
      const projected = map.project([lng, lat]);
      return { x: projected.x, y: projected.y };
    },
    { lat: latitude, lng: longitude },
  );
  expect(point).not.toBeNull();
  const box = await page.getByTestId("journal-map").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + point!.x, box!.y + point!.y);
}
