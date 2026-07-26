import { expect, test } from "@playwright/test";
import {
  advanceInterview,
  PROJECT_PROPOSAL_THRESHOLD,
  readInterviewState,
} from "@/lib/interview/run";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";
import type { ThreadRepository } from "@/lib/sync/types";

const NS = "interview-tests";
const USER = "walker-1";

function dependencies() {
  return {
    memories: createMemoryWalkerMemoryRepository(NS),
    threads: createMemoryThreadRepository(NS),
  };
}

/** Land `count` Captures, each on its own Thread, filed into `projectId`. */
async function accrue(
  threads: ThreadRepository,
  projectId: string,
  count: number,
  prefix = "thread",
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}-${projectId}-${index}`;
    await threads.upsertCaptures(USER, [
      {
        id: `capture-${id}`,
        threadId: id,
        text: `Capture ${index}`,
        createdAt: new Date(Date.UTC(2026, 6, 1 + index)).toISOString(),
        location: null,
        sequence: index,
        idempotencyKey: `key-${id}`,
      },
    ]);
    await threads.fileThread(USER, id, { projectId, reviewedAt: null });
    ids.push(id);
  }
  return ids;
}

test.beforeEach(() => {
  resetMemoryWalkerMemoryRepository(NS);
  resetMemoryThreadRepository(NS);
});

test("a walker with nothing recurring is asked nothing", async () => {
  const deps = dependencies();
  const state = await readInterviewState(USER, deps);

  expect(state.proposals).toEqual([]);
  expect(state.complete).toBe(true);
});

test("a proposal below the threshold stays silent", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(USER, "Token Pool");
  await accrue(deps.threads, proposal.id, PROJECT_PROPOSAL_THRESHOLD - 1);

  const state = await readInterviewState(USER, deps);

  expect(state.proposals).toEqual([]);
  expect(state.complete).toBe(true);
});

test("the proposal with the most Threads is raised first, with its Threads", async () => {
  const deps = dependencies();
  const small = await deps.threads.proposeProject(USER, "focus.ai");
  const large = await deps.threads.proposeProject(USER, "Token Pool");
  await accrue(deps.threads, small.id, PROJECT_PROPOSAL_THRESHOLD, "s");
  await accrue(deps.threads, large.id, PROJECT_PROPOSAL_THRESHOLD + 3, "l");

  const state = await readInterviewState(USER, deps);

  expect(state.complete).toBe(false);
  expect(state.proposals.map((proposal) => proposal.name)).toEqual([
    "Token Pool",
    "focus.ai",
  ]);
  expect(state.proposals[0].threadCount).toBe(PROJECT_PROPOSAL_THRESHOLD + 3);
  expect(state.proposals[0].threads).toHaveLength(
    PROJECT_PROPOSAL_THRESHOLD + 3,
  );
});

test("confirming makes it a Project and leaves every Thread unreviewed", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(USER, "Token Pool");
  const threadIds = await accrue(
    deps.threads,
    proposal.id,
    PROJECT_PROPOSAL_THRESHOLD,
  );

  const state = await advanceInterview(
    USER,
    { projectId: proposal.id, confirm: true },
    deps,
  );

  expect(state.proposals).toEqual([]);
  const projects = await deps.threads.listProjects(USER);
  expect(projects.map((project) => project.name)).toEqual(["Token Pool"]);

  // Knowing what the pile is called is not the same as having read it.
  const threads = await deps.threads.listThreads(USER);
  for (const id of threadIds) {
    const thread = threads.find((candidate) => candidate.id === id);
    expect(thread?.reviewedAt ?? null).toBeNull();
    expect(thread?.projectId).toBe(proposal.id);
  }
});

test("confirming can rename a name coined from one early Thread", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(
    USER,
    "Per-user token billing",
  );
  await accrue(deps.threads, proposal.id, PROJECT_PROPOSAL_THRESHOLD);

  await advanceInterview(
    USER,
    { projectId: proposal.id, confirm: true, name: "Token Pool" },
    deps,
  );

  const projects = await deps.threads.listProjects(USER);
  expect(projects.map((project) => project.name)).toEqual(["Token Pool"]);
});

test("rejecting releases unreviewed Threads and keeps the walker's own filing", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(USER, "Trail maps");
  const threadIds = await accrue(
    deps.threads,
    proposal.id,
    PROJECT_PROPOSAL_THRESHOLD,
  );
  // The walker filed one of them there deliberately.
  await deps.threads.fileThread(USER, threadIds[0], {
    projectId: proposal.id,
    reviewedAt: "2026-07-26T10:00:00.000Z",
  });

  await advanceInterview(USER, { projectId: proposal.id, confirm: false }, deps);

  const threads = await deps.threads.listThreads(USER);
  expect(
    threads.find((thread) => thread.id === threadIds[0])?.projectId,
  ).toBe(proposal.id);
  for (const id of threadIds.slice(1)) {
    expect(threads.find((thread) => thread.id === id)?.projectId ?? null).toBeNull();
  }
});

test("a rejected proposal is never raised again, and is never re-proposed", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(USER, "Trail maps");
  await accrue(deps.threads, proposal.id, PROJECT_PROPOSAL_THRESHOLD);

  const after = await advanceInterview(
    USER,
    { projectId: proposal.id, confirm: false },
    deps,
  );
  expect(after.proposals).toEqual([]);
  expect(after.complete).toBe(true);

  // Re-proposing the same name returns the rejected row rather than a new one.
  const again = await deps.threads.proposeProject(USER, "Trail maps");
  expect(again.id).toBe(proposal.id);
  expect(again.state).toBe("rejected");
  expect(await deps.threads.listProposedProjects(USER)).toEqual([]);
  expect(await deps.threads.listRejectedProjectNames(USER)).toEqual([
    "Trail maps",
  ]);
});

test("a Proposed Project never reads as one of the walker's Projects", async () => {
  const deps = dependencies();
  await deps.threads.proposeProject(USER, "Token Pool");
  await deps.threads.createProject(USER, "Cornwall Market");

  const projects = await deps.threads.listProjects(USER);

  expect(projects.map((project) => project.name)).toEqual(["Cornwall Market"]);
  expect(projects.every((project) => project.state === "confirmed")).toBe(true);
});

test("the Interview writes Projects and never a Memory Patch", async () => {
  const deps = dependencies();
  const proposal = await deps.threads.proposeProject(USER, "Token Pool");
  await accrue(deps.threads, proposal.id, PROJECT_PROPOSAL_THRESHOLD);

  await advanceInterview(
    USER,
    { projectId: proposal.id, confirm: true, name: "Token Pool" },
    deps,
  );
  const rejected = await deps.threads.proposeProject(USER, "Trail maps");
  await advanceInterview(USER, { projectId: rejected.id, confirm: false }, deps);

  expect(await deps.memories.listPatches(USER)).toEqual([]);
  expect(await deps.memories.listMemories(USER)).toEqual([]);
});
