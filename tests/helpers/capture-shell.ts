import { expect, type Page } from "@playwright/test";

export async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible();
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
