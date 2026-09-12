import { getArtifactRepository } from "@/lib/artifacts/repository";
import { PROCESS_MAX_DURATION_SEC } from "@/lib/enrichment/budget";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/**
 * Keep the function alive through `CALL_TIME_BUDGET_MS` plus one model
 * job. The platform default (~60s Pro) was killing invocations after
 * `markJobRunning`, which left a zombie `running` claim (Vercel status 0).
 */
export const maxDuration = PROCESS_MAX_DURATION_SEC;

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
    {
      retryFailed,
      threadRepository,
      // A report that came back is published as a page in the same pass.
      artifactRepository: getArtifactRepository(),
      signal: request.signal,
    },
  );
  return Response.json(response);
}
