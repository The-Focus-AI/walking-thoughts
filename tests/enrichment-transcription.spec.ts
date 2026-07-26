import { expect, test } from "@playwright/test";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { createFakeTranscriptionClient } from "@/lib/enrichment/transcription";
import type { GatewayGenerateInput } from "@/lib/enrichment/types";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-transcription-tests";

const SPOKEN = "The larch by the second gate is turning gold already";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

async function seedAudioCapture(userId: string) {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures(userId, [
    {
      id: "cap-held",
      text: "",
      createdAt: "2026-07-25T08:15:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-held",
      attachments: [
        {
          id: "att-held",
          kind: "audio",
          mimeType: "audio/webm",
          fileName: "audio-1753431300000.webm",
        },
      ],
    },
  ]);
  await blobs.put({
    userId,
    attachmentId: "att-held",
    mimeType: "audio/webm",
    bytes: new Uint8Array([9, 9, 9]),
    operationId: "op-held",
  });

  return { threads, enrichment, blobs };
}

test("a held audio Capture is transcribed before a model that cannot hear it", async () => {
  const { threads, enrichment, blobs } = await seedAudioCapture("user_hold");
  const calls: GatewayGenerateInput[] = [];

  const result = await processPendingEnrichments("user_hold", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      calls.push(input);
      return { text: "The larch is European; gold in October.", model: input.model };
    }),
    transcriber: createFakeTranscriptionClient(() => SPOKEN, "test-stt"),
    blobStore: blobs,
    // Sonnet reads text and images only — audio would have failed the job.
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");

  // The recording never reached the model; the words did.
  expect(calls).toHaveLength(1);
  expect(calls[0]?.media).toHaveLength(0);
  expect(calls[0]?.prompt).toContain(SPOKEN);
  expect(calls[0]?.prompt).toContain("audio-1753431300000.webm");

  // And the walker gets their own words back, credited to what heard them.
  const stored = await enrichment.listThreadEnrichments(
    "user_hold",
    result.results[0]!.threadId,
  );
  expect(stored[0]?.transcripts?.[0]).toMatchObject({
    attachmentId: "att-held",
    captureId: "cap-held",
    text: SPOKEN,
    model: "test-stt",
  });
});

test("a Capture holding both a photo and a recording sends the photo and speaks the rest", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);
  const calls: GatewayGenerateInput[] = [];

  await threads.upsertCaptures("user_both", [
    {
      id: "cap-both",
      text: "",
      createdAt: "2026-07-25T09:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-both",
      attachments: [
        {
          id: "att-photo",
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "larch.jpg",
        },
        {
          id: "att-said",
          kind: "audio",
          mimeType: "audio/webm",
          fileName: "audio-2.webm",
        },
      ],
    },
  ]);
  for (const [attachmentId, mimeType] of [
    ["att-photo", "image/jpeg"],
    ["att-said", "audio/webm"],
  ]) {
    await blobs.put({
      userId: "user_both",
      attachmentId,
      mimeType,
      bytes: new Uint8Array([7, 7]),
      operationId: `op-${attachmentId}`,
    });
  }

  const result = await processPendingEnrichments("user_both", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      calls.push(input);
      return { text: "A European larch.", model: input.model };
    }),
    transcriber: createFakeTranscriptionClient(() => SPOKEN, "test-stt"),
    blobStore: blobs,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  // The photograph travels as bytes because Sonnet reads images; the
  // recording travels as words because no gateway model reads audio.
  expect(calls[0]?.media.map((part) => part.kind)).toEqual(["image"]);
  expect(calls[0]?.prompt).toContain(SPOKEN);
});

test("audio the old pipeline refused is picked up once transcription exists", async () => {
  const { threads, enrichment, blobs } = await seedAudioCapture("user_stuck");
  const [thread] = await threads.listThreads("user_stuck");

  // The state production is in: a permanently failed job under the same model
  // the walker still runs, which nothing could requeue.
  const stuck = await enrichment.getOrCreateJob("user_stuck", {
    id: "job-stuck",
    idempotencyKey: `enrich:${thread.id}:r${thread.revision}`,
    threadId: thread.id,
    basisRevision: thread.revision,
    basisEntryIds: ["cap-held"],
    basisHistory: [],
    targetCaptureIds: ["cap-held"],
    model: "anthropic/claude-sonnet-5",
  });
  await enrichment.markJobFailed(
    "user_stuck",
    stuck.id,
    "model_anthropic/claude-sonnet-5_unsupported_media_audio",
  );

  const recovered = await processPendingEnrichments("user_stuck", enrichment, {
    gateway: createFakeGatewayClient(async (input) => ({
      text: "Gold by mid-October.",
      model: input.model,
    })),
    transcriber: createFakeTranscriptionClient(() => SPOKEN, "test-stt"),
    blobStore: blobs,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
    pushSender: null,
  });

  expect(
    recovered.results.some((result) => result.status === "complete"),
  ).toBe(true);

  // And it settles: the recovery runs once, not on every cycle after.
  let secondCycleCalls = 0;
  await processPendingEnrichments("user_stuck", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      secondCycleCalls += 1;
      return { text: "should not run twice", model: input.model };
    }),
    transcriber: createFakeTranscriptionClient(() => SPOKEN, "test-stt"),
    blobStore: blobs,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
    pushSender: null,
  });
  expect(secondCycleCalls).toBe(0);
  expect(
    await enrichment.listThreadEnrichments("user_stuck", thread.id),
  ).toHaveLength(1);
});

test("a transcription outage fails the job retryably instead of dropping words", async () => {
  const { threads, enrichment, blobs } = await seedAudioCapture("user_down");
  let gatewayCalls = 0;

  const result = await processPendingEnrichments("user_down", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      gatewayCalls += 1;
      return { text: "should not run", model: input.model };
    }),
    transcriber: {
      model: "test-stt",
      async transcribe() {
        throw new Error("gateway_503");
      },
    },
    blobStore: blobs,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
    pushSender: null,
  });

  expect(gatewayCalls).toBe(0);
  expect(result.results[0]?.status).toBe("needs_attention");
  expect(result.results[0]?.reason).toContain("transcription_unavailable");
  expect(result.results[0]?.retryable).toBe(true);
});
