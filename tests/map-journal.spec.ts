import { expect, test, type Page } from "@playwright/test";
import type { MapJournalHook } from "@/components/map-journal";
import type { CaptureStore } from "@/lib/local-capture/types";

const JOURNAL_URL = "/journal?region=fixture";

// Inside the fixture region (1.5 km around Cornwall CT).
const TRAIL_FORK = { latitude: 41.8452, longitude: -73.3301, accuracy: 9 };
const NEARBY_LEDGE = { latitude: 41.8449, longitude: -73.3297, accuracy: 12 };
const FAR_MEADOW = { latitude: 41.8391, longitude: -73.3352, accuracy: 8 };

type JournalWindow = Window & {
  __WT_MAP_JOURNAL__?: MapJournalHook;
  __WT_CAPTURE_STORE__?: CaptureStore;
  __WT_REGION_MAP__?: import("maplibre-gl").Map;
};

function journal(page: Page) {
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

async function installFixtureRegion(page: Page) {
  await page.goto(JOURNAL_URL);
  await page
    .getByRole("button", { name: "Download Offline Region" })
    .click();
  await expect(page.getByTestId("journal-map")).toBeVisible({
    timeout: 30_000,
  });
}

async function waitForIdleMap(page: Page) {
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

async function seedThreadWithCaptures(page: Page) {
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

async function clickCaptureMarker(page: Page, latitude: number, longitude: number) {
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

test.describe("Map Journal", () => {
  test("fills the review surface with the Offline Region and clusters media-aware markers", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);

    await seedThreadWithCaptures(page);
    await page.evaluate(() =>
      (window as JournalWindow).__WT_MAP_JOURNAL__!.refreshMarkers(),
    );
    await expect.poll(() => journal(page).then((j) => j?.markerCount)).toBe(3);

    // Zoomed out, the two close Captures cluster; the far one stays single.
    const clusteredCounts = await page.evaluate(async () => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
      map.jumpTo({ center: [-73.3301, 41.8452], zoom: 12 });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      const clusters = map.queryRenderedFeatures({
        layers: ["capture-clusters"],
      });
      const singles = map.queryRenderedFeatures({
        layers: ["capture-marker-points"],
      });
      return {
        clusters: clusters.map(
          (feature) => feature.properties?.point_count as number,
        ),
        singles: singles.length,
      };
    });
    expect(clusteredCounts.clusters).toContain(2);
    expect(clusteredCounts.singles).toBe(1);

    // Zoomed in, the cluster resolves into individual media-aware markers.
    const zoomedIn = await page.evaluate(async () => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
      map.jumpTo({ center: [-73.3299, 41.845], zoom: 16 });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      return map
        .queryRenderedFeatures({ layers: ["capture-marker-points"] })
        .map((feature) => feature.properties?.kind as string);
    });
    expect(zoomedIn.filter((kind) => kind === "text").length).toBe(2);

    // Live GPS is honest when permission is unavailable.
    await expect(page.getByTestId("journal-gps")).toHaveText("GPS unavailable");
  });

  test("shows live GPS while the map is active", async ({ context, page }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: TRAIL_FORK.latitude,
      longitude: TRAIL_FORK.longitude,
      accuracy: 12,
    });

    await installFixtureRegion(page);
    await waitForIdleMap(page);

    await expect(page.getByTestId("journal-gps")).toHaveText(/GPS ±\d+ m/);
    const state = await journal(page);
    expect(state?.gps).toMatchObject({
      status: "tracking",
      latitude: TRAIL_FORK.latitude,
      longitude: TRAIL_FORK.longitude,
    });
  });

  test("opens a Capture preview with complete Thread context and commits an offline follow-up", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);
    const seeded = await seedThreadWithCaptures(page);
    await page.evaluate(() =>
      (window as JournalWindow).__WT_MAP_JOURNAL__!.refreshMarkers(),
    );

    // Airplane mode: review and follow-up remain fully offline.
    await context.setOffline(true);

    await page.evaluate(async () => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
      map.jumpTo({ center: [-73.3301, 41.8452], zoom: 17 });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
    });
    await clickCaptureMarker(
      page,
      TRAIL_FORK.latitude,
      TRAIL_FORK.longitude,
    );

    const panel = page.getByRole("complementary", { name: "Thread context" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", {
        name: "Fresh bobcat tracks at the trail fork",
      }),
    ).toBeVisible();
    await expect(
      panel.getByText("Second set of tracks on the ledge"),
    ).toBeVisible();
    await expect(panel.getByText(/Complete Thread · revision 2/)).toBeVisible();
    await expect(page.getByTestId("journal-connectivity")).toHaveText(
      /Offline — Captures save on this device/,
    );

    const selected = await journal(page);
    expect(selected?.selectedCaptureId).toBe(seeded.captureId);

    // Follow-up goes through the ordinary Capture pipeline, offline.
    await panel
      .getByLabel("Follow-up Capture")
      .fill("Returning tomorrow with the trail camera");
    await panel.getByRole("button", { name: "Capture follow-up" }).click();
    await expect(
      panel.getByText("Returning tomorrow with the trail camera"),
    ).toBeVisible();
    await expect(panel.getByText(/Complete Thread · revision 3/)).toBeVisible();
    const followUpStatus = await page.evaluate(async (threadId) => {
      const store = (window as JournalWindow).__WT_CAPTURE_STORE__!;
      const view = await store.listThread(threadId);
      const last = view.captures[view.captures.length - 1];
      return { status: last.status, sequence: last.sequence };
    }, seeded.threadId);
    expect(followUpStatus).toMatchObject({ status: "saved_locally", sequence: 3 });
  });

  test("renders the Map Journal completely in airplane mode after install", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);
    await seedThreadWithCaptures(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId("journal-map")).toBeVisible({
      timeout: 30_000,
    });
    await waitForIdleMap(page);
    await expect.poll(() => journal(page).then((j) => j?.markerCount)).toBe(3);
    await expect(page.getByTestId("journal-connectivity")).toHaveText(
      /Offline — Captures save on this device/,
    );
  });

  test("desktop shows the Thread context beside the map", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await page.setViewportSize({ width: 1280, height: 820 });
    await installFixtureRegion(page);
    await waitForIdleMap(page);
    await seedThreadWithCaptures(page);
    await page.evaluate(() =>
      (window as JournalWindow).__WT_MAP_JOURNAL__!.refreshMarkers(),
    );

    await page.evaluate(async () => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
      map.jumpTo({ center: [-73.3301, 41.8452], zoom: 17 });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
    });
    await clickCaptureMarker(page, TRAIL_FORK.latitude, TRAIL_FORK.longitude);

    const panel = page.getByRole("complementary", { name: "Thread context" });
    await expect(panel).toBeVisible();

    const [mapBox, panelBox] = await Promise.all([
      page.getByTestId("journal-map").boundingBox(),
      panel.boundingBox(),
    ]);
    // Adjacent panel: to the right of the map, not overlaying it.
    expect(panelBox!.x).toBeGreaterThanOrEqual(mapBox!.x + mapBox!.width - 1);
  });
});
