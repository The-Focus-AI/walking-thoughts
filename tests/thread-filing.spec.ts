import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { parseGatewayText } from "@/lib/enrichment/system-instruction";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  routeForKind,
  verdictImpliedByRoute,
} from "@/lib/local-capture/types";
import { mergeRemoteThreads } from "@/lib/sync/hydrate";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "thread-filing-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
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
      createdAt: "2026-07-24T10:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: id,
      attachments: [],
    },
  ]);
  return id;
}

test("a Project is created once per name and lists back", async () => {
  const threads = createMemoryThreadRepository(NS);
  const first = await threads.createProject("user_a", "Umwelten");
  const again = await threads.createProject("user_a", "  Umwelten  ");
  const other = await threads.createProject("user_a", "Habitats");

  expect(again.id).toBe(first.id);
  expect((await threads.listProjects("user_a")).map((p) => p.name)).toEqual([
    "Habitats",
    "Umwelten",
  ]);
  expect(other.name).toBe("Habitats");
});

test("filing settles a Thread and takes it out of the New queue", async () => {
  const threads = createMemoryThreadRepository(NS);
  const project = await threads.createProject("user_a", "Umwelten");
  const id = await seedThread(threads, "t-1", "We should build the umwelten reader");

  const filed = await threads.fileThread("user_a", id, {
    kind: "idea",
    projectId: project.id,
    reviewedAt: "2026-07-25T18:00:00.000Z",
  });

  expect(filed?.kind).toBe("idea");
  expect(filed?.projectId).toBe(project.id);
  expect(filed?.projectName).toBe("Umwelten");
  expect(filed?.reviewedAt).toBe("2026-07-25T18:00:00.000Z");
});

test("just reading a Thread files it without changing what it is", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-2", "Why is the night sky dark");
  await threads.updateThreadClassification!("user_a", id, {
    kind: "question",
    topics: ["astronomy"],
    ask: null,
  });

  const filed = await threads.fileThread("user_a", id, {
    reviewedAt: "2026-07-25T18:00:00.000Z",
  });

  expect(filed?.reviewedAt).toBeTruthy();
  expect(filed?.kind).toBe("question");
  expect(filed?.projectId).toBeNull();
});

test("a later Enrichment never overrules what the walker filed", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-3", "Goldin scope");
  await threads.fileThread("user_a", id, {
    kind: "task",
    reviewedAt: "2026-07-25T18:00:00.000Z",
  });

  await threads.updateThreadClassification!("user_a", id, {
    kind: "question",
    topics: [],
    ask: "Who is Goldin?",
  });

  const thread = (await threads.listThreads("user_a")).find((t) => t.id === id);
  expect(thread?.kind).toBe("task");
  // The question still lands: a filed Thread can still be asked about.
  expect(thread?.ask).toBe("Who is Goldin?");
});

test("the Enrichment guesses a Project, but only one the walker made", () => {
  const known = parseGatewayText(
    [
      "KIND: idea",
      "PROJECT: Umwelten",
      "",
      "The reader could show each animal's sensory world.",
    ].join("\n"),
    false,
  );
  expect(known.project).toBe("Umwelten");

  const invented = parseGatewayText(
    ["KIND: idea", "", "Body."].join("\n"),
    false,
  );
  expect(invented.project).toBeNull();
});

test("the guess files an unfiled Thread and leaves a filed one alone", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const project = await threads.createProject("user_a", "Umwelten");
  await seedThread(threads, "t-4", "The umwelten reader should show sensory worlds");
  await seedThread(threads, "t-5", "Call the doctor");
  // The walker already filed the second Thread themselves.
  await threads.fileThread("user_a", "t-5", {
    kind: "task",
    reviewedAt: "2026-07-25T09:00:00.000Z",
  });

  await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Report.",
      title: "Umwelten reader",
      kind: "idea" as const,
      // The model answers with a name; only an exact match to the walker's
      // own list becomes a filing.
      project: "umwelten",
    })),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const all = await threads.listThreads("user_a");
  const guessed = all.find((thread) => thread.id === "t-4");
  const walkerFiled = all.find((thread) => thread.id === "t-5");

  expect(guessed?.projectId).toBe(project.id);
  // A guess is not a filing: the Thread is still waiting in New.
  expect(guessed?.reviewedAt ?? null).toBeNull();
  expect(walkerFiled?.projectId ?? null).toBeNull();
  expect(walkerFiled?.kind).toBe("task");
});

test("the Research Verdict files with the Thread and round-trips", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-verdict", "Who stacked these walls");

  const kept = await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-01T09:00:00.000Z",
    researchVerdict: "kept",
  });
  expect(kept?.researchVerdict).toBe("kept");
  expect(kept?.reviewedAt).toBe("2026-08-01T09:00:00.000Z");

  const listed = await threads.listThreads("user_a");
  expect(listed.find((t) => t.id === id)?.researchVerdict).toBe("kept");
  expect(await threads.getThreadResearchVerdict("user_a", id)).toBe("kept");
});

test("filing without a verdict leaves the settled one standing", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-verdict-keep", "Charcoal hearth flat");

  await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-01T09:00:00.000Z",
    researchVerdict: "dismissed",
  });
  // Refiling the kind says nothing about the research.
  const refiled = await threads.fileThread("user_a", id, {
    kind: "question",
    reviewedAt: "2026-08-01T09:05:00.000Z",
  });
  expect(refiled?.researchVerdict).toBe("dismissed");

  // An explicit null clears it back to unset.
  const cleared = await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-01T09:10:00.000Z",
    researchVerdict: null,
  });
  expect(cleared?.researchVerdict).toBeNull();
  expect(await threads.getThreadResearchVerdict("user_a", id)).toBeNull();
});

test("a Thread with no verdict reads as unset, not an error", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-verdict-unset", "Hawk over the clearcut");
  expect(await threads.getThreadResearchVerdict("user_a", id)).toBeNull();
  expect(await threads.getThreadResearchVerdict("user_a", "t-missing")).toBeNull();
});

test("settling a Route files the Thread and round-trips", async () => {
  const threads = createMemoryThreadRepository(NS);
  const id = await seedThread(threads, "t-route", "Pull scheduling out of Welton");

  const routed = await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-08T09:00:00.000Z",
    route: "spec",
  });
  expect(routed?.route).toBe("spec");
  expect(routed?.reviewedAt).toBe("2026-08-08T09:00:00.000Z");

  const listed = await threads.listThreads("user_a");
  expect(listed.find((t) => t.id === id)?.route).toBe("spec");

  // Refiling the kind says nothing about the route.
  const refiled = await threads.fileThread("user_a", id, {
    kind: "idea",
    reviewedAt: "2026-08-08T09:05:00.000Z",
  });
  expect(refiled?.route).toBe("spec");

  // An explicit null clears it back to unsettled.
  const cleared = await threads.fileThread("user_a", id, {
    reviewedAt: "2026-08-08T09:10:00.000Z",
    route: null,
  });
  expect(cleared?.route).toBeNull();
});

test("the Route implies the verdict: Journal keeps, Drop lets go", () => {
  // The mapping the review API applies when the filing names no verdict
  // outright (ADR 0017): the retraction gate reads what Drop implies.
  expect(verdictImpliedByRoute("journal")).toBe("kept");
  expect(verdictImpliedByRoute("drop")).toBe("dismissed");
  expect(verdictImpliedByRoute("spec")).toBeUndefined();
  expect(verdictImpliedByRoute("todo")).toBeUndefined();
  expect(verdictImpliedByRoute("timeline")).toBeUndefined();
});

test("every Kind proposes a Route; the unclassified propose the notebook", () => {
  expect(routeForKind("idea")).toBe("spec");
  expect(routeForKind("task")).toBe("todo");
  expect(routeForKind("question")).toBe("journal");
  expect(routeForKind("observation")).toBe("journal");
  expect(routeForKind("media")).toBe("journal");
  expect(routeForKind("place")).toBe("timeline");
  expect(routeForKind("noise")).toBe("drop");
  expect(routeForKind(null)).toBe("journal");
});

test("hydration adopts the Route the way it adopts the review decision", () => {
  const local = {
    id: "t-hydrate-route",
    title: "Morning cow",
    revision: 1,
    updatedAt: "2026-08-08T06:40:00.000Z",
    reviewedAt: null,
    route: null,
  };
  const merged = mergeRemoteThreads({
    localCaptures: [],
    localThreads: [local],
    remoteThreads: [
      {
        id: "t-hydrate-route",
        title: "Morning cow",
        revision: 1,
        updatedAt: "2026-08-08T06:40:00.000Z",
        reviewedAt: "2026-08-08T09:00:00.000Z",
        route: "timeline",
        captures: [],
      },
    ],
  });
  const thread = merged.threads.find((t) => t.id === "t-hydrate-route");
  expect(thread?.route).toBe("timeline");
  expect(thread?.reviewedAt).toBe("2026-08-08T09:00:00.000Z");
});
