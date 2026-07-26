import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  buildEnrichmentPrompt,
  parseGatewayText,
} from "@/lib/enrichment/system-instruction";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";
import type { ThreadRepository } from "@/lib/sync/types";

const NS = "enrichment-proposal-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

function promptFor(input: {
  projects?: string[];
  proposedProjects?: string[];
  rejectedProjects?: string[];
}): string {
  return buildEnrichmentPrompt({
    threadTitle: "Thread",
    history: [],
    targetCaptureIds: ["cap-1"],
    requestTitle: false,
    ...input,
  });
}

async function capture(
  threads: ThreadRepository,
  userId: string,
  id: string,
  text: string,
) {
  await threads.upsertCaptures(userId, [
    {
      id,
      text,
      createdAt: "2026-07-24T09:52:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
}

test("PROPOSE is split off the body like any other header", () => {
  const parsed = parseGatewayText(
    [
      "TITLE: Token pool as a billing backend",
      "KIND: idea",
      "PROPOSE: Token Pool Backend",
      "",
      "**The idea.** A shared token backend other projects plug into.",
    ].join("\n"),
    true,
  );

  expect(parsed.propose).toBe("Token Pool Backend");
  expect(parsed.project).toBeNull();
  expect(parsed.text).toBe(
    "**The idea.** A shared token backend other projects plug into.",
  );
});

test("a rambling Project name is cut to the store's length", () => {
  const parsed = parseGatewayText(
    [`PROPOSE: ${"a".repeat(200)}`, "", "Body."].join("\n"),
    false,
  );

  expect(parsed.propose).toHaveLength(60);
});

test("a report with neither header proposes and joins nothing", () => {
  const parsed = parseGatewayText(["KIND: place", "", "Body."].join("\n"), false);

  expect(parsed.project).toBeNull();
  expect(parsed.propose).toBeNull();
});

test("confirmed and proposed Projects are offered as one list to join", () => {
  const prompt = promptFor({
    projects: ["Cornwall Market"],
    proposedProjects: ["Token Pool Backend"],
  });

  expect(prompt).toContain("Cornwall Market, Token Pool Backend");
  expect(prompt).toContain("prefer joining one of these");
});

test("PROPOSE is offered even when the walker has no Projects at all", () => {
  // The dead loop: PROJECT: was suppressed on an empty list, so an empty list
  // could never stop being empty.
  const prompt = promptFor({});

  expect(prompt).toContain("`PROPOSE: `");
  expect(prompt).not.toContain("`PROJECT: `");
});

test("rejected names are named in the prompt as names not to propose", () => {
  const prompt = promptFor({ rejectedProjects: ["Trail maps"] });

  expect(prompt).toContain("the walker has rejected them — Trail maps");
});

test("PROPOSE coins a Proposed Project and the Thread accrues to it", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await capture(
    threads,
    "user_a",
    "cap-idea",
    "We should build pool as a token back end for various projects",
  );

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "**The idea.** A shared token backend.",
      kind: "idea" as const,
      propose: "Token Pool Backend",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const threadId = result.results[0]!.threadId;
  const proposals = await threads.listProposedProjects("user_a");
  expect(proposals.map((proposal) => proposal.name)).toEqual([
    "Token Pool Backend",
  ]);
  expect(proposals[0].threadCount).toBe(1);
  expect(proposals[0].threads[0].id).toBe(threadId);

  // It is a guess, not a decision the walker made.
  expect(await threads.listProjects("user_a")).toEqual([]);
});

test("a second Thread joins the existing proposal instead of coining a rival", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await capture(threads, "user_b", "cap-1", "Token factories and resellers");

  await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report one.",
      propose: "Token Pool Backend",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  await capture(threads, "user_b", "cap-2", "Per-user token billing with Stripe");
  await processPendingEnrichments("user_b", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report two.",
      project: "Token Pool Backend",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const proposals = await threads.listProposedProjects("user_b");
  expect(proposals).toHaveLength(1);
  expect(proposals[0].threadCount).toBe(2);
});

test("PROPOSE naming something already known joins it rather than duplicating", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const project = await threads.createProject("user_c", "Cornwall Market");
  await capture(threads, "user_c", "cap-1", "Order more pastry boxes");

  const result = await processPendingEnrichments("user_c", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report.",
      propose: "cornwall market",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(await threads.listProposedProjects("user_c")).toEqual([]);
  const thread = (await threads.listThreads("user_c")).find(
    (candidate) => candidate.id === result.results[0]!.threadId,
  );
  expect(thread?.projectId).toBe(project.id);
});

test("a name the walker rejected is never filed into again", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const rejected = await threads.proposeProject("user_d", "Trail maps");
  await threads.settleProject("user_d", rejected.id, { state: "rejected" });
  await capture(threads, "user_d", "cap-1", "Waymarked Trails looks useful");

  const result = await processPendingEnrichments("user_d", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report.",
      propose: "Trail maps",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const thread = (await threads.listThreads("user_d")).find(
    (candidate) => candidate.id === result.results[0]!.threadId,
  );
  expect(thread?.projectId ?? null).toBeNull();
  expect(await threads.listProposedProjects("user_d")).toEqual([]);
});

test("a Thread the walker already filed is left alone", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const mine = await threads.createProject("user_e", "Cornwall Market");
  await capture(threads, "user_e", "cap-1", "Token factories and resellers");
  const threadId = (await threads.listThreads("user_e"))[0].id;
  await threads.fileThread("user_e", threadId, {
    projectId: mine.id,
    reviewedAt: "2026-07-26T10:00:00.000Z",
  });

  await processPendingEnrichments("user_e", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report.",
      propose: "Token Pool Backend",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const thread = (await threads.listThreads("user_e")).find(
    (candidate) => candidate.id === threadId,
  );
  expect(thread?.projectId).toBe(mine.id);
});

test("a proposal store that is unavailable costs the proposal, never the report", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await capture(threads, "user_f", "cap-1", "Token factories and resellers");

  const failing: ThreadRepository = {
    ...threads,
    async proposeProject() {
      throw new Error("proposal_store_unavailable");
    },
  };

  const result = await processPendingEnrichments("user_f", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "**The idea.** A shared token backend.",
      propose: "Token Pool Backend",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: failing,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const stored = await enrichment.listThreadEnrichments(
    "user_f",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.text).toContain("A shared token backend");
});
