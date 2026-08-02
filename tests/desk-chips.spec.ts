import { expect, test } from "@playwright/test";
import { seedPile } from "./helpers/desk-pile";

/**
 * The phone's chip row is its rendering of the desk's filter model — same
 * params, no rail. A link made at the desk opens filtered here, and a chip
 * pressed here makes a link the rail understands.
 */

test("the chip row speaks the desk's filter model, Open and Research kept included", async ({
  page,
}) => {
  await seedPile(page);
  await page.goto("/days");

  // The phone stays capture-first: chips only.
  await expect(page.getByTestId("desk-rail")).toHaveCount(0);
  await expect(page.getByTestId("desk-lens")).toHaveCount(0);

  const chips = page.locator(".desk-filters");
  await expect(chips.getByTestId("desk-filter-open")).toContainText("Open · 3");
  await expect(chips.getByTestId("desk-filter-kept")).toContainText(
    "Research kept · 1",
  );
  await expect(chips.getByTestId("desk-filter-media")).toContainText(
    "Has media · 1",
  );

  // A chip writes the same param the desktop rail writes.
  await chips.getByTestId("desk-filter-open").click();
  await expect(page).toHaveURL(/\/days\?state=open$/);
  await expect(
    page.getByRole("link", { name: /Heron on the far bank/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /reservoir wall/ }),
  ).toBeVisible();

  // Pressing the active chip again clears its group, as the rail row does.
  await chips.getByTestId("desk-filter-open").click();
  await expect(page).toHaveURL(/\/days$/);
});

test("a link written at the desk opens on the phone with the same Threads", async ({
  page,
}) => {
  await seedPile(page);

  // A desktop selection the chip row has no chip for: the Threads still
  // narrow, and the chips that do map stay usable beside it.
  await page.goto("/days?kind=question&lens=kind");
  await expect(page.getByTestId("desk-rail")).toHaveCount(0);
  await expect(page.getByTestId("desk-lens")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /reservoir wall/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /culvert grate/ }),
  ).toHaveCount(0);

  // A selection both surfaces render: the chip comes up active.
  await page.goto("/days?state=kept");
  await expect(page.getByTestId("desk-filter-kept")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    page.getByRole("link", { name: /Heron on the far bank/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /reservoir wall/ }),
  ).toHaveCount(0);
});
