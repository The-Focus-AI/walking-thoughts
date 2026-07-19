import { expect, test } from "@playwright/test";
import {
  clickCaptureMarker,
  installFixtureRegion,
  jumpToIdle,
  refreshJournalMarkers,
  seedThreadWithCaptures,
  TRAIL_FORK,
  waitForIdleMap,
} from "./map-journal-helpers";

test.describe("Map Journal on desktop", () => {
  test("shows the Thread context in a panel adjacent to the map", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);
    await seedThreadWithCaptures(page);
    await refreshJournalMarkers(page);

    await jumpToIdle(page, [-73.3301, 41.8452], 17);
    await clickCaptureMarker(page, TRAIL_FORK.latitude, TRAIL_FORK.longitude);

    const panel = page.getByRole("complementary", { name: "Thread context" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", {
        name: "Fresh bobcat tracks at the trail fork",
      }),
    ).toBeVisible();

    const [mapBox, panelBox] = await Promise.all([
      page.getByTestId("journal-map").boundingBox(),
      panel.boundingBox(),
    ]);
    // Adjacent panel: to the right of the map, not overlaying it.
    expect(panelBox!.x).toBeGreaterThanOrEqual(mapBox!.x + mapBox!.width - 1);
  });
});
