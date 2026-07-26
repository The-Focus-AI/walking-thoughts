import { expect, test } from "@playwright/test";
import { captureCount } from "./helpers/capture-shell";

function installFakeRecorder(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    class FakeMediaRecorder {
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      constructor(
        private readonly stream: { getTracks(): Array<{ stop(): void }> },
        public readonly options?: { mimeType?: string },
      ) {}
      start() {
        this.state = "recording";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([4, 5, 6])], {
            type: this.options?.mimeType || "audio/webm",
          }),
        });
      }
      stop() {
        this.state = "inactive";
        for (const track of this.stream.getTracks()) track.stop();
        this.onstop?.();
      }
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          return {
            getTracks() {
              return [{ stop() {} }];
            },
          };
        },
      },
    });
    (
      window as unknown as { MediaRecorder: typeof FakeMediaRecorder }
    ).MediaRecorder = FakeMediaRecorder;
  });
}

test("compact capture dock records audio via tap-to-toggle and stages for review", async ({
  page,
}) => {
  await installFakeRecorder(page);
  await page.goto("/offline");
  await expect(page.getByLabel("Capture actions")).toBeVisible();

  await page.getByRole("button", { name: "Record audio" }).click();
  await expect(page.getByTestId("recording-banner")).toBeVisible();
  await page.waitForTimeout(80);
  await page.getByRole("button", { name: "Stop recording" }).click();

  await expect(page.getByLabel("Selected media")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Recording ready|review/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Capture" }).click();

  await expect.poll(() => captureCount(page)).toBe(1);
  await expect(page.getByTestId("capture-tally")).toContainText(
    "1 Capture today",
  );
  await expect(page.getByLabel("Selected media")).toHaveCount(0);
  await expect(page.getByText(/Network offline|Network online/)).toBeVisible();
});

test("holding the mic records and Captures the audio on release", async ({
  page,
}) => {
  await installFakeRecorder(page);
  // The hold threshold is wall-clock inside the page, so a loaded machine
  // could stretch a "short" hold past it. Drive the page's clock instead of
  // sleeping: the hold is exactly as long as the test says it is.
  await page.clock.install({ time: new Date() });
  await page.goto("/offline");
  await expect(page.getByLabel("Capture actions")).toBeVisible();

  const mic = page.getByRole("button", { name: "Record audio" });
  await mic.hover();
  await page.mouse.down();
  await expect(page.getByTestId("recording-banner")).toContainText(
    "release to Capture",
  );
  // Long enough to count as a held thought rather than a slipped thumb.
  await page.clock.fastForward(1500);
  await page.mouse.up();

  // No second press: releasing the button is the Capture.
  await expect.poll(() => captureCount(page)).toBe(1);
  await expect(page.getByTestId("capture-tally")).toContainText(
    "1 Capture today",
  );
  await expect(page.getByLabel("Selected media")).toHaveCount(0);
  await expect(page.getByTestId("recording-banner")).toHaveCount(0);
});

test("a slipped thumb on the mic Captures nothing", async ({ page }) => {
  await installFakeRecorder(page);
  await page.clock.install({ time: new Date() });
  await page.goto("/offline");
  await expect(page.getByLabel("Capture actions")).toBeVisible();

  await page.getByRole("button", { name: "Record audio" }).hover();
  await page.mouse.down();
  // Past the tap threshold, well short of a thought.
  await page.clock.fastForward(300);
  await page.mouse.up();

  await expect(
    page.getByText("Too short — hold the mic while you talk"),
  ).toBeVisible();
  await expect.poll(() => captureCount(page)).toBe(0);
  await expect(page.getByLabel("Selected media")).toHaveCount(0);
});

test("video record stages a preview draft instead of auto-committing", async ({
  page,
}) => {
  await installFakeRecorder(page);
  await page.goto("/offline");
  await expect(page.getByLabel("Capture actions")).toBeVisible();

  await page.getByRole("button", { name: "Record video" }).click();
  await expect(page.getByTestId("recording-banner")).toBeVisible();
  await page.getByRole("button", { name: "Stop recording" }).click();

  const drafts = page.getByLabel("Selected media");
  await expect(drafts).toBeVisible({ timeout: 10_000 });
  await expect(drafts.locator("video.media-preview")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add photo or video" }),
  ).toBeVisible();
  await expect.poll(() => captureCount(page)).toBe(0);

  await page.getByRole("button", { name: "Capture" }).click();
  await expect.poll(() => captureCount(page)).toBe(1);
  await expect(page.getByTestId("capture-tally")).toContainText(
    "1 Capture today",
  );
});

test("capture dock fits narrow phones without horizontal scrolling", async ({
  page,
}) => {
  // Narrower than the Pixel default — the width class that used to make
  // the action toolbar pin the page wider than the viewport.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/offline");
  await expect(page.getByLabel("Capture actions")).toBeVisible();

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBe(0);

  // The wrapped toolbar keeps every control usable.
  await expect(page.getByRole("button", { name: "Capture" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record audio" })).toBeVisible();
});
