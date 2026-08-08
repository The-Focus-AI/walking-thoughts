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

/**
 * The Research Verdict is part of Filing: keeping the research files the
 * Thread and reads back settled; the note is processed either way.
 */
test("keeping the research files the Thread and reads back settled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }).__WT_REVIEW_TRANSPORT__ =
      {
        async setReviewed(threadId: string) {
          return { threadId, reviewedAt: new Date().toISOString() };
        },
        async listProjects() {
          return [];
        },
        async fileThread(
          threadId: string,
          filing: {
            kind?: string | null;
            researchVerdict?: "kept" | "dismissed" | null;
          },
        ) {
          return {
            threadId,
            reviewedAt: new Date().toISOString(),
            kind: filing.kind ?? null,
            projectId: null,
            projectName: null,
            researchVerdict: filing.researchVerdict ?? null,
          };
        },
      };
  });

  await openCaptureShell(page);
  await commitCapture(page, "Second wall meets the first at a corner");

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();

  await page.getByTestId("file-keep-research").click();

  // Kept research files the Thread — Reviewed — and the verdict reads back.
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("file-keep-research")).toHaveText(
    "Research kept ✓",
  );

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );
});

/**
 * Spec routing's receipt (ADR 0018): the drafted issue reads back with its
 * repo named and a link; a Project without a repository says plainly that
 * the handoff is not live.
 */
test("routing to Spec shows the drafted issue, or that the handoff is not live", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let repositoryWired = true;
    (globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }).__WT_REVIEW_TRANSPORT__ =
      {
        async setReviewed(threadId: string) {
          return { threadId, reviewedAt: new Date().toISOString() };
        },
        async listProjects() {
          return [];
        },
        async fileThread(threadId: string, filing: { route?: string | null }) {
          // First spec routing drafts; after the walker re-routes to
          // Journal the record keeps naming the orphaned issue. The
          // second Thread's Project has no repository — skipped.
          const specHandoff =
            filing.route === undefined
              ? null
              : repositoryWired
                ? {
                    status: "drafted",
                    repository: "the-focus-ai/umwelten",
                    issueUrl:
                      "https://github.com/the-focus-ai/umwelten/issues/7",
                    issueNumber: 7,
                    reason: null,
                    at: new Date().toISOString(),
                    orphanedAt: null,
                  }
                : {
                    status: "skipped",
                    repository: null,
                    issueUrl: null,
                    issueNumber: null,
                    reason: "no_repository",
                    at: new Date().toISOString(),
                    orphanedAt: null,
                  };
          if (filing.route === "spec") repositoryWired = false;
          return {
            threadId,
            reviewedAt: new Date().toISOString(),
            kind: null,
            projectId: null,
            projectName: null,
            researchVerdict: null,
            route: filing.route ?? null,
            specHandoff,
          };
        },
      };
  });

  await openCaptureShell(page);
  await commitCapture(page, "Ship the umwelten reader as its own tool");

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();

  // Route to Spec: the receipt names the repo and links the drafted issue.
  await page.getByTestId("file-route-spec").click();
  await page.locator(".thread-file-open").first().click();
  const note = page.getByTestId("spec-handoff-note");
  await expect(note).toContainText("Issue drafted in the-focus-ai/umwelten");
  await expect(note.locator("a")).toHaveAttribute(
    "href",
    "https://github.com/the-focus-ai/umwelten/issues/7",
  );

  // Route to Spec again (the stub now has no repository): recorded, and the
  // Thread says the handoff is not live.
  await page.getByTestId("file-route-spec").click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("spec-handoff-note")).toContainText(
    "the handoff is not live",
  );
});

/**
 * The Route is Filing's primary verb (ADR 0017): settling one gesture both
 * reviews the Thread and records where it went; Journal implies the
 * research is kept.
 */
test("routing a Thread settles it in one gesture and reads back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __WT_REVIEW_TRANSPORT__?: unknown }).__WT_REVIEW_TRANSPORT__ =
      {
        async setReviewed(threadId: string) {
          return { threadId, reviewedAt: new Date().toISOString() };
        },
        async listProjects() {
          return [];
        },
        async fileThread(
          threadId: string,
          filing: {
            kind?: string | null;
            researchVerdict?: "kept" | "dismissed" | null;
            route?: string | null;
          },
        ) {
          // The server implies the verdict from the Route when the filing
          // names none outright — mirrored here so the seam under test is
          // the client's adoption of that answer.
          const implied =
            filing.route === "journal"
              ? "kept"
              : filing.route === "drop"
                ? "dismissed"
                : null;
          return {
            threadId,
            reviewedAt: new Date().toISOString(),
            kind: filing.kind ?? null,
            projectId: null,
            projectName: null,
            researchVerdict: filing.researchVerdict ?? implied,
            route: filing.route ?? null,
          };
        },
      };
  });

  await openCaptureShell(page);
  await commitCapture(page, "Why is it dark at night with so many stars");

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();

  // One gesture: route it to the notebook.
  await page.getByTestId("file-route-journal").click();

  // Routed = Reviewed, and the route + implied verdict read back settled.
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("file-route-journal")).toHaveText("Journal ✓");
  await expect(page.getByTestId("file-keep-research")).toHaveText(
    "Research kept ✓",
  );

  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );
});
