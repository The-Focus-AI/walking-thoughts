import { expect, test } from "@playwright/test";
import {
  clickCaptureMarker,
  FAR_MEADOW,
  installFixtureRegion,
  journal,
  jumpToIdle,
  refreshJournalMarkers,
  TRAIL_FORK,
  waitForIdleMap,
  type JournalWindow,
} from "./map-journal-helpers";

// Two mornings at the cow gate, ~10 m apart — one spot. The pond photo is
// routed to the Journal and must stay off the Timeline.
const GATE_DAY_ONE = TRAIL_FORK;
const GATE_DAY_TWO = {
  latitude: TRAIL_FORK.latitude + 0.00008,
  longitude: TRAIL_FORK.longitude + 0.00005,
  accuracy: 9,
};
const GATE_CENTER = {
  latitude: (GATE_DAY_ONE.latitude + GATE_DAY_TWO.latitude) / 2,
  longitude: (GATE_DAY_ONE.longitude + GATE_DAY_TWO.longitude) / 2,
};

async function seedTimelineSpot(page: import("@playwright/test").Page) {
  return page.evaluate(
    async ({ dayOne, dayTwo, meadow }) => {
      const store = (window as JournalWindow).__WT_CAPTURE_STORE__!;
      const photo = (name: string) => ({
        kind: "image" as const,
        mimeType: "image/jpeg",
        fileName: name,
        bytes: new TextEncoder().encode(`photo:${name}`),
      });
      const commitPhoto = async (
        text: string,
        location: typeof dayOne,
        fileName: string,
      ) => {
        const capture = await store.commit(text, location, {
          destination: { type: "new_thread" },
          attachments: [photo(fileName)],
        });
        if (!capture.threadId) throw new Error("New Thread was not created");
        return { captureId: capture.id, threadId: capture.threadId };
      };

      const first = await commitPhoto(
        "Morning cow at the gate",
        dayOne,
        "cow-1.jpg",
      );
      const second = await commitPhoto("Cow again", dayTwo, "cow-2.jpg");
      const pond = await commitPhoto("Meadow pond", meadow, "pond.jpg");

      // Settle the Routes the way the desk does: cows to the Timeline, the
      // pond to the Journal (docs/desk.md — Route rides the filing seam).
      const reviewedAt = new Date().toISOString();
      for (const { threadId } of [first, second]) {
        await store.applyThreadFiling({
          threadId,
          reviewedAt,
          route: "timeline",
        });
      }
      await store.applyThreadFiling({
        threadId: pond.threadId,
        reviewedAt,
        route: "journal",
      });
      return { first, second, pond };
    },
    { dayOne: GATE_DAY_ONE, dayTwo: GATE_DAY_TWO, meadow: FAR_MEADOW },
  );
}

test.describe("Timeline destination on the Map Journal", () => {
  test("Timeline-routed photo Threads cluster into one spot strip; removing a frame leaves the Thread alone", async ({
    context,
    page,
  }) => {
    await context.grantPermissions([]);
    await installFixtureRegion(page);
    await waitForIdleMap(page);

    const seeded = await seedTimelineSpot(page);
    await refreshJournalMarkers(page);

    // Both cow gate frames cluster into a single spot with no manual setup;
    // the Journal-routed pond photo adds a Capture marker but no spot.
    await expect
      .poll(() => journal(page).then((hook) => hook?.timelineSpotCount))
      .toBe(1);
    await expect
      .poll(() => journal(page).then((hook) => hook?.markerCount))
      .toBe(3);

    // The strip is reachable from the map at the spot's location.
    await jumpToIdle(page, [GATE_CENTER.longitude, GATE_CENTER.latitude], 17);
    await clickCaptureMarker(
      page,
      GATE_CENTER.latitude,
      GATE_CENTER.longitude,
    );

    const strip = page.getByTestId("timeline-strip");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("timeline-strip-title")).toHaveText(
      "Morning cow at the gate, day 1",
    );
    const frames = strip.getByRole("listitem");
    await expect(frames).toHaveCount(2);
    // Day order with a per-frame distance from the spot's center.
    await expect(frames.first()).toContainText("Today");
    await expect(
      page.getByTestId(
        `timeline-frame-distance-${seeded.first.captureId}`,
      ),
    ).toHaveText(/^\d+ m$/);

    // Removing a frame takes it off the strip…
    await page
      .getByTestId(`timeline-frame-remove-${seeded.second.captureId}`)
      .click();
    await expect(frames).toHaveCount(1);
    await expect(
      page.getByTestId(`timeline-frame-${seeded.first.captureId}`),
    ).toBeVisible();

    // …without touching the Thread: its Capture and photo are still there.
    const untouched = await page.evaluate(async (threadId) => {
      const store = (window as JournalWindow).__WT_CAPTURE_STORE__!;
      const view = await store.listThread(threadId);
      return {
        route: view.thread.route,
        captureCount: view.captures.length,
        attachmentCount: view.captures[0]?.attachments.length ?? 0,
      };
    }, seeded.second.threadId);
    expect(untouched).toEqual({
      route: "timeline",
      captureCount: 1,
      attachmentCount: 1,
    });

    // The removal survives a reload; the remaining frame keeps the spot.
    await page.reload();
    await expect(page.getByTestId("journal-map")).toBeVisible({
      timeout: 30_000,
    });
    await waitForIdleMap(page);
    await expect
      .poll(() => journal(page).then((hook) => hook?.timelineSpotCount))
      .toBe(1);
    await jumpToIdle(page, [GATE_CENTER.longitude, GATE_CENTER.latitude], 17);
    await clickCaptureMarker(
      page,
      GATE_DAY_ONE.latitude,
      GATE_DAY_ONE.longitude,
    );
    await expect(page.getByTestId("timeline-strip")).toBeVisible();
    await expect(
      page.getByTestId("timeline-strip").getByRole("listitem"),
    ).toHaveCount(1);

    // Removing the last frame retires the spot from the map.
    await page
      .getByTestId(`timeline-frame-remove-${seeded.first.captureId}`)
      .click();
    await expect(page.getByTestId("timeline-strip")).toBeHidden();
    await expect
      .poll(() => journal(page).then((hook) => hook?.timelineSpotCount))
      .toBe(0);
    // The Captures themselves never left the journal.
    await expect
      .poll(() => journal(page).then((hook) => hook?.markerCount))
      .toBe(3);
  });
});
