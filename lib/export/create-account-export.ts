import type { EnrichmentRepository } from "@/lib/enrichment/types";
import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import type { ThreadRepository } from "@/lib/sync/types";
import { buildAccountExport } from "./build-account-export";
import { packageAccountExportZip } from "./package-archive";

export async function createAccountExportArchive(input: {
  userId: string;
  threads: ThreadRepository;
  enrichments: EnrichmentRepository;
  blobs: PrivateBlobStore;
  exportedAt?: string;
}): Promise<{
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}> {
  const serverThreads = await input.threads.listThreads(input.userId);
  const enrichmentsByThreadId: Record<
    string,
    Awaited<ReturnType<EnrichmentRepository["listThreadEnrichments"]>>
  > = {};

  for (const thread of serverThreads) {
    enrichmentsByThreadId[thread.id] =
      await input.enrichments.listThreadEnrichments(input.userId, thread.id);
  }

  const pkg = await buildAccountExport({
    userId: input.userId,
    exportedAt: input.exportedAt,
    threads: serverThreads,
    enrichmentsByThreadId,
    blobs: input.blobs,
  });

  const stamp = (input.exportedAt ?? new Date().toISOString()).replace(
    /[:.]/g,
    "-",
  );

  return {
    filename: `walking-thoughts-export-${stamp}.zip`,
    contentType: "application/zip",
    bytes: packageAccountExportZip(pkg),
  };
}
