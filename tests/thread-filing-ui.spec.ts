import { expect, test } from "@playwright/test";
import { commitCapture, openCaptureShell } from "./helpers/capture-shell";

/**
 * Filing at the desk: the walker confirms what the Enrichment guessed, puts
 * the Thread in a Project, or simply reads it — and it leaves the New queue.
 */
test("filing a Thread clears it from New", async ({ page }) => {
  // The filing endpoints stand in for the server; the walker's device only
  // needs the answer to settle its local Thread row.
  await page.addInitScript(() => {
    const projects: Array<{ id: string; name: string; createdAt: string }> = [
      { id: "proj-umwelten", name: "Umwelten", createdAt: "2026-07-01" },
    ];
    (globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }).__WT_REVIEW_TRANSPORT__ =
      {
        async setReviewed(threadId: string) {
          return { threadId, reviewedAt: new Date().toISOString() };
        },
        async listProjects() {
          return projects;
        },
        async createProject(name: string) {
          const project = {
            id: `proj-${projects.length}`,
            name,
            createdAt: "2026-07-25",
          };
          projects.push(project);
          return project;
        },
        async fileThread(
          threadId: string,
          filing: { kind?: string | null; projectId?: string | null },
        ) {
          const project = projects.find((p) => p.id === filing.projectId);
          return {
            threadId,
            reviewedAt: new Date().toISOString(),
            kind: filing.kind ?? null,
            projectId: filing.projectId ?? null,
            projectName: project?.name ?? null,
          };
        },
      };
  });

  await openCaptureShell(page);
  await commitCapture(page, "The umwelten reader should show sensory worlds");

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "1 waiting",
  );
  await page.locator(".desk-day-open").first().click();
  const row = page.getByRole("link", { name: /umwelten reader/ });
  await expect(row).toBeVisible();

  // Open the filing control and put it in a Project.
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();
  await page.getByTestId("file-project-proj-umwelten").click();

  // Filed: the Thread settles in place, carrying the Project it went into,
  // and the day says the sit-down is done.
  await expect(row).toBeVisible();
  await expect(page.getByTestId("thread-project-chip")).toHaveText("Umwelten");
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();
  await expect(page.locator(".thread-row")).toHaveClass(/thread-row-filed/);

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );
});
