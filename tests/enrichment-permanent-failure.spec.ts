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

const NS = "enrichment-permanent-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

test("missing original media fails permanently instead of retrying forever", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  // The attachment metadata synced but its blob never reached the server.
  await threads.upsertCaptures("user_a", [
    {
      id: "cap-lost",
      text: "Voice note that lost its audio",
      createdAt: "2026-07-19T10:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-lost",
      attachments: [
        {
          id: "att-lost",
          kind: "audio",
          mimeType: "audio/webm",
          fileName: "lost.webm",
        },
      ],
    },
  ]);

  const options = {
    gateway: createFakeGatewayClient(),
    blobStore: blobs,
    threadRepository: threads,
    pushSender: null,
  };

  const first = await processPendingEnrichments("user_a", enrichment, options);
  expect(first.results[0]?.status).toBe("needs_attention");
  expect(first.results[0]?.reason).toContain("missing_original_media");
  expect(first.results[0]?.retryable).toBe(false);

  const failedJob = first.jobs.find((job) => job.status === "failed");
  expect(failedJob).toBeTruthy();
  const attemptsAfterFirst = failedJob!.attempts;

  // Subsequent cycles with retryFailed must not resurrect the job.
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await processPendingEnrichments("user_a", enrichment, {
      ...options,
      retryFailed: true,
    });
  }

  const openJobs = await enrichment.listOpenJobs("user_a");
  const still = openJobs.find((job) => job.id === failedJob!.id);
  expect(still?.status).toBe("failed");
  expect(still?.attempts).toBe(attemptsAfterFirst);

  // Even an explicit single-job requeue refuses: the media is gone.
  const requeued = await enrichment.requeueFailed("user_a", failedJob!.id);
  expect(requeued).toBe(0);
});
