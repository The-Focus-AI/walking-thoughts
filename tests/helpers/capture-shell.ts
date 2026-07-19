import { expect, type Page } from "@playwright/test";

/**
 * Opens the offline shell and reveals the Capture Library lists so browser
 * tests can assert Inbox / Thread articles. Map Journal remains the primary
 * review surface; Library is a secondary disclosure.
 */
export async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByRole("region", { name: "Map Journal" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible();

  const library = page.getByRole("button", { name: "Show Inbox & Threads" });
  if (await library.count()) {
    await library.click();
  }
  await expect(
    page.getByRole("button", { name: "Hide Inbox & Threads" }),
  ).toBeVisible();
}
