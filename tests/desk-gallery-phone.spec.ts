import { expect, test, type Page } from "@playwright/test";
import { openCaptureShell } from "./helpers/capture-shell";

/**
 * The phone asked for media and got rows that said "1 media" and drew
 * nothing: the queue handed its rows no way to open a photo, so none was
 * ever rendered. Asking to look at something has to answer with the thing.
 */

type SeedStore = {
  commit(
    text: string,
    location: null,
    options: Record<string, unknown>,
  ): Promise<unknown>;
};

async function seedMedia(page: Page): Promise<void> {
  await openCaptureShell(page);
  await page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: SeedStore }
    ).__WT_CAPTURE_STORE__!;
    await store.commit("Morning frog", null, {
      destination: { type: "new_thread" },
      attachments: [
        {
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "frog.jpg",
          bytes: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
        },
      ],
    });
    // A clip is media too — it used to be filtered out of the row entirely.
    await store.commit("Good morning", null, {
      destination: { type: "new_thread" },
      attachments: [
        {
          kind: "audio",
          mimeType: "audio/webm",
          fileName: "audio-1785251362147.webm",
          bytes: new Blob([new Uint8Array([1, 2])], { type: "audio/webm" }),
        },
      ],
    });
    await store.commit("Nothing to look at here", null, {
      destination: { type: "new_thread" },
    });
  });
  await page.route("**/api/sync/threads", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/api/enrichment/threads/**", () => {});
}

test("the Has media chip shows the media, big enough to look at", async ({
  page,
}) => {
  await seedMedia(page);
  await page.goto("/days");

  await page.getByTestId("desk-filter-media").click();
  await expect(page).toHaveURL(/media=any/);

  const galleries = page.getByTestId("thread-row-gallery");
  // Both media Threads draw; the wordy one is filtered out entirely.
  await expect(galleries).toHaveCount(2);

  const photo = page.getByTestId("thread-tile").filter({ hasText: "frog.jpg" });
  await expect(photo).toBeVisible();
  const box = await photo.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(120);
  await expect(photo.locator("img")).toHaveAttribute("src", /^blob:/);

  // The clip gets a tile of its own rather than being dropped from the row.
  await expect(
    page.getByTestId("thread-tile").filter({ hasText: "audio-" }),
  ).toBeVisible();

  // Tapping opens it in place, over the day.
  await photo.click();
  const lightbox = page.getByTestId("media-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox).toContainText("frog.jpg");
  await page.getByTestId("media-lightbox-close").click();
  await expect(lightbox).toHaveCount(0);
});

test("a clip opens as audio rather than as a broken picture", async ({
  page,
}) => {
  await seedMedia(page);
  await page.goto("/days?media=any");

  await page.getByTestId("thread-tile").filter({ hasText: "audio-" }).click();
  const lightbox = page.getByTestId("media-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator("audio")).toHaveCount(1);
  await expect(lightbox.locator("img")).toHaveCount(0);
});
