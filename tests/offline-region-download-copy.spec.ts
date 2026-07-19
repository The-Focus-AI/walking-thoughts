import { expect, test } from "@playwright/test";
import {
  formatRegionMegabytes,
  regionDownloadPercent,
  regionDownloadProgressLabel,
} from "@/lib/offline-region/download-copy";

test("Offline Region download copy shows MB progress for the pack", () => {
  expect(formatRegionMegabytes(48_500_000)).toBe("48.5 MB");
  expect(
    regionDownloadProgressLabel(
      { downloadedBytes: 12_000_000, totalBytes: 48_000_000, currentPath: "basemap.pmtiles" },
      48_000_000,
    ),
  ).toBe("Downloading… 12.0 MB of 48.0 MB");
  expect(regionDownloadPercent(null)).toBe(0);
  expect(
    regionDownloadPercent({
      downloadedBytes: 24_000_000,
      totalBytes: 48_000_000,
      currentPath: "terrain.pmtiles",
    }),
  ).toBe(50);
});
