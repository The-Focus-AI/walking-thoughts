import { expect, test } from "@playwright/test";
import {
  DEFAULT_PUBLISHED_REGION,
  PREFERRED_HOME_REGION,
  homeRegionBaseUrl,
  resolveJournalRegion,
  resolveRegionBaseUrl,
} from "@/lib/map-journal/region";

const HOME_BLOB =
  "https://dfshk3veycwqp13u.public.blob.vercel-storage.com/offline-region/home";

test("Map Journal defaults to fixture when no home Blob base is configured", () => {
  expect(resolveJournalRegion(null, { homeBaseUrl: null })).toBe(
    DEFAULT_PUBLISHED_REGION,
  );
  expect(resolveJournalRegion(undefined, { homeBaseUrl: null })).toBe(
    "fixture",
  );
  expect(resolveJournalRegion("", { homeBaseUrl: null })).toBe("fixture");
});

test("Map Journal defaults to home when the Blob-hosted pack base is set", () => {
  expect(resolveJournalRegion(null, { homeBaseUrl: HOME_BLOB })).toBe(
    PREFERRED_HOME_REGION,
  );
  expect(resolveJournalRegion("", { homeBaseUrl: HOME_BLOB })).toBe("home");
});

test("explicit home or fixture query values are honored", () => {
  expect(resolveJournalRegion("home", { homeBaseUrl: null })).toBe("home");
  expect(resolveJournalRegion("fixture", { homeBaseUrl: HOME_BLOB })).toBe(
    "fixture",
  );
});

test("home region uses the Blob base URL when configured", () => {
  expect(resolveRegionBaseUrl("home", { homeBaseUrl: HOME_BLOB })).toBe(
    HOME_BLOB,
  );
  expect(resolveRegionBaseUrl("fixture", { homeBaseUrl: HOME_BLOB })).toBe(
    "/offline-region/fixture",
  );
  expect(resolveRegionBaseUrl("home", { homeBaseUrl: null })).toBe(
    "/offline-region/home",
  );
});

test("homeRegionBaseUrl trims trailing slashes", () => {
  expect(
    homeRegionBaseUrl({
      NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE: `${HOME_BLOB}/`,
    }),
  ).toBe(HOME_BLOB);
  expect(homeRegionBaseUrl({ NEXT_PUBLIC_OFFLINE_REGION_HOME_BASE: "  " })).toBe(
    null,
  );
});
