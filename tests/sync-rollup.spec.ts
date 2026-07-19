import { expect, test } from "@playwright/test";
import {
  pendingSyncCount,
  syncFooterSummary,
  syncRollup,
} from "@/lib/sync/rollup";

test("syncRollup counts each Capture status for the glance footer", () => {
  const rollup = syncRollup([
    "complete",
    "enriching",
    "syncing",
    "saved_locally",
    "needs_attention",
    "complete",
  ]);

  expect(rollup).toEqual({
    saved_locally: 1,
    syncing: 1,
    enriching: 1,
    complete: 2,
    needs_attention: 1,
  });
  expect(pendingSyncCount(rollup)).toBe(4);
  expect(syncFooterSummary(rollup)).toBe("Working on 4 of 6");
  expect(syncFooterSummary(rollup, { running: true })).toBe(
    "Foreground sync running…",
  );
  expect(syncFooterSummary(syncRollup(["complete", "complete"]))).toBe(
    "All caught up",
  );
  expect(syncFooterSummary(syncRollup([]))).toBe("No Captures yet");
});
