import { expect, test, type Page } from "@playwright/test";

async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("App cached")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: unknown })
            .__WT_CAPTURE_STORE__,
        ),
      ),
    )
    .toBe(true);
}

async function expectDurableDraft(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const store = (
          globalThis as typeof globalThis & {
            __WT_CAPTURE_STORE__?: { getDraft(): Promise<string> };
          }
        ).__WT_CAPTURE_STORE__;
        return store ? store.getDraft() : null;
      }),
    )
    .toBe(text);
}

test.describe("offline text Captures", () => {
  test("recovers a draft after restart, commits locally without location, and survives quota failure", async ({
    context,
    page,
  }) => {
    await context.setGeolocation({ latitude: 0, longitude: 0 });
    await context.grantPermissions([]);

    await openCaptureShell(page);

    const composer = page.getByLabel("Capture text");
    await composer.fill("Trail fork smelled like pine sap");
    await expectDurableDraft(page, "Trail fork smelled like pine sap");

    await page.reload();
    await expect(page.getByLabel("Capture text")).toHaveValue(
      "Trail fork smelled like pine sap",
    );

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel("Capture text")).toHaveValue(
      "Trail fork smelled like pine sap",
    );

    await page.getByRole("button", { name: "Capture" }).click();

    const saved = page.getByRole("article", {
      name: /Trail fork smelled like pine sap/,
    });
    await expect(saved).toBeVisible();
    await expect(saved.getByText("Saved locally")).toBeVisible();
    await expect(page.getByLabel("Capture text")).toHaveValue("");
    await expect(page.getByText(/Device storage:/)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const store = (
            globalThis as typeof globalThis & {
              __WT_CAPTURE_STORE__?: {
                list(): Promise<Array<{ text: string; location: unknown }>>;
              };
            }
          ).__WT_CAPTURE_STORE__;
          const captures = store ? await store.list() : [];
          const match = captures.find(
            (capture) => capture.text === "Trail fork smelled like pine sap",
          );
          return match ? match.location : "missing";
        }),
      )
      .toBeNull();

    await page.reload();
    await expect(
      page.getByRole("article", { name: /Trail fork smelled like pine sap/ }),
    ).toBeVisible();
    await expect(page.getByText("Saved locally")).toBeVisible();

    await page
      .getByLabel("Capture text")
      .fill("Keep this draft if storage fails");
    await expectDurableDraft(page, "Keep this draft if storage fails");

    await page.evaluate(() => {
      const current = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: Record<string, unknown> & {
            commit(text: string, location: unknown): Promise<unknown>;
          };
        }
      ).__WT_CAPTURE_STORE__;

      if (!current) {
        throw new Error("Capture store test hook is missing");
      }

      (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__: typeof current;
        }
      ).__WT_CAPTURE_STORE__ = {
        ...current,
        commit: async () => {
          throw new DOMException(
            "The quota has been exceeded.",
            "QuotaExceededError",
          );
        },
      };
    });

    await page.getByRole("button", { name: "Capture" }).click();
    await expect(page.getByText("Could not save Capture")).toBeVisible();
    await expect(page.getByLabel("Capture text")).toHaveValue(
      "Keep this draft if storage fails",
    );
    await expect(
      page.getByRole("article", { name: /Keep this draft if storage fails/ }),
    ).toHaveCount(0);
  });
});
