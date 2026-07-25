import { expect, test } from "@playwright/test";
import { MAX_ENRICHMENT_ATTEMPTS } from "@/lib/enrichment/failures";
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

test("media the model cannot read stops retrying, and a capable model picks it up", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await blobs.put({
    userId: "user_b",
    attachmentId: "att-video",
    mimeType: "video/mp4",
    bytes: new Uint8Array([1, 2, 3]),
    operationId: "op-video",
  });
  await threads.upsertCaptures("user_b", [
    {
      id: "cap-video",
      text: "",
      createdAt: "2026-07-20T16:12:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-video",
      attachments: [
        {
          id: "att-video",
          kind: "video",
          mimeType: "video/mp4",
          fileName: "walk.mp4",
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
  // Sonnet reads images, not video.
  const textOnly = {
    ...options,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
  };

  const first = await processPendingEnrichments("user_b", enrichment, textOnly);
  expect(first.results[0]?.reason).toContain("unsupported_media_video");
  expect(first.results[0]?.retryable).toBe(false);

  const failedJob = first.jobs.find((job) => job.status === "failed")!;
  const attemptsAfterFirst = failedJob.attempts;

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await processPendingEnrichments("user_b", enrichment, {
      ...textOnly,
      retryFailed: true,
    });
  }
  const stalled = (await enrichment.listOpenJobs("user_b")).find(
    (job) => job.id === failedJob.id,
  );
  expect(stalled?.status).toBe("failed");
  expect(stalled?.attempts).toBe(attemptsAfterFirst);

  // Switching to a model that reads video is how the walker recovers it.
  const capable = await processPendingEnrichments("user_b", enrichment, {
    ...options,
    environment: { AI_GATEWAY_MODEL: "google/gemini-2.5-flash" },
  });
  expect(capable.results.some((result) => result.status === "complete")).toBe(
    true,
  );
});

test("a job that keeps failing stops being requeued at the attempt cap", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);

  await threads.upsertCaptures("user_c", [
    {
      id: "cap-flaky",
      text: "Why is it dark at night when there are so many stars",
      createdAt: "2026-07-19T09:30:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-flaky",
      attachments: [],
    },
  ]);

  const options = {
    gateway: createFakeGatewayClient(async () => {
      throw new Error("gateway_unavailable");
    }),
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
    retryFailed: true,
  };

  // Well past the cap: the queue must give up rather than burn budget forever.
  for (let cycle = 0; cycle < MAX_ENRICHMENT_ATTEMPTS + 10; cycle += 1) {
    await processPendingEnrichments("user_c", enrichment, options);
  }

  const job = (await enrichment.listOpenJobs("user_c"))[0];
  expect(job?.status).toBe("failed");
  expect(job?.attempts).toBe(MAX_ENRICHMENT_ATTEMPTS);
  expect(await enrichment.requeueFailed("user_c")).toBe(0);
});
