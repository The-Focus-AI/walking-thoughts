import { expect, test } from "@playwright/test";
import {
  clickCaptureMarker,
  installFixtureRegion,
  journal,
  jumpToIdle,
  refreshJournalMarkers,
  seedThreadWithCaptures,
  TRAIL_FORK,
  waitForIdleMap,
  type JournalWindow,
} from "./map-journal-helpers";

test.describe("Map Journal", () => {
  test("fills the review surface with the Offline Region and clusters media-aware markers", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);

    await seedThreadWithCaptures(page);
    await refreshJournalMarkers(page);
    await expect.poll(() => journal(page).then((j) => j?.markerCount)).toBe(3);

    // Zoomed out, the two close Captures cluster; the far one stays single.
    await jumpToIdle(page, [-73.3301, 41.8452], 12);
    const clusteredCounts = await page.evaluate(() => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
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
    await jumpToIdle(page, [-73.3299, 41.845], 16);
    const zoomedIn = await page.evaluate(() => {
      const map = (window as JournalWindow).__WT_REGION_MAP__!;
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
    await refreshJournalMarkers(page);

    // Airplane mode: review and follow-up remain fully offline.
    await context.setOffline(true);

    await jumpToIdle(page, [-73.3301, 41.8452], 17);
    await clickCaptureMarker(page, TRAIL_FORK.latitude, TRAIL_FORK.longitude);

    const panel = page.getByRole("complementary", { name: "Thread context" });
    await expect(panel).toBeVisible();

    // Mobile shows the Thread context as a bottom sheet over the map.
    const [mapBox, panelBox] = await Promise.all([
      page.getByTestId("journal-map").boundingBox(),
      panel.boundingBox(),
    ]);
    expect(panelBox!.y).toBeGreaterThan(mapBox!.y);
    expect(panelBox!.y).toBeLessThan(mapBox!.y + mapBox!.height);

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
    expect(followUpStatus).toMatchObject({
      status: "saved_locally",
      sequence: 3,
    });
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
});
