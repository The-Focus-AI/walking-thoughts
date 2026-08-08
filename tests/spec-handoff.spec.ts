import { expect, test } from "@playwright/test";
import { asProjectRepository } from "@/lib/local-capture/types";
import {
  orphanSpecHandoff,
  settleSpecHandoff,
  specHandoffKey,
} from "@/lib/spec/handoff";
import type { SpecReportSource } from "@/lib/spec/handoff";
import {
  createGitHubIssueDrafter,
  createMemoryIssueDrafter,
  listMemoryDraftedIssues,
  resetMemoryIssueDrafter,
} from "@/lib/spec/issue-drafter";
import type { IssueDrafter } from "@/lib/spec/issue-drafter";
import { mergeRemoteThreads } from "@/lib/sync/hydrate";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "spec-handoff-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryIssueDrafter(NS);
});

async function seedThread(
  threads: ReturnType<typeof createMemoryThreadRepository>,
  id: string,
  text: string,
) {
  await threads.upsertCaptures("user_a", [
    {
      id,
      text,
      createdAt: "2026-08-08T07:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
  return id;
}

function reportsWith(
  entries: Array<{ text: string; kind?: string | null; createdAt: string }>,
): SpecReportSource {
  return { listThreadEnrichments: async () => entries };
}

const NO_REPORTS = reportsWith([]);

async function threadById(
  threads: ReturnType<typeof createMemoryThreadRepository>,
  id: string,
) {
  const listed = await threads.listThreads("user_a");
  const found = listed.find((thread) => thread.id === id);
  if (!found) throw new Error(`thread ${id} missing`);
  return found;
}

test("a Project carries a repository, and creating again by name keeps it", async () => {
  const threads = createMemoryThreadRepository(NS);
  const created = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  expect(created.repository).toBe("the-focus-ai/umwelten");

  // Filing the same name with no repository keeps the one it has.
  const again = await threads.createProject("user_a", "Umwelten");
  expect(again.id).toBe(created.id);
  expect(again.repository).toBe("the-focus-ai/umwelten");

  // Naming a repository on an existing Project is the seam that sets it.
  const bare = await threads.createProject("user_a", "Habitats");
  expect(bare.repository).toBeNull();
  const upgraded = await threads.createProject("user_a", "Habitats", {
    repository: "the-focus-ai/habitats",
  });
  expect(upgraded.id).toBe(bare.id);
  expect(upgraded.repository).toBe("the-focus-ai/habitats");

  const listed = await threads.listProjects("user_a");
  expect(
    listed.map((project) => [project.name, project.repository]),
  ).toEqual([
    ["Habitats", "the-focus-ai/habitats"],
    ["Umwelten", "the-focus-ai/umwelten"],
  ]);
});

test("a repository is a plain owner/repo, nothing else", () => {
  expect(asProjectRepository("the-focus-ai/walking-thoughts")).toBe(
    "the-focus-ai/walking-thoughts",
  );
  expect(asProjectRepository("  owner/repo  ")).toBe("owner/repo");
  expect(asProjectRepository("https://github.com/owner/repo")).toBeNull();
  expect(asProjectRepository("owner")).toBeNull();
  expect(asProjectRepository("owner/repo/extra")).toBeNull();
  expect(asProjectRepository("owner /repo")).toBeNull();
  expect(asProjectRepository(42)).toBeNull();
});

test("routing a spec Thread to a Project with a repository drafts the issue there", async () => {
  const threads = createMemoryThreadRepository(NS);
  const drafter = createMemoryIssueDrafter(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-spec", "Build the umwelten reader");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  const handoff = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: reportsWith([
      {
        text: "An idea-shaped report on the reader.",
        kind: "idea",
        createdAt: "2026-08-08T08:00:00.000Z",
      },
    ]),
    drafter,
    now: "2026-08-08T09:00:01.000Z",
  });

  expect(handoff.status).toBe("drafted");
  expect(handoff.repository).toBe("the-focus-ai/umwelten");
  expect(handoff.issueUrl).toContain("the-focus-ai/umwelten/issues/");

  const issues = listMemoryDraftedIssues(NS);
  expect(issues).toHaveLength(1);
  // Title from the Thread, body from the report, key for the dedup search.
  expect(issues[0].title).toBe("Build the umwelten reader");
  expect(issues[0].body).toContain("An idea-shaped report on the reader.");
  expect(issues[0].body).toContain(specHandoffKey(id));

  // The record round-trips on the Thread for receipts and other devices.
  const stored = await threadById(threads, id);
  expect(stored.specHandoff?.status).toBe("drafted");
  expect(stored.specHandoff?.issueUrl).toBe(handoff.issueUrl);
});

test("the body prefers the newest idea-shaped report over a newer other one", async () => {
  const threads = createMemoryThreadRepository(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-body", "Reader idea");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: reportsWith([
      { text: "Older idea report.", kind: "idea", createdAt: "1" },
      { text: "Newer idea report.", kind: "idea", createdAt: "2" },
      { text: "Newest, but a question.", kind: "question", createdAt: "3" },
    ]),
    drafter: createMemoryIssueDrafter(NS),
  });

  const [issue] = listMemoryDraftedIssues(NS);
  expect(issue.body).toContain("Newer idea report.");
  expect(issue.body).not.toContain("Older idea report.");
  expect(issue.body).not.toContain("Newest, but a question.");
});

test("without any report the body falls back to the walker's own words", async () => {
  const threads = createMemoryThreadRepository(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-plain", "Just the capture text");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter: createMemoryIssueDrafter(NS),
  });

  const [issue] = listMemoryDraftedIssues(NS);
  expect(issue.body).toContain("Just the capture text");
});

test("routing twice never drafts two issues", async () => {
  const threads = createMemoryThreadRepository(NS);
  const drafter = createMemoryIssueDrafter(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-idem", "One idea, one issue");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  const first = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
  });
  const second = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
  });

  expect(second.status).toBe("drafted");
  expect(second.issueUrl).toBe(first.issueUrl);
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);
});

test("un-routing orphans the record but the issue stays; routing back reuses it", async () => {
  const threads = createMemoryThreadRepository(NS);
  const drafter = createMemoryIssueDrafter(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-orphan", "Route, regret, re-route");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });
  const drafted = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
  });

  // The walker re-routes to Journal: no external delete, an orphan note.
  await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-08T09:05:00.000Z",
    route: "journal",
  });
  const orphaned = await orphanSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    now: "2026-08-08T09:05:01.000Z",
  });
  expect(orphaned?.status).toBe("drafted");
  expect(orphaned?.orphanedAt).toBe("2026-08-08T09:05:01.000Z");
  expect(orphaned?.issueUrl).toBe(drafted.issueUrl);
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);

  // Routing back to Spec clears the orphan note and never drafts again.
  await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-08T09:10:00.000Z",
    route: "spec",
  });
  const restored = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
  });
  expect(restored.status).toBe("drafted");
  expect(restored.orphanedAt).toBeNull();
  expect(restored.issueUrl).toBe(drafted.issueUrl);
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);

  // Orphaning something that was never drafted is a no-op.
  const other = await seedThread(threads, "t-never", "Never drafted");
  const untouched = await orphanSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, other),
    threads,
  });
  expect(untouched).toBeNull();
});

test("a Project without a repository degrades gracefully and can go live later", async () => {
  const threads = createMemoryThreadRepository(NS);
  const drafter = createMemoryIssueDrafter(NS);
  const project = await threads.createProject("user_a", "Notebook only");
  const id = await seedThread(threads, "t-skip", "Spec with nowhere to land");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  const skipped = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
    now: "2026-08-08T09:00:01.000Z",
  });

  // Recorded, no external write, and the Thread says the handoff is not live.
  expect(skipped.status).toBe("skipped");
  expect(skipped.reason).toBe("no_repository");
  expect(skipped.issueUrl).toBeNull();
  expect(listMemoryDraftedIssues(NS)).toHaveLength(0);
  expect((await threadById(threads, id)).specHandoff?.status).toBe("skipped");

  // The Project gains a repository; the next spec routing drafts for real.
  await threads.createProject("user_a", "Notebook only", {
    repository: "the-focus-ai/notebook",
  });
  const live = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter,
  });
  expect(live.status).toBe("drafted");
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);
});

test("a failed draft is recorded visibly and a retry never duplicates", async () => {
  const threads = createMemoryThreadRepository(NS);
  const memoryDrafter = createMemoryIssueDrafter(NS);
  const project = await threads.createProject("user_a", "Umwelten", {
    repository: "the-focus-ai/umwelten",
  });
  const id = await seedThread(threads, "t-fail", "Draft into a downed repo");
  await threads.fileThread("user_a", id, {
    projectId: project.id,
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });

  const downDrafter: IssueDrafter = {
    async draftIssue() {
      throw new Error("github_502");
    },
  };
  const failed = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter: downDrafter,
  });
  expect(failed.status).toBe("failed");
  expect(failed.reason).toBe("github_502");
  expect(listMemoryDraftedIssues(NS)).toHaveLength(0);
  // Surfaced on the Thread, never silently.
  expect((await threadById(threads, id)).specHandoff?.status).toBe("failed");

  // The outage ends; the retry drafts exactly one issue.
  const retried = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter: memoryDrafter,
  });
  expect(retried.status).toBe("drafted");
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);

  const again = await settleSpecHandoff({
    userId: "user_a",
    thread: await threadById(threads, id),
    threads,
    reports: NO_REPORTS,
    drafter: memoryDrafter,
  });
  expect(again.issueUrl).toBe(retried.issueUrl);
  expect(listMemoryDraftedIssues(NS)).toHaveLength(1);
});

test("hydration adopts the handoff record the way it adopts the Route", () => {
  const specHandoff = {
    status: "drafted" as const,
    repository: "the-focus-ai/umwelten",
    issueUrl: "https://github.com/the-focus-ai/umwelten/issues/7",
    issueNumber: 7,
    reason: null,
    at: "2026-08-08T09:00:01.000Z",
    orphanedAt: null,
  };
  const merged = mergeRemoteThreads({
    localCaptures: [],
    localThreads: [
      {
        id: "t-hydrate",
        title: "Reader idea",
        revision: 1,
        updatedAt: "2026-08-08T06:40:00.000Z",
        reviewedAt: null,
        route: null,
        specHandoff: null,
      },
    ],
    remoteThreads: [
      {
        id: "t-hydrate",
        title: "Reader idea",
        revision: 1,
        updatedAt: "2026-08-08T06:40:00.000Z",
        reviewedAt: "2026-08-08T09:00:00.000Z",
        route: "spec",
        specHandoff,
        captures: [],
      },
    ],
  });
  const thread = merged.threads.find((t) => t.id === "t-hydrate");
  expect(thread?.route).toBe("spec");
  expect(thread?.specHandoff).toEqual(specHandoff);
});

test("the GitHub drafter finds a prior issue by its key before ever creating", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const priorIssue = {
    html_url: "https://github.com/the-focus-ai/umwelten/issues/3",
    number: 3,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/search/issues")) {
      return Response.json({ items: [priorIssue] });
    }
    throw new Error("unexpected fetch");
  }) as typeof fetch;

  const drafter = createGitHubIssueDrafter({ token: "t", fetchImpl });
  const drafted = await drafter.draftIssue({
    repository: "the-focus-ai/umwelten",
    title: "Reader",
    body: `Body\n\nHandoff key: spec:t-1`,
    idempotencyKey: "spec:t-1",
  });

  expect(drafted.duplicate).toBe(true);
  expect(drafted.url).toBe(priorIssue.html_url);
  expect(drafted.number).toBe(3);
  expect(calls).toHaveLength(1);
});

test("the GitHub drafter creates when the key is unseen, and surfaces failures", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/search/issues")) {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/repos/the-focus-ai/umwelten/issues")) {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as {
        title: string;
        body: string;
      };
      expect(body.title).toBe("Reader");
      return Response.json(
        {
          html_url: "https://github.com/the-focus-ai/umwelten/issues/9",
          number: 9,
        },
        { status: 201 },
      );
    }
    throw new Error("unexpected fetch");
  }) as typeof fetch;

  const drafter = createGitHubIssueDrafter({ token: "t", fetchImpl });
  const drafted = await drafter.draftIssue({
    repository: "the-focus-ai/umwelten",
    title: "Reader",
    body: "Body",
    idempotencyKey: "spec:t-2",
  });
  expect(drafted.duplicate).toBe(false);
  expect(drafted.number).toBe(9);

  const failing = createGitHubIssueDrafter({
    token: "t",
    fetchImpl: (async () =>
      new Response("nope", { status: 502 })) as typeof fetch,
  });
  await expect(
    failing.draftIssue({
      repository: "the-focus-ai/umwelten",
      title: "Reader",
      body: "Body",
      idempotencyKey: "spec:t-3",
    }),
  ).rejects.toThrow("github_502");
});
