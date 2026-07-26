import { expect, test, type Page } from "@playwright/test";
import { commitCapture, newestThreadId, openCaptureShell } from "./helpers/capture-shell";

/**
 * The desk, with reports waiting. The Artifact list and the published pages
 * are stubbed: this is about how the day surfaces a report and how it reads
 * without leaving the day, not about the gateway that wrote it.
 */
async function stubArtifact(
  page: Page,
  artifact: {
    id: string;
    threadId: string;
    title: string;
    standfirst: string | null;
  },
): Promise<void> {
  await page.route("**/api/artifacts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        artifacts: [
          {
            ...artifact,
            enrichmentId: "enrichment:job-1",
            kind: "question",
            model: "anthropic/claude-sonnet-5",
            createdAt: "2026-07-26T10:00:00.000Z",
          },
        ],
      }),
    });
  });
  // The page loads inside a sandboxed frame, which `page.route` does not
  // reach — the stub has to sit on the context. The id is percent-encoded
  // into the path, so match on the path rather than a glob over the raw id.
  await page.context().route(
    (url) => url.pathname.startsWith("/artifacts/"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "content-security-policy": "default-src 'none'" },
        body: "<!doctype html><html><body><h1>Bluestone, quarried locally</h1></body></html>",
      });
    },
  );
  // The desk asks per Thread for Enrichments; nothing here needs them.
  await page.route("**/api/enrichment/threads/**", () => {});
}

test("a Thread with a report waiting says so in the day, and reads in place", async ({
  page,
}) => {
  await openCaptureShell(page);
  await commitCapture(page, "where did we get the stones for the patio?");
  const threadId = await newestThreadId(page);

  await stubArtifact(page, {
    id: "artifact:enrichment:job-1",
    threadId,
    title: "Where the patio stone came from",
    standfirst: "The yard two valleys over still cuts it.",
  });

  await page.goto("/days");

  // The day list says what the day left, in the machine's own words.
  const dayState = page.locator(".desk-day-state").first();
  await expect(dayState).toHaveText("1 report to read");
  await expect(dayState).toHaveClass(/desk-day-state-reports/);

  await page.locator(".desk-day-open").first().click();
  await expect(page.getByTestId("day-sheet")).toBeVisible();
  await expect(page.getByTestId("day-sheet-reports")).toContainText("To read");

  // The row carries the Annotation's mark and says what the report is about,
  // so the walker knows whether to open it before opening it.
  const row = page.locator(".thread-row").first();
  await expect(row).toHaveClass(/thread-row-report/);
  await expect(page.getByTestId("thread-standfirst").first()).toHaveText(
    "The yard two valleys over still cuts it.",
  );

  // At the desk the report opens over the day rather than in a new tab.
  await page.getByTestId("thread-artifact-link").first().click();
  const lightbox = page.getByTestId("artifact-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox).toContainText("Where the patio stone came from");

  // The page is framed at its own URL. Its markup is read directly rather
  // than through a locator: the frame is sandboxed without `allow-scripts`,
  // so nothing — including a test harness — runs script inside it.
  await expect(page.getByTestId("artifact-lightbox-page")).toHaveAttribute(
    "src",
    "/artifacts/artifact%3Aenrichment%3Ajob-1",
  );
  await expect(page.getByTestId("artifact-lightbox-page")).toHaveAttribute(
    "sandbox",
    "allow-same-origin allow-popups",
  );
  const framed = await expect
    .poll(async () => {
      const frame = page
        .frames()
        .find((candidate) => candidate.url().includes("/artifacts/artifact"));
      return frame ? await frame.content() : null;
    })
    .toContain("Bluestone, quarried locally")
    .then(() => true);
  expect(framed).toBe(true);

  // The page is still reachable on its own, and Escape closes the reading.
  await expect(page.getByTestId("artifact-lightbox-out")).toHaveAttribute(
    "href",
    "/artifacts/artifact%3Aenrichment%3Ajob-1",
  );
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);
});

test("a day with no report waiting says nothing about reports", async ({
  page,
}) => {
  await page.route("**/api/artifacts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ artifacts: [] }),
    });
  });
  await page.route("**/api/enrichment/threads/**", () => {});

  await openCaptureShell(page);
  await commitCapture(page, "call the stone yard");
  await page.goto("/days");

  const dayState = page.locator(".desk-day-state").first();
  await expect(dayState).toHaveText("1 waiting");
  await expect(page.locator(".thread-row-report")).toHaveCount(0);
  await expect(page.getByTestId("thread-artifact-link")).toHaveCount(0);
});
