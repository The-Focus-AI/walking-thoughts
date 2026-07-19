import { expect, test, type Page } from "@playwright/test";

const TRACER_URL = "/region-tracer?region=fixture";

type TracerHook = {
  state: string;
  metrics: {
    packBytes: number | null;
    downloadedBytes: number | null;
    installedBytes: number | null;
    firstRenderMs: number | null;
    storage: { persisted: boolean } | null;
  };
  styleLayerIds: () => string[];
  attribution: () => string;
  canvasPainted: () => boolean;
};

function hook(page: Page) {
  return page.evaluate(() => {
    const tracer = (window as Window & { __WT_REGION_TRACER__?: TracerHook })
      .__WT_REGION_TRACER__;
    if (!tracer) return null;
    return {
      state: tracer.state,
      metrics: tracer.metrics,
      layers: tracer.styleLayerIds(),
      attribution: tracer.attribution(),
      painted: tracer.canvasPainted(),
    };
  });
}

async function installFixtureRegion(page: Page) {
  await page.goto(TRACER_URL);
  await expect(page.getByTestId("pack-size")).toBeVisible();
  await page.getByRole("button", { name: "Download Offline Region" }).click();
  await expect(page.getByTestId("region-ready")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("render-ms")).not.toHaveText("measuring…", {
    timeout: 30_000,
  });
}

test.describe("Offline Region tracer", () => {
  test("shows the calculated pack size before anything downloads", async ({
    page,
  }) => {
    await page.goto(TRACER_URL);

    await expect(page.getByTestId("pack-size")).toBeVisible();
    const state = await hook(page);
    expect(state?.state).toBe("available");
    expect(state?.metrics.packBytes).toBeGreaterThan(0);
    // Nothing was downloaded just by looking at the offer.
    expect(state?.metrics.downloadedBytes).toBeNull();
  });

  test("downloads, verifies, and renders a sharp trail-first map through the detailed zoom range", async ({
    page,
  }) => {
    await installFixtureRegion(page);

    const state = await hook(page);
    expect(state?.state).toBe("installed");
    expect(state?.metrics.downloadedBytes).toBe(state?.metrics.packBytes);
    expect(state?.metrics.firstRenderMs).toBeGreaterThan(0);
    expect(state?.metrics.storage).not.toBeNull();
    expect(state?.painted).toBe(true);

    // Trail-first layer contract: walkable paths draw above every road
    // layer, over hillshade and contours from USGS elevation.
    const layers = state?.layers ?? [];
    expect(layers).toContain("trails");
    expect(layers).toContain("trails_casing");
    expect(layers).toContain("hillshade");
    expect(layers).toContain("contours_index");
    expect(layers).toContain("contours_labels");
    const lastRoadLine = Math.max(
      ...layers
        .map((id, index) =>
          id.startsWith("roads_") && !id.startsWith("roads_labels") ? index : -1,
        )
        .filter((index) => index >= 0),
    );
    expect(layers.indexOf("trails")).toBeGreaterThan(lastRoadLine);

    expect(state?.attribution).toContain("OpenStreetMap");
    expect(state?.attribution).toContain("USGS");

    // The map stays sharp while zooming into the detailed range.
    for (const zoom of [14, 16]) {
      const painted = await page.evaluate(async (z) => {
        const tracer = (
          window as Window & { __WT_REGION_TRACER__?: TracerHook }
        ).__WT_REGION_TRACER__;
        const maplibre = (
          window as Window & { __WT_REGION_MAP__?: import("maplibre-gl").Map }
        ).__WT_REGION_MAP__;
        if (!tracer || !maplibre) return false;
        maplibre.setZoom(z);
        await new Promise<void>((resolve) =>
          maplibre.once("idle", () => resolve()),
        );
        return tracer.canvasPainted();
      }, zoom);
      expect(painted).toBe(true);
    }
  });

  test("renders the installed Offline Region completely in airplane mode", async ({
    context,
    page,
  }) => {
    await installFixtureRegion(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId("region-ready")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("render-ms")).not.toHaveText("measuring…", {
      timeout: 30_000,
    });
    const state = await hook(page);
    expect(state?.state).toBe("installed");
    expect(state?.painted).toBe(true);
    expect(state?.metrics.firstRenderMs).toBeGreaterThan(0);
  });

  test("rejects a corrupted artifact visibly and installs nothing", async ({
    page,
  }) => {
    await page.route("**/offline-region/fixture/contours.pmtiles", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from("not a pmtiles archive"),
      }),
    );

    await page.goto(TRACER_URL);
    await page.getByRole("button", { name: "Download Offline Region" }).click();

    await expect(
      page.getByText("Offline Region could not be verified."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    // The failed download never becomes an installed region.
    await page.unroute("**/offline-region/fixture/contours.pmtiles");
    await page.reload();
    await expect(page.getByTestId("pack-size")).toBeVisible();
    const state = await hook(page);
    expect(state?.state).toBe("available");
  });
});
