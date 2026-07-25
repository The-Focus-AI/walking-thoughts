import { expect, test } from "@playwright/test";
import { newestThreadId, openCaptureShell } from "./helpers/capture-shell";

/**
 * Freeing the phone of an original is a desk decision, so the control lives
 * on the Thread — never on the trail surface, which is Capture only. It may
 * only be offered once the private server copy verifies, and the Thread has
 * to stay readable after the bytes leave the phone.
 */
test("remove-from-device appears only after verified sync and keeps the Thread readable", async ({
  page,
}) => {
  // Stand-in server: bytes live in localStorage so the "uploaded" copy
  // survives the walk from the trail surface to the Thread, and uploads
  // fail while `wt-test-out-of-range` is set.
  await page.addInitScript(() => {
    const key = (attachmentId: string) => `wt-test-media:${attachmentId}`;
    (
      globalThis as typeof globalThis & {
        __WT_MEDIA_TRANSPORT__?: {
          upload(input: {
            attachmentId: string;
            mimeType: string;
            bytes: Blob;
          }): Promise<{ attachmentId: string; duplicate: boolean }>;
          verify(attachmentId: string): Promise<boolean>;
          download(attachmentId: string): Promise<Blob>;
        };
      }
    ).__WT_MEDIA_TRANSPORT__ = {
      async upload({ attachmentId, bytes }) {
        if (localStorage.getItem("wt-test-out-of-range")) {
          throw new Error("out of range");
        }
        const raw = new Uint8Array(await bytes.arrayBuffer());
        localStorage.setItem(key(attachmentId), JSON.stringify([...raw]));
        return { attachmentId, duplicate: false };
      },
      async verify(attachmentId) {
        return localStorage.getItem(key(attachmentId)) !== null;
      },
      async download(attachmentId) {
        const raw = localStorage.getItem(key(attachmentId));
        if (!raw) throw new Error("missing");
        return new Blob([Uint8Array.from(JSON.parse(raw) as number[])], {
          type: "image/jpeg",
        });
      },
    };
    localStorage.setItem("wt-test-out-of-range", "1");
  });

  await openCaptureShell(page);

  await page.getByLabel("Choose photo or video from device").setInputFiles({
    name: "ridge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByLabel("Capture text").fill("Ridge wind after rain");
  await page.getByRole("button", { name: "Capture" }).click();

  const threadId = await newestThreadId(page);
  await page.goto(`/threads/${threadId}`);
  const hero = page.getByTestId("thread-capture-hero");
  await expect(hero).toBeVisible();

  // Nothing reached the server, so the original is the only copy and the
  // desk must not offer to delete it.
  await expect(hero.getByText("On device")).toBeVisible();
  await expect(
    hero.getByRole("button", { name: "Remove from device" }),
  ).toHaveCount(0);

  // Back in range: the media uploads and the offer appears. Each poll nudges
  // another sync cycle rather than waiting on the 12s shell drain.
  await page.evaluate(() => localStorage.removeItem("wt-test-out-of-range"));
  await expect
    .poll(
      async () => {
        await page.evaluate(() =>
          window.dispatchEvent(new Event("online")),
        );
        return hero.getByRole("button", { name: "Remove from device" }).count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);

  await hero.getByRole("button", { name: "Remove from device" }).click();
  await expect(hero.getByText("Online only")).toBeVisible();

  // The Thread still says what it was about, and which file it holds.
  await expect(hero.getByText("ridge.jpg")).toBeVisible();
  await expect(
    hero.getByText("Ridge wind after rain", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Ridge wind after rain",
  );
  await expect(page.getByText("Online only")).toBeVisible();
  await expect(page.getByText("ridge.jpg").first()).toBeVisible();
});
