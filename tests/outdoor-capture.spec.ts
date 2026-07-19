import { expect, test } from "@playwright/test";
import { openCaptureShell } from "./helpers/capture-shell";

test("Outdoor Quick Capture dock records audio on press-and-hold and commits locally", async ({
  page,
}) => {
  await page.addInitScript(() => {
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

  await openCaptureShell(page);
  await expect(page.getByLabel("Capture mode")).toBeVisible();
  await page.getByRole("button", { name: "Audio" }).click();

  const hold = page.getByRole("button", { name: "Hold to record audio" });
  await hold.dispatchEvent("pointerdown");
  await page.waitForTimeout(80);
  await hold.dispatchEvent("pointerup");

  await expect(
    page.getByRole("article").filter({ hasText: /audio-/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Saved locally").first()).toBeVisible();
  const dock = page.getByLabel("New Capture");
  await expect(dock.getByText(/Destination:/)).toBeVisible();
  await expect(dock.getByText(/GPS:/)).toBeVisible();
});
