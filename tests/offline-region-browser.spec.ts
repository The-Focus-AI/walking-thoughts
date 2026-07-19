import { expect, test } from "@playwright/test";

test("home map hero installs and renders the Offline Region pack", async ({
  page,
}) => {
  await page.goto("/offline");
  const hero = page.getByRole("region", { name: "Offline Region map" });
  await expect(hero).toBeVisible();

  await expect(page.getByTestId("trail-map-hero")).toBeVisible({
    timeout: 30_000,
  });
  await expect(hero.getByText(/ready/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Map Journal" }),
  ).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByTestId("trail-map-hero")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("link", { name: "Open Map Journal" }),
  ).toBeVisible();
});
