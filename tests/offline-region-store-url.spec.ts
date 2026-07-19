import { expect, test } from "@playwright/test";
import { regionArtifactUrl } from "@/lib/offline-region/store";

test("region artifact URLs encode path segments with spaces", () => {
  expect(
    regionArtifactUrl(
      "https://example.public.blob.vercel-storage.com/offline-region/home",
      "fonts/Noto Sans Regular/0-255.pbf",
    ),
  ).toBe(
    "https://example.public.blob.vercel-storage.com/offline-region/home/fonts/Noto%20Sans%20Regular/0-255.pbf",
  );
});

test("region artifact URLs preserve ordinary relative pack paths", () => {
  expect(regionArtifactUrl("/offline-region/fixture", "basemap.pmtiles")).toBe(
    "/offline-region/fixture/basemap.pmtiles",
  );
});
