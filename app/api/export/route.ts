import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { createAccountExportArchive } from "@/lib/export/create-account-export";
import { getPrivateBlobStore } from "@/lib/media/blob-store";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const archive = await createAccountExportArchive({
    userId: access.userId,
    threads: getThreadRepository(),
    enrichments: getEnrichmentRepository(),
    blobs: getPrivateBlobStore(),
  });

  return new Response(Buffer.from(archive.bytes), {
    status: 200,
    headers: {
      "content-type": archive.contentType,
      "content-disposition": `attachment; filename="${archive.filename}"`,
      "cache-control": "private, no-store",
      "x-walking-thoughts-export": "authenticated",
    },
  });
}
