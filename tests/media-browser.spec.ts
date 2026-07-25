import { expect, test } from "@playwright/test";
import { captureCount, newestThreadId } from "./helpers/capture-shell";

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

  await expect.poll(() => captureCount(page)).toBe(1);
  await expect(page.getByTestId("capture-tally")).toContainText(
    "1 Capture today",
  );

  // The media itself is readable at the desk, on the Thread it started.
  const threadId = await newestThreadId(page);
  await page.goto(`/threads/${threadId}`);
  const hero = page.getByTestId("thread-capture-hero");
  await expect(hero).toContainText("Fungus on the nurse log");
  await expect(hero.getByText(/fungus\.jpg/i).first()).toBeVisible();
  await expect(hero.getByText("On device")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("thread-capture-hero")).toContainText(
    "Fungus on the nurse log",
  );
  await expect(page.getByText(/fungus\.jpg/i).first()).toBeVisible();
});
