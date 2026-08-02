import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * Asking the desk for photos is asking to look at them. Under a Media facet
 * or the Media Lens the rows become a contact sheet, and the tiles draw the
 * picture rather than the placeholder the store retains beside it.
 */

test("a Media facet turns the rows into a gallery of real pictures", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days?media=photos");

  const gallery = page.getByTestId("thread-row-gallery");
  await expect(gallery).toBeVisible();

  const tile = gallery.getByTestId("thread-tile").first();
  // Big enough to look at — the complaint was a 44px stamp.
  const box = await tile.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(120);
  await expect(tile).toContainText("grate.jpg");

  // The tile draws the Capture's own bytes: the retained "thumbnail" is a
  // placeholder, so the picture has to come from the original.
  await expect(tile.locator("img")).toHaveAttribute("src", /^blob:/);

  // And it still opens in place over the day.
  await tile.click();
  const lightbox = page.getByTestId("media-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox).toContainText("grate.jpg");
});

test("the Media Lens stacks into a gallery; an ordinary row keeps its quiet thumbs", async ({
  page,
}) => {
  await seedPile(page);

  await page.goto("/days?lens=media");
  await expect(page.getByTestId("thread-row-gallery")).toBeVisible();

  // Nothing asked about media: the row is a row again, with its small stamps.
  await page.goto("/days?state=open");
  await expect(page.getByTestId("thread-row-gallery")).toHaveCount(0);
  await expect(page.getByTestId("thread-thumb").first()).toBeVisible();
});
