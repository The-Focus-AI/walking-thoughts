import { expect, test } from "@playwright/test";
import {
  DEFAULT_PUBLISHED_REGION,
  resolveJournalRegion,
} from "@/lib/map-journal/region";

test("Map Journal defaults to the published fixture Offline Region", () => {
  expect(resolveJournalRegion(null)).toBe(DEFAULT_PUBLISHED_REGION);
  expect(resolveJournalRegion(undefined)).toBe("fixture");
  expect(resolveJournalRegion("")).toBe("fixture");
});

test("explicit home or fixture query values are honored", () => {
  expect(resolveJournalRegion("home")).toBe("home");
  expect(resolveJournalRegion("fixture")).toBe("fixture");
});
