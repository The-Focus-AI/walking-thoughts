import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAccountExportArchive } from "@/lib/export/create-account-export";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";
import { readZipStoreEntries } from "./helpers/read-zip-store";

function nodeSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const NS = "account-export-tests";
const USER = "user_export";
/** Known SHA-256 of [137, 80, 78, 71, 1, 2, 3, 4]. */
const FUNGUS_SHA256 =
  "cc1cdcbcf0bdb70801a2f0777e9f9c85571461df7f96d1d3f1476f420df37e38";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryBlobStore(NS);
});

async function seedAccount() {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);
  const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const largeBytes = new Uint8Array(2 * 1024 * 1024);
  for (let i = 0; i < largeBytes.length; i += 4096) {
    largeBytes[i] = i % 251;
  }

  await threads.upsertCaptures(USER, [
    {
      id: "cap-1",
      text: "Trail fungus near switchback",
      createdAt: "2026-07-18T10:00:00.000Z",
      location: { latitude: 45.5, longitude: -122.6, accuracy: 12 },
      threadId: "thread-1",
      sequence: 1,
      idempotencyKey: "cap-1",
      attachments: [
        {
          id: "att-fungus",
          kind: "image",
          mimeType: "image/png",
          fileName: "fungus.png",
        },
      ],
    },
    {
      id: "cap-2",
      text: "Second look after rain",
      createdAt: "2026-07-18T11:00:00.000Z",
      location: null,
      threadId: "thread-1",
      sequence: 2,
      idempotencyKey: "cap-2",
      attachments: [
        {
          id: "att-large",
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "wide-shot.jpg",
        },
      ],
    },
  ]);

  await blobs.put({
    userId: USER,
    attachmentId: "att-fungus",
    mimeType: "image/png",
    bytes: imageBytes,
    operationId: "op-fungus",
  });
  await blobs.put({
    userId: USER,
    attachmentId: "att-large",
    mimeType: "image/jpeg",
    bytes: largeBytes,
    operationId: "op-large",
  });

  const job = await enrichment.getOrCreateJob(USER, {
    id: "job-1",
    idempotencyKey: "job-1",
    threadId: "thread-1",
    basisRevision: 1,
    basisEntryIds: ["cap-1"],
    basisHistory: [],
    targetCaptureIds: ["cap-1"],
    model: "anthropic/claude-sonnet-5",
    status: "queued",
  });
  await enrichment.markJobRunning(USER, job.id);
  await enrichment.completeJob(USER, job.id, {
    text: "Likely *Ganoderma* on Douglas fir.",
    model: "anthropic/claude-sonnet-5",
    title: "Switchback fungus",
    sources: [
      {
        title: "Ganoderma overview",
        url: "https://example.org/ganoderma",
        retrievedAt: "2026-07-18T10:05:00.000Z",
      },
    ],
  });

  return { threads, enrichment, blobs, imageBytes, largeBytes };
}

test("export JSON preserves ids, revisions, location, models, and sources", async () => {
  const { threads, enrichment, blobs } = await seedAccount();
  const archive = await createAccountExportArchive({
    userId: USER,
    threads,
    enrichments: enrichment,
    blobs,
    exportedAt: "2026-07-19T01:00:00.000Z",
  });

  const entries = readZipStoreEntries(archive.bytes);
  const document = JSON.parse(
    new TextDecoder().decode(entries.get("account.json")),
  ) as {
    version: number;
    ownerUserId: string;
    exportedAt: string;
    threads: Array<{
      id: string;
      revision: number;
      captures: Array<{
        id: string;
        sequence: number;
        location: { latitude: number; longitude: number; accuracy: number };
      }>;
      enrichments: Array<{
        model: string;
        basisRevision: number;
        basisEntryIds: string[];
        sources: Array<{
          title: string;
          url: string;
          retrievedAt: string;
        }>;
      }>;
    }>;
  };

  expect(archive.filename).toContain("walking-thoughts-export-");
  expect(archive.contentType).toBe("application/zip");
  expect(document.version).toBe(1);
  expect(document.ownerUserId).toBe(USER);
  expect(document.exportedAt).toBe("2026-07-19T01:00:00.000Z");
  expect(document.threads).toHaveLength(1);

  const thread = document.threads[0]!;
  expect(thread.id).toBe("thread-1");
  expect(thread.revision).toBeGreaterThanOrEqual(1);
  expect(thread.captures).toHaveLength(2);
  expect(thread.captures[0]).toMatchObject({
    id: "cap-1",
    sequence: 1,
    location: { latitude: 45.5, longitude: -122.6, accuracy: 12 },
  });
  expect(thread.enrichments).toHaveLength(1);
  expect(thread.enrichments[0]).toMatchObject({
    model: "anthropic/claude-sonnet-5",
    basisRevision: 1,
    basisEntryIds: ["cap-1"],
    sources: [
      {
        title: "Ganoderma overview",
        url: "https://example.org/ganoderma",
        retrievedAt: "2026-07-18T10:05:00.000Z",
      },
    ],
  });

  const serialized = JSON.stringify(document);
  expect(serialized).not.toMatch(/https?:\/\/[^"]*blob/i);
  expect(serialized).not.toContain("/api/media/");
});

test("Markdown is chronological with usable source links and media refs", async () => {
  const { threads, enrichment, blobs } = await seedAccount();
  const archive = await createAccountExportArchive({
    userId: USER,
    threads,
    enrichments: enrichment,
    blobs,
  });

  const entries = readZipStoreEntries(archive.bytes);
  const markdown = new TextDecoder().decode(
    entries.get("threads/thread-1.md"),
  );
  expect(markdown).toContain("# Switchback fungus");
  expect(markdown.indexOf("Trail fungus")).toBeLessThan(
    markdown.indexOf("Likely *Ganoderma*"),
  );
  expect(markdown.indexOf("Likely *Ganoderma*")).toBeLessThan(
    markdown.indexOf("Second look after rain"),
  );
  expect(markdown).toContain(
    "[Ganoderma overview](https://example.org/ganoderma)",
  );
  expect(markdown).toContain("../media/att-fungus/fungus.png");
  expect(markdown).toContain("anthropic/claude-sonnet-5");
});

test("archive includes original media bytes with matching checksums", async () => {
  const { threads, enrichment, blobs, imageBytes, largeBytes } =
    await seedAccount();
  const archive = await createAccountExportArchive({
    userId: USER,
    threads,
    enrichments: enrichment,
    blobs,
  });

  const entries = readZipStoreEntries(archive.bytes);
  const document = JSON.parse(
    new TextDecoder().decode(entries.get("account.json")),
  ) as {
    threads: Array<{
      captures: Array<{
        attachments: Array<{
          included: boolean;
          exportPath: string | null;
          sha256: string | null;
          byteLength: number | null;
        }>;
      }>;
    }>;
  };

  const fungus = document.threads[0]!.captures[0]!.attachments[0]!;
  expect(fungus.included).toBe(true);
  expect(fungus.exportPath).toBe("media/att-fungus/fungus.png");
  expect(fungus.byteLength).toBe(imageBytes.byteLength);
  expect(fungus.sha256).toBe(FUNGUS_SHA256);

  const large = document.threads[0]!.captures[1]!.attachments[0]!;
  expect(large.included).toBe(true);
  expect(large.byteLength).toBe(largeBytes.byteLength);
  expect(large.sha256).toBe(nodeSha256Hex(largeBytes));

  const packedFungus = entries.get("media/att-fungus/fungus.png");
  expect(packedFungus).toBeTruthy();
  expect(Buffer.from(packedFungus!).equals(Buffer.from(imageBytes))).toBe(true);

  const packedLarge = entries.get("media/att-large/wide-shot.jpg");
  expect(packedLarge).toBeTruthy();
  expect(packedLarge!.byteLength).toBe(largeBytes.byteLength);
  expect(nodeSha256Hex(packedLarge!)).toBe(nodeSha256Hex(largeBytes));
});

test("export includes every active Thread and omits trashed Threads", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures(USER, [
    {
      id: "cap-a",
      text: "Active Thread A",
      createdAt: "2026-07-18T09:00:00.000Z",
      location: null,
      threadId: "thread-a",
      sequence: 1,
      idempotencyKey: "cap-a",
    },
    {
      id: "cap-b",
      text: "Active Thread B",
      createdAt: "2026-07-18T09:30:00.000Z",
      location: null,
      threadId: "thread-b",
      sequence: 1,
      idempotencyKey: "cap-b",
    },
    {
      id: "cap-trashed",
      text: "Trashed Thread",
      createdAt: "2026-07-18T08:00:00.000Z",
      location: null,
      threadId: "thread-trashed",
      sequence: 1,
      idempotencyKey: "cap-trashed",
    },
  ]);

  await threads.applyTrashMutations(USER, [
    {
      action: "trash",
      kind: "thread",
      targetId: "thread-trashed",
      trashedAt: "2026-07-18T12:00:00.000Z",
      idempotencyKey: "trash-thread",
    },
  ]);

  const archive = await createAccountExportArchive({
    userId: USER,
    threads,
    enrichments: enrichment,
    blobs,
  });
  const document = JSON.parse(
    new TextDecoder().decode(
      readZipStoreEntries(archive.bytes).get("account.json"),
    ),
  ) as { threads: Array<{ id: string }> };

  expect(document.threads.map((thread) => thread.id).sort()).toEqual([
    "thread-a",
    "thread-b",
  ]);
  expect(
    readZipStoreEntries(archive.bytes).has("threads/thread-trashed.md"),
  ).toBe(false);
});

test("missing remote media stays referenced without inventing public URLs", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichment = createMemoryEnrichmentRepository(NS, threads);
  const blobs = createMemoryBlobStore(NS);

  await threads.upsertCaptures(USER, [
    {
      id: "cap-missing",
      text: "Photo still uploading",
      createdAt: "2026-07-18T12:00:00.000Z",
      location: null,
      threadId: "thread-missing",
      sequence: 1,
      idempotencyKey: "cap-missing",
      attachments: [
        {
          id: "att-missing",
          kind: "image",
          mimeType: "image/jpeg",
          fileName: "pending.jpg",
        },
      ],
    },
  ]);

  const archive = await createAccountExportArchive({
    userId: USER,
    threads,
    enrichments: enrichment,
    blobs,
  });

  const entries = readZipStoreEntries(archive.bytes);
  const document = JSON.parse(
    new TextDecoder().decode(entries.get("account.json")),
  ) as {
    threads: Array<{
      captures: Array<{
        attachments: Array<{
          included: boolean;
          exportPath: string | null;
          sha256: string | null;
        }>;
      }>;
    }>;
  };

  const attachment = document.threads[0]!.captures[0]!.attachments[0]!;
  expect(attachment.included).toBe(false);
  expect(attachment.exportPath).toBeNull();
  expect(attachment.sha256).toBeNull();
  expect(JSON.stringify(document)).not.toContain("/api/media/");
  expect([...entries.keys()].some((key) => key.startsWith("media/"))).toBe(
    false,
  );
});
