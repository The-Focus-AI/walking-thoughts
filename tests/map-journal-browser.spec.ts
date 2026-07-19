import { expect, test, type Page } from "@playwright/test";

async function waitForMapReady(page: Page) {
  await page.goto("/offline");
  await expect(page.getByRole("region", { name: "Map Journal" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("map-journal-map")).toBeVisible();
  await expect(page.getByText("Offline Region topography ready")).toBeVisible({
    timeout: 45_000,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: unknown })
            .__WT_CAPTURE_STORE__,
        ),
      ),
    )
    .toBe(true);
}

async function seedLocatedCaptures(page: Page) {
  await page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          commit(
            text: string,
            location: {
              latitude: number;
              longitude: number;
              accuracy: number;
            } | null,
            options?: {
              attachments?: Array<{
                kind: "image";
                mimeType: string;
                fileName: string;
                bytes: Uint8Array;
              }>;
              destination?: { type: "new_thread" };
            },
          ): Promise<{ id: string }>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    if (!store) throw new Error("Capture store missing");

    await store.commit(
      "Ridge owl",
      { latitude: 41.844, longitude: -73.329, accuracy: 12 },
      { destination: { type: "new_thread" } },
    );
    await store.commit(
      "Creek photo",
      { latitude: 41.84415, longitude: -73.3291, accuracy: 9 },
      {
        destination: { type: "new_thread" },
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
    await store.commit("Far meadow", {
      latitude: 41.85,
      longitude: -73.32,
      accuracy: 20,
    });
  });
}

test("Map Journal is the primary review surface with Offline Region topography", async ({
  page,
}) => {
  await waitForMapReady(page);

  // Library stays closed — Inbox is not the primary review metaphor.
  await expect(page.getByRole("heading", { name: "Inbox" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show Inbox & Threads" }),
  ).toBeVisible();

  await expect(
    page.getByText(
      /Offline: Capture and map review|Online: Enrichment and sync/,
    ),
  ).toBeVisible();
});

test("GPS, clustering, Capture preview, Thread panel, and follow-up", async ({
  context,
  page,
}, testInfo) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 41.8445,
    longitude: -73.3295,
    accuracy: 18,
  });

  await waitForMapReady(page);
  await seedLocatedCaptures(page);

  await expect(page.getByText(/2 located Captures|3 located Captures/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/GPS active/)).toBeVisible({ timeout: 15_000 });

  // Default zoom clusters the two nearby Captures.
  await expect(page.getByTestId("map-journal-cluster").first()).toBeVisible({
    timeout: 10_000,
  });

  // Zoom in via the live map so clusters expand into individual markers.
  await page.evaluate(async () => {
    const map = (
      window as Window & { __WT_REGION_MAP__?: { setZoom(z: number): void; once(event: string, cb: () => void): void } }
    ).__WT_REGION_MAP__;
    if (!map) throw new Error("region map missing");
    map.setZoom(16);
    await new Promise<void>((resolve) => map.once("idle", () => resolve()));
  });

  const marker = page.getByTestId("map-journal-marker").first();
  await expect(marker).toBeVisible({ timeout: 10_000 });
  await marker.click();

  const review = page.getByTestId("map-journal-thread-review");
  await expect(review).toBeVisible();
  await expect(review.getByText("Selected Capture")).toBeVisible();
  await expect(
    review.getByRole("heading", { name: /Ridge owl|Creek photo|Far meadow/ }),
  ).toBeVisible();

  const expectedLayout =
    testInfo.project.name === "desktop" ? "panel" : "sheet";
  await expect(review).toHaveAttribute("data-layout", expectedLayout);

  await review.getByLabel("Follow-up Capture").fill("Heard it again at dusk");
  await review.getByRole("button", { name: "Capture" }).click();
  await expect(review.getByText("Heard it again at dusk")).toBeVisible({
    timeout: 10_000,
  });

  await context.setOffline(true);
  await expect(
    page.getByText(/Offline: Capture and map review stay on-device/),
  ).toBeVisible();
});
