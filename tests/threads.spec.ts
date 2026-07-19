import { expect, test, type Page } from "@playwright/test";
import { openCaptureShell as openShell } from "./helpers/capture-shell";

async function openCaptureShell(page: Page) {
  await openShell(page);
  await expect(page.getByLabel("Destination")).toHaveValue("inbox");
}

test.describe("append-only Threads", () => {
  test("defaults to Inbox, sticks to a Thread, resets on restart, and appends corrections", async ({
    page,
  }) => {
    await openCaptureShell(page);

    await page.getByLabel("Capture text").fill("Trail marker leaning left");
    await page.getByRole("button", { name: "Capture" }).click();

    const inbox = page.getByRole("region", { name: "Inbox" });
    await expect(
      inbox.getByRole("article", { name: /Trail marker leaning left/ }),
    ).toBeVisible();
    await expect(page.getByLabel("Destination")).toHaveValue("inbox");

    await page.getByLabel("Destination").selectOption("new_thread");
    await page.getByLabel("Capture text").fill("Same ridge, clearer view");
    await page.getByRole("button", { name: "Capture" }).click();

    const thread = page.getByRole("region", { name: /Same ridge, clearer view/ });
    await expect(
      thread.getByRole("article", { name: /Same ridge, clearer view/ }),
    ).toBeVisible();
    await expect(page.getByLabel("Destination")).not.toHaveValue("inbox");
    await expect(page.getByLabel("Destination")).not.toHaveValue("new_thread");

    const stuckThreadValue = await page.getByLabel("Destination").inputValue();

    await page.getByLabel("Capture text").fill("Correction: marker leans right");
    await page.getByRole("button", { name: "Capture" }).click();

    await expect(
      thread.getByRole("article", { name: /Same ridge, clearer view/ }),
    ).toBeVisible();
    await expect(
      thread.getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();
    await expect(page.getByLabel("Destination")).toHaveValue(stuckThreadValue);

    await page.reload();
    await expect(page.getByLabel("Destination")).toHaveValue("inbox");
    await expect(
      page
        .getByRole("region", { name: /Same ridge, clearer view/ })
        .getByRole("article", { name: /Correction: marker leans right/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Inbox" })
        .getByRole("article", { name: /Trail marker leaning left/ }),
    ).toBeVisible();
  });
});
