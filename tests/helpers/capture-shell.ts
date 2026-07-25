import { expect, type Page } from "@playwright/test";

export async function openCaptureShell(page: Page) {
  await page.goto("/offline");
  await expect(page.getByLabel("Capture text")).toBeVisible();
  await expect(page.getByText("Shell ready")).toBeVisible();
  await expect.poll(() => captureStoreReady(page)).toBe(true);
}

function captureStoreReady(page: Page) {
  return page.evaluate(() =>
    Boolean(
      (globalThis as typeof globalThis & { __WT_CAPTURE_STORE__?: unknown })
        .__WT_CAPTURE_STORE__,
    ),
  );
}

/** How many Captures the phone holds — the trail surface prints the count,
 *  not the entries, so durability is read from the store. */
export async function captureCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: { list(): Promise<unknown[]> };
      }
    ).__WT_CAPTURE_STORE__;
    return store ? (await store.list()).length : 0;
  });
}

/** Commit one Capture from the trail surface and wait until it is durable. */
export async function commitCapture(page: Page, text: string): Promise<void> {
  const before = await captureCount(page);
  await page.getByLabel("Capture text").fill(text);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect.poll(() => captureCount(page)).toBe(before + 1);
}

/** The newest Thread's id, for tests that open a Thread directly. Waits for
 *  the commit to land rather than racing it. */
export async function newestThreadId(page: Page): Promise<string> {
  const read = () =>
    page.evaluate(async () => {
      const store = (
        globalThis as typeof globalThis & {
          __WT_CAPTURE_STORE__?: {
            listRecentThreads(): Promise<Array<{ id: string }>>;
          };
        }
      ).__WT_CAPTURE_STORE__;
      const threads = store ? await store.listRecentThreads() : [];
      return threads[0]?.id ?? null;
    });
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}
