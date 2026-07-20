import { expect, test } from "@playwright/test";

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

test("Outdoor Quick Capture stages audio for review before Capture", async ({
  page,
}) => {
  await installFakeRecorder(page);
  await page.goto("/offline");
  await expect(page.getByLabel("Capture mode")).toBeVisible();
  await page.getByRole("button", { name: "Audio" }).click();

  const hold = page.getByRole("button", {
    name: /Hold to record audio|Release to stop audio/,
  });
  await hold.dispatchEvent("pointerdown");
  await expect(page.getByTestId("recording-banner")).toBeVisible();
  await page.waitForTimeout(80);
  await hold.dispatchEvent("pointerup");

  await expect(page.getByLabel("Selected media")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Recording ready|review/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Capture" }).click();

  await expect(
    page.getByRole("article").filter({ hasText: /audio-/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Saved locally").first()).toBeVisible();
  await expect(page.getByText(/Network offline|Network online/)).toBeVisible();
});

test("video record stages a preview draft instead of auto-committing", async ({
  page,
}) => {
  await installFakeRecorder(page);
  await page.goto("/offline");
  await expect(page.getByLabel("Capture mode")).toBeVisible();
  await page.getByRole("button", { name: "Video", exact: true }).click();

  const record = page.getByRole("button", {
    name: /Start video recording|Stop video recording/,
  });
  await expect(record).toBeVisible();
  await record.click();
  await expect(page.getByTestId("recording-banner")).toBeVisible();
  await record.click();

  const drafts = page.getByLabel("Selected media");
  await expect(drafts).toBeVisible({ timeout: 10_000 });
  await expect(drafts.locator("video.media-preview")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add photo or video" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: /video-/i }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Capture" }).click();
  await expect(
    page.getByRole("article").filter({ hasText: /video-/i }),
  ).toBeVisible({ timeout: 10_000 });
});
