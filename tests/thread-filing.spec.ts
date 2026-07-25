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
