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
  await page.goto("/offline");
  const disclosure = page.getByTestId("data-handling-disclosure");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Vercel AI Gateway");
  await expect(disclosure).toContainText("does not claim end-to-end encryption");
  await expect(disclosure).toContainText(
    "local commits are never discarded",
  );
  await expect(page.getByText(DATA_HANDLING_BODY)).toBeVisible();
  await expect(page.getByText(OFFLINE_CAPTURE_PROMISE)).toBeVisible();
  await expect(
    page.getByText(/no end-to-end encryption claim/i),
  ).toBeVisible();
});

test("composer distinguishes dependable foreground sync from best-effort background", async ({
  page,
}) => {
  await openCaptureShell(page);
  await expect(page.getByText(FOREGROUND_SYNC_IDLE)).toBeVisible();
});
