import { expect, test } from "@playwright/test";
import {
  DATA_HANDLING_BODY,
  FOREGROUND_SYNC_IDLE,
  OFFLINE_CAPTURE_PROMISE,
} from "@/lib/disclosures/copy";
import { openCaptureShell } from "./helpers/capture-shell";

test("shell discloses gateway processing and refuses an E2E encryption claim", async ({
  page,
}) => {
  // Account and data handling live on You; the trail screen is Capture only.
  await page.goto("/interview");
  await page.getByText("Account & data handling").click();
  const disclosure = page.getByTestId("data-handling-disclosure");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Vercel AI Gateway");
  await expect(disclosure).toContainText("does not claim end-to-end encryption");
  await expect(disclosure).toContainText(
    "local commits are never discarded",
  );
  await expect(page.getByText(DATA_HANDLING_BODY)).toBeVisible();
  await expect(page.getByText(OFFLINE_CAPTURE_PROMISE)).toBeVisible();
  await expect(disclosure).toContainText(FOREGROUND_SYNC_IDLE);
  await expect(
    page.getByText(/no end-to-end encryption claim/i),
  ).toBeVisible();
});

test("the trail footer states the sync promise and the day's standing", async ({
  page,
}) => {
  await openCaptureShell(page);
  const footer = page.getByTestId("trail-sync-footer");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(
    "Committed locally first · Synced when in range",
  );
  await expect(footer.getByTestId("capture-tally")).toHaveText(
    "No Captures today",
  );
  await expect(footer.getByTestId("desk-link")).toBeVisible();
});
