import { expect, test } from "@playwright/test";
import { artifactsByThread } from "@/lib/artifacts/client";
import {
  createMemoryArtifactRepository,
  resetMemoryArtifactRepository,
} from "@/lib/artifacts/memory-repository";
import { artifactIdForEnrichment } from "@/lib/artifacts/types";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { parseGatewayText } from "@/lib/enrichment/system-instruction";
import {
  draftCandidates,
  journalThreads,
  notebookEntry,
} from "@/lib/journal/notebook";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "journal-notebook-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryArtifactRepository(NS);
  resetMemoryBlobStore(NS);
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
      createdAt: "2026-08-07T07:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
  return id;
}

/**
 * Acceptance: routing a Thread to Journal makes it appear as a notebook
 * entry — the walker's words with the full Enrichment report readable in
 * place.
 */
test("routing a Thread to Journal files it into the notebook with its report", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedThread(
    threads,
    "t-dark",
    "Why is it dark at night when there are so many stars?",
  );

  await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "You've rediscovered Olbers' paradox — the darkness is data.",
      title: "Why the night sky is dark",
      kind: "question" as const,
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  await threads.fileThread("user_a", "t-dark", {
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "journal",
  });

  const routed = journalThreads(await threads.listThreads("user_a"));
  expect(routed.map((thread) => thread.id)).toEqual(["t-dark"]);

  const entry = notebookEntry(routed[0], {
    captures: routed[0].captures,
    enrichments: await enrichment.listThreadEnrichments("user_a", "t-dark"),
  });
  expect(entry.routedAt).toBe("2026-08-08T09:00:00.000Z");
  expect(entry.words).toEqual([
    "Why is it dark at night when there are so many stars?",
  ]);
  expect(entry.report?.text).toContain("Olbers' paradox");
});

/** A Thread routed anywhere else is not a notebook entry. */
test("the notebook holds journal-routed Threads only, newest settled first", async () => {
  const threads = createMemoryThreadRepository(NS);
  await seedThread(threads, "t-a", "First observation");
  await seedThread(threads, "t-b", "Call the doctor");
  await seedThread(threads, "t-c", "Second observation");

  await threads.fileThread("user_a", "t-a", {
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "journal",
  });
  await threads.fileThread("user_a", "t-b", {
    reviewedAt: "2026-08-08T09:01:00.000Z",
    route: "todo",
  });
  await threads.fileThread("user_a", "t-c", {
    reviewedAt: "2026-08-08T09:02:00.000Z",
    route: "journal",
  });

  const routed = journalThreads(await threads.listThreads("user_a"));
  expect(routed.map((thread) => thread.id)).toEqual(["t-c", "t-a"]);
});

/**
 * Acceptance: draft-worthy entries carry a visible flag and can be listed
 * together. The flag rides the Enrichment's DRAFT header end to end.
 */
test("the DRAFT header marks a post candidate and round-trips to the queue", async () => {
  expect(
    parseGatewayText(
      ["KIND: observation", "DRAFT: yes", "", "Reads like a post."].join("\n"),
      false,
    ).draftWorthy,
  ).toBe(true);
  expect(
    parseGatewayText(["KIND: question", "", "Body."].join("\n"), false)
      .draftWorthy,
  ).toBe(false);

  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedThread(
    threads,
    "t-draft",
    "The streams of tokens will wash away the differences.",
  );
  await seedThread(threads, "t-plain", "Who stacked these walls?");

  await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => ({
      text: input.prompt.includes("streams of tokens")
        ? "The idea has a name: homogenization pressure."
        : "Probably a farmer clearing the field.",
      kind: "observation" as const,
      draftWorthy: input.prompt.includes("streams of tokens"),
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  for (const id of ["t-draft", "t-plain"]) {
    await threads.fileThread("user_a", id, {
      reviewedAt: "2026-08-08T09:00:00.000Z",
      route: "journal",
    });
  }

  const routed = journalThreads(await threads.listThreads("user_a"));
  const entries = await Promise.all(
    routed.map(async (thread) =>
      notebookEntry(thread, {
        captures: thread.captures,
        enrichments: await enrichment.listThreadEnrichments(
          "user_a",
          thread.id,
        ),
      }),
    ),
  );

  const flagged = entries.find((entry) => entry.threadId === "t-draft");
  const plain = entries.find((entry) => entry.threadId === "t-plain");
  expect(flagged?.draftWorthy).toBe(true);
  expect(plain?.draftWorthy).toBe(false);
  expect(draftCandidates(entries).map((entry) => entry.threadId)).toEqual([
    "t-draft",
  ]);
});

/** Acceptance: the entry links to the Thread and to its Artifact page. */
test("an entry carries its Thread and its published Artifact page", async () => {
  const threads = createMemoryThreadRepository(NS);
  const artifacts = createMemoryArtifactRepository(NS);
  await seedThread(threads, "t-page", "Why is the night sky dark?");
  await threads.fileThread("user_a", "t-page", {
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "journal",
  });

  const artifactId = artifactIdForEnrichment("enrichment:job-1");
  await artifacts.saveArtifact("user_a", {
    id: artifactId,
    threadId: "t-page",
    enrichmentId: "enrichment:job-1",
    title: "Why the night sky is dark",
    standfirst: null,
    kind: "question",
    body: "<p>Olbers' paradox.</p>",
    sources: [],
    model: "test",
    createdAt: "2026-08-08T08:00:00.000Z",
  });

  const pages = artifactsByThread(await artifacts.listArtifacts("user_a"));
  const routed = journalThreads(await threads.listThreads("user_a"));
  const entry = notebookEntry(routed[0], {
    captures: routed[0].captures,
    artifactId: pages.get("t-page")?.id ?? null,
  });
  expect(entry.threadId).toBe("t-page");
  expect(entry.artifactId).toBe(artifactId);
});

/**
 * Acceptance: un-routing removes the entry without touching the Thread's
 * history — the Captures and Enrichments all stay.
 */
test("un-routing removes the entry and leaves the Thread's history whole", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  await seedThread(threads, "t-undo", "Morning fog over the pasture");

  await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Radiation fog, burning off by nine.",
      kind: "observation" as const,
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  await threads.fileThread("user_a", "t-undo", {
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "journal",
  });
  expect(
    journalThreads(await threads.listThreads("user_a")).map((t) => t.id),
  ).toEqual(["t-undo"]);

  // The desk's undo: the route clears, the Thread goes back to the pile.
  await threads.fileThread("user_a", "t-undo", {
    reviewedAt: null,
    route: null,
  });

  expect(journalThreads(await threads.listThreads("user_a"))).toEqual([]);
  const thread = (await threads.listThreads("user_a")).find(
    (candidate) => candidate.id === "t-undo",
  );
  expect(thread?.captures.map((capture) => capture.text)).toEqual([
    "Morning fog over the pasture",
  ]);
  const kept = await enrichment.listThreadEnrichments("user_a", "t-undo");
  expect(kept).toHaveLength(1);
  expect(kept[0].text).toContain("Radiation fog");
});
