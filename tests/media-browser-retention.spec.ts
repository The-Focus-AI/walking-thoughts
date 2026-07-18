import { expect, test, type Page } from "@playwright/test";

async function openShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible();
}

test("remove-from-device appears only after verified sync and keeps Thread context offline", async ({
  page,
}) => {
  await openShell(page);

  await page.evaluate(() => {
    const blobs = new Map<string, Uint8Array>();
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
        blobs.set(attachmentId, new Uint8Array(await bytes.arrayBuffer()));
        return { attachmentId, duplicate: false };
      },
      async verify(attachmentId) {
        return blobs.has(attachmentId);
      },
      async download(attachmentId) {
        const bytes = blobs.get(attachmentId);
        if (!bytes) throw new Error("missing");
        return new Blob([Uint8Array.from(bytes)], { type: "image/jpeg" });
      },
    };
  });

  await page.context().setOffline(true);
  await page.getByLabel("Choose existing media").setInputFiles({
    name: "ridge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByLabel("Capture text").fill("Ridge wind after rain");
  await page.getByRole("button", { name: "Capture" }).click();

  const article = page.getByRole("article", { name: /Ridge wind after rain/ });
  await expect(article).toBeVisible();
  await expect(article.getByText("On device")).toBeVisible();
  await expect(article.getByText("Saved locally").first()).toBeVisible();
  await expect(
    article.getByRole("button", { name: "Remove from device" }),
  ).toHaveCount(0);

  await page.context().setOffline(false);
  await expect
    .poll(async () =>
      article.getByRole("button", { name: "Remove from device" }).count(),
    )
    .toBe(1);

  await article.getByRole("button", { name: "Remove from device" }).click();
  await expect(article.getByText("Online only")).toBeVisible();
  await expect(article.getByText("ridge.jpg")).toBeVisible();
  await expect(article.getByText("Ridge wind after rain")).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("article", { name: /Ridge wind after rain/ }),
  ).toBeVisible();
  await expect(page.getByText("Online only")).toBeVisible();
  await expect(page.getByText("ridge.jpg")).toBeVisible();
});
