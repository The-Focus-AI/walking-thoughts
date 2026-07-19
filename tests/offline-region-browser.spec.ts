import { expect, test } from "@playwright/test";

test("airplane-mode Offline Region renders from the verified local pack", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page.getByRole("region", { name: "Map Journal" })).toBeVisible({
    timeout: 30_000,
  });
  // Primary topography comes from the Map Journal fixture Offline Region.
  await expect(
    page.getByLabel("Airplane-mode Offline Region map"),
  ).toBeVisible();
  await expect(page.getByText("Offline Region topography ready")).toBeVisible({
    timeout: 45_000,
  });

  await page.getByRole("button", { name: "Offline Region tools" }).click();
  const panel = page.getByRole("region", { name: "Offline Region" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/estimated pack/i)).toBeVisible();
  await expect(
    page.getByLabel("Offline Region radius in kilometers"),
  ).toHaveValue("40");

  await page.getByRole("button", { name: "Download Offline Region" }).click();
  await expect(panel.getByText(/Offline Region ready/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    panel.getByLabel("Airplane-mode Offline Region map"),
  ).toBeVisible();
  await expect(panel.getByLabel("Offline Region layers")).toContainText(
    "trails",
  );
  await expect(panel.getByText(/Not a network tile cache/i)).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("region", { name: "Map Journal" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByLabel("Airplane-mode Offline Region map").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Offline Region tools" }).click();
  await expect(page.getByRole("region", { name: "Offline Region" })).toBeVisible();
  await expect(page.getByText(/Trail-first Offline Region/i)).toBeVisible();
  await expect(page.getByLabel("Offline Region layers")).toContainText(
    "contours",
  );
});
