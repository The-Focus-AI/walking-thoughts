import { processPendingEnrichments } from "@/lib/enrichment/process";
import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let retryFailed = false;
  try {
    const body = (await request.json()) as { retryFailed?: boolean };
    retryFailed = Boolean(body.retryFailed);
  } catch {
    // empty body is fine
  }

  const repository = getEnrichmentRepository();
  const threadRepository = getThreadRepository();
  const response = await processPendingEnrichments(
    access.userId,
    repository,
    { retryFailed, threadRepository },
  );
  return Response.json(response);
}
