import { expect, test } from "@playwright/test";

test.describe("data handling disclosure", () => {
  test("the privacy page disclosed provider processing honestly", async ({
    page,
  }) => {
    await page.goto("/privacy");

    // AI processing disclosure names the gateway and the provider hop.
    const processing = page.getByRole("region", {
      name: "AI processing disclosure",
    });
    await expect(processing).toContainText("Vercel AI Gateway");
    await expect(processing).toContainText("selected model provider");
    await expect(processing).toContainText("exact gateway model");

    // No end-to-end encryption claim — the opposite is stated.
    const encryption = page.getByRole("region", { name: "Encryption" });
    await expect(encryption).toContainText("not end-to-end encrypted");
    await expect(encryption).toContainText("TLS");

    // Foreground synchronization is dependable; background is best-effort.
    const sync = page.getByRole("region", { name: "Synchronization" });
    await expect(sync).toContainText("dependable while the app is open");
    await expect(sync).toContainText("best-effort");

    // Offline limits never cast doubt on locally committed Captures.
    const local = page.getByRole("region", { name: "Local first" });
    await expect(local).toContainText("Saved locally");
    await expect(local).toContainText("never affects it");

    // Private media promise: no permanent public URLs.
    const storage = page.getByRole("region", { name: "Cloud storage" });
    await expect(storage).toContainText("no permanent public media URLs");
    await expect(storage).toContainText("separate resources");
  });

  test("the shell links to the disclosure and transport enforces HTTPS", async ({
    page,
    request,
  }) => {
    await page.goto("/offline");
    await expect(
      page.getByRole("link", { name: "Privacy & data handling" }),
    ).toBeVisible();

    const response = await request.get("/api/health");
    expect(response.headers()["strict-transport-security"]).toContain(
      "max-age=",
    );
  });
});
