import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { createFakePlaceResolver } from "@/lib/enrichment/place";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { createFakeWebSearchClient } from "@/lib/enrichment/search";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "enrichment-media-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

test("unsupported media needs attention without calling the gateway or switching models", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);
  let gatewayCalls = 0;

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-audio",
      text: "Owl call recording",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-audio",
      attachments: [
        {
          id: "att-audio",
          kind: "audio",
          mimeType: "audio/webm",
          fileName: "owl.webm",
        },
      ],
    },
  ]);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-audio",
    mimeType: "audio/webm",
    bytes: new Uint8Array([1, 2, 3]),
    operationId: "op-audio",
  });

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => {
      gatewayCalls += 1;
      return { text: "should not run", model: "switched-model" };
    }),
    blobStore: blobs,
    environment: {
      AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5",
    },
    threadRepository: threads,
  });

  expect(gatewayCalls).toBe(0);
  expect(result.results[0]?.status).toBe("needs_attention");
  expect(result.results[0]?.reason).toContain("unsupported_media_audio");
});

test("image Enrichment passes original bytes, place context, and retained sources", async () => {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), "tests/fixtures/enrichment/image-identification.json"),
      "utf8",
    ),
  ) as {
    model: string;
    searchResults: Array<{
      title: string;
      url: string;
      snippet: string;
      retrievedAt: string;
    }>;
    enrichmentText: string;
  };

  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);
  const original = new Uint8Array([9, 8, 7, 6]);
  let seenMediaLength = 0;
  let seenPrompt = "";

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-photo",
      text: "Large owl on a branch",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: { latitude: 45.5, longitude: -122.7, accuracy: 12 },
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-photo",
      attachments: [
        {
          id: "att-photo",
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "owl.jpg",
        },
      ],
    },
  ]);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-photo",
    mimeType: "image/jpeg",
    bytes: original,
    operationId: "op-photo",
  });

  const result = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      seenMediaLength = input.media[0]?.bytes.byteLength ?? 0;
      seenPrompt = input.prompt;
      const sources = input.search
        ? (await input.search.search("barred owl")).map((hit) => ({
            title: hit.title,
            url: hit.url,
            retrievedAt: hit.retrievedAt,
          }))
        : [];
      return {
        text: fixture.enrichmentText,
        model: input.model,
        title: "Creek owl",
        sources,
      };
    }),
    blobStore: blobs,
    placeResolver: createFakePlaceResolver([
      {
        name: "Forest Park Trailhead",
        latitude: 45.5,
        longitude: -122.7,
      },
    ]),
    search: createFakeWebSearchClient(async () => fixture.searchResults),
    environment: { AI_GATEWAY_MODEL: fixture.model },
    threadRepository: threads,
  });

  expect(result.results[0]?.status).toBe("complete");
  expect(seenMediaLength).toBe(original.byteLength);
  expect(seenPrompt).toContain("45.50000");
  expect(seenPrompt).toContain("Forest Park Trailhead");
  expect(seenPrompt).toContain("image:owl.jpg");

  const stored = await enrichment.listThreadEnrichments("user_a", "cap-photo");
  expect(stored).toHaveLength(1);
  expect(stored[0]?.text).toBe(fixture.enrichmentText);
  expect(stored[0]?.model).toBe(fixture.model);
  expect(stored[0]?.sources).toEqual([
    {
      title: fixture.searchResults[0].title,
      url: fixture.searchResults[0].url,
      retrievedAt: fixture.searchResults[0].retrievedAt,
    },
  ]);
});

test("behavior suite covers reflection, research, ambiguity, and blocked media", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-text",
      text: "What plant is this? Leaves look like poison oak but I'm unsure.",
      createdAt: "2026-07-18T13:00:00.000Z",
      location: null,
      threadId: "thread-text",
      sequence: 1,
      idempotencyKey: "cap-text",
      attachments: [],
    },
  ]);

  const researched = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async (input) => {
      const sources = input.search
        ? (await input.search.search("poison oak")).map((hit) => ({
            title: hit.title,
            url: hit.url,
            retrievedAt: hit.retrievedAt,
          }))
        : [];
      return {
        text: "Possibly poison oak; assume Western Cascade foothills. If leaflets are shiny and in threes, avoid contact.",
        model: input.model,
        sources,
      };
    }),
    search: createFakeWebSearchClient(async () => [
      {
        title: "Poison oak guide",
        url: "https://example.test/poison-oak",
        snippet: "Leaves of three",
        retrievedAt: "2026-07-18T13:01:00.000Z",
      },
    ]),
    blobStore: blobs,
    threadRepository: threads,
  });
  expect(researched.results[0]?.status).toBe("complete");
  const textEnrichments = await enrichment.listThreadEnrichments(
    "user_a",
    "thread-text",
  );
  expect(textEnrichments[0]?.sources[0]?.title).toBe("Poison oak guide");

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-video",
      text: "Trail video",
      createdAt: "2026-07-18T14:00:00.000Z",
      location: null,
      threadId: "thread-video",
      sequence: 1,
      idempotencyKey: "cap-video",
      attachments: [
        {
          id: "att-video",
          kind: "video",
          mimeType: "video/mp4",
          fileName: "trail.mp4",
        },
      ],
    },
  ]);
  await blobs.put({
    userId: "user_a",
    attachmentId: "att-video",
    mimeType: "video/mp4",
    bytes: new Uint8Array([4, 5]),
    operationId: "op-video",
  });

  const blocked = await processPendingEnrichments("user_a", enrichment, {
    gateway: createFakeGatewayClient(async () => ({ text: "nope" })),
    blobStore: blobs,
    environment: { AI_GATEWAY_MODEL: "anthropic/claude-sonnet-5" },
    threadRepository: threads,
  });
  expect(blocked.results.find((row) => row.id === "cap-video")?.status).toBe(
    "needs_attention",
  );
});
