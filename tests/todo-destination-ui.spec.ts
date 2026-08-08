import { expect, test } from "@playwright/test";
import {
  commitCapture,
  newestThreadId,
  openCaptureShell,
} from "./helpers/capture-shell";

/**
 * The To-do destination (docs/desk.md, D2): routing a Thread to To-do puts
 * it on the task list in the walker's own words; checking it off happens on
 * the destination surface and survives a reload; un-routing removes it.
 */

/**
 * Stand-in transports: filing and check-off answer the way the server
 * would, and Thread hydration reports unavailable so the locally settled
 * route is what the surfaces read — the seam under test is the client's
 * adoption of the server's answers.
 */
function stubTransports() {
  const g = globalThis as typeof globalThis & {
    __WT_REVIEW_TRANSPORT__?: unknown;
    __WT_THREADS_TRANSPORT__?: unknown;
  };
  g.__WT_REVIEW_TRANSPORT__ = {
    async setReviewed(threadId: string) {
      return { threadId, reviewedAt: new Date().toISOString() };
    },
    async listProjects() {
      return [];
    },
    async fileThread(
      threadId: string,
      filing: { kind?: string | null; route?: string | null },
    ) {
      return {
        threadId,
        reviewedAt: new Date().toISOString(),
        kind: filing.kind ?? null,
        projectId: null,
        projectName: null,
        researchVerdict: null,
        route: filing.route ?? null,
      };
    },
    async setTodoDone(threadId: string, done: boolean) {
      return {
        threadId,
        todoDoneAt: done ? new Date().toISOString() : null,
      };
    },
  };
  g.__WT_THREADS_TRANSPORT__ = {
    async listThreads() {
      return { unavailable: true };
    },
  };
}

const WALKER_WORDS = "Fix the fence gate latch before the sheep find it";

test("a routed to-do lands on the list, checks off, and survives reload", async ({
  page,
}) => {
  await page.addInitScript(stubTransports);

  await openCaptureShell(page);
  await commitCapture(page, WALKER_WORDS);
  const threadId = await newestThreadId(page);

  // Route it to To-do at the desk — one gesture settles it.
  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await expect(page.getByTestId("thread-filing")).toBeVisible();
  await page.getByTestId("file-route-todo").click();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  // The task list shows it in the walker's words, unchecked.
  await page.goto("/todo");
  const item = page.getByTestId(`todo-item-${threadId}`);
  await expect(item).toBeVisible();
  await expect(item).toContainText(WALKER_WORDS);
  const check = page.getByTestId(`todo-check-${threadId}`);
  await expect(check).not.toBeChecked();

  // Checking it off is the walker's action here — and it sticks.
  await check.click();
  await expect(check).toBeChecked();
  await expect(page.getByTestId("todo-tally")).toHaveText("0 open · 1 done");

  await page.reload();
  await expect(page.getByTestId(`todo-check-${threadId}`)).toBeChecked();

  // The check-off did not re-open the Thread at the desk.
  await page.goto("/days");
  await expect(page.locator(".desk-day-open").first()).toContainText(
    "All filed",
  );

  // Un-routing (undo at the desk clears the route) removes the item.
  await page.evaluate(async (id) => {
    const store = (
      globalThis as typeof globalThis & {
        __WT_CAPTURE_STORE__?: {
          applyThreadFiling(filing: {
            threadId: string;
            reviewedAt: string | null;
            route: string | null;
          }): Promise<void>;
        };
      }
    ).__WT_CAPTURE_STORE__;
    await store?.applyThreadFiling({
      threadId: id,
      reviewedAt: null,
      route: null,
    });
  }, threadId);

  await page.goto("/todo");
  await expect(page.getByTestId("todo-empty")).toBeVisible();
});

test("the day digest checklist asks with that day's routed to-dos", async ({
  page,
}) => {
  await page.addInitScript(stubTransports);

  await openCaptureShell(page);
  await commitCapture(page, WALKER_WORDS);
  const threadId = await newestThreadId(page);

  let routedTodos: unknown = null;
  await page.route("**/api/digest", async (route) => {
    const body = route.request().postDataJSON() as { routedTodos?: unknown };
    routedTodos = body.routedTodos ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: `## Checklist\n- [ ] ${WALKER_WORDS}`,
        model: "test-model",
      }),
    });
  });

  await page.goto("/days");
  await page.locator(".desk-day-open").first().click();
  await page.locator(".thread-file-open").first().click();
  await page.getByTestId("file-route-todo").click();
  await expect(page.getByTestId("thread-reviewed-chip")).toBeVisible();

  await page
    .getByRole("button", { name: "Create a task checklist of the day" })
    .click();

  await expect
    .poll(() => routedTodos, { timeout: 8_000 })
    .toEqual([{ threadId, text: WALKER_WORDS, done: false }]);
  await expect(page.getByTestId("digest-result")).toContainText(WALKER_WORDS, {
    timeout: 8_000,
  });
});
