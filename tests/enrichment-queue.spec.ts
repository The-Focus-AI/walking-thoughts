import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-queue-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

function seedCapture(id: string, text: string) {
  return {
    id,
    text,
    createdAt: "2026-07-27T10:00:00.000Z",
    location: null,
    threadId: null,
    sequence: 1,
    idempotencyKey: id,
    attachments: [],
  };
}

test("one process call runs a bounded batch and leaves the rest queued", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures(
    "user_batch",
    ["one", "two", "three", "four", "five"].map((word) =>
      seedCapture(`cap-${word}`, `Thought ${word}`),
    ),
  );

  const options = {
    gateway: createFakeGatewayClient(),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  };

  const first = await processPendingEnrichments("user_batch", enrichment, options);
  const completed = first.results.filter(
    (result) => result.status === "complete",
  );
  expect(completed).toHaveLength(3);
  const stillQueued = first.jobs.filter((job) => job.status === "queued");
  expect(stillQueued).toHaveLength(2);

  // The next call drains what the first one left.
  const second = await processPendingEnrichments(
    "user_batch",
    enrichment,
    options,
  );
  expect(
    second.results.filter((result) => result.status === "complete"),
  ).toHaveLength(2);
  expect(await enrichment.listOpenJobs("user_batch")).toHaveLength(0);
});

test("a fresh Capture runs before a herd of retried failures", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures(
    "user_order",
    ["alpha", "beta", "gamma"].map((word) =>
      seedCapture(`cap-${word}`, `Old thought ${word}`),
    ),
  );

  // The gateway was down: three failed jobs, each with an attempt spent.
  const down = createFakeGatewayClient(async () => {
    throw new Error("gateway_down");
  });
  await processPendingEnrichments("user_order", enrichment, {
    gateway: down,
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  });
  await enrichment.requeueFailed("user_order");

  // The walker takes one more Capture, then everything retries together.
  await threads.upsertCaptures("user_order", [
    seedCapture("cap-new", "Just noticed this"),
  ]);
  const result = await processPendingEnrichments("user_order", enrichment, {
    gateway: createFakeGatewayClient(),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  });

  // The new Capture made it into the bounded batch ahead of the retries.
  const fresh = result.results.find((entry) => entry.id === "cap-new");
  expect(fresh?.status).toBe("complete");
  expect(
    result.jobs.filter((job) => job.status === "queued"),
  ).toHaveLength(1);
});

test("a job another call is running right now is left alone", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures("user_lease", [
    seedCapture("cap-held", "Claimed elsewhere"),
  ]);

  // First call fails the job; requeue it, then claim it the way a live
  // concurrent invocation would.
  await processPendingEnrichments("user_lease", enrichment, {
    gateway: createFakeGatewayClient(async () => {
      throw new Error("gateway_down");
    }),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  });
  await enrichment.requeueFailed("user_lease");
  const [job] = await enrichment.listOpenJobs("user_lease");
  const claimed = await enrichment.markJobRunning("user_lease", job.id);
  expect(claimed.startedAt).toBeTruthy();

  const result = await processPendingEnrichments("user_lease", enrichment, {
    gateway: createFakeGatewayClient(),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  });

  // Nothing ran: the fresh claim marks it as another call's work.
  expect(result.results.filter((r) => r.status === "complete")).toHaveLength(0);
  const [after] = await enrichment.listOpenJobs("user_lease");
  expect(after.status).toBe("running");
  expect(after.attempts).toBe(claimed.attempts);
});

test("a running job with no claim stamp is an orphan and gets re-claimed", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures("user_orphan", [
    seedCapture("cap-orphan", "Left running by a killed invocation"),
  ]);
  const [thread] = await threads.listThreads("user_orphan");
  await enrichment.getOrCreateJob("user_orphan", {
    id: "job-orphan",
    idempotencyKey: `enrich:${thread.id}:r${thread.revision}`,
    threadId: thread.id,
    basisRevision: thread.revision,
    basisEntryIds: ["cap-orphan"],
    basisHistory: [],
    targetCaptureIds: ["cap-orphan"],
    model: "anthropic/claude-sonnet-5",
    status: "running",
  });

  const result = await processPendingEnrichments("user_orphan", enrichment, {
    gateway: createFakeGatewayClient(),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  });

  const recovered = result.results.find((entry) => entry.id === "cap-orphan");
  expect(recovered?.status).toBe("complete");
  expect(await enrichment.listOpenJobs("user_orphan")).toHaveLength(0);
});
