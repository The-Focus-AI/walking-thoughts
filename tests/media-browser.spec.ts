import { expect, test } from "@playwright/test";

test("offline mixed-media Capture keeps attachments readable after restart", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Shell ready")).toBeVisible();

  await page.getByLabel("Choose photo or video from device").setInputFiles({
    name: "fungus.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByLabel("Selected media")).toContainText("fungus.jpg");

  await page.getByLabel("Capture text").fill("Fungus on the nurse log");
  await page.getByRole("button", { name: "Capture" }).click();

  const article = page.getByRole("article", { name: /Fungus on the nurse log/ });
  await expect(article).toBeVisible();
  await expect(article.getByText(/fungus\.jpg/i)).toBeVisible();
  await expect(article.getByText("Saved locally").first()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("article", { name: /Fungus on the nurse log/ }),
  ).toBeVisible();
  await expect(page.getByText(/fungus\.jpg/i)).toBeVisible();
});
