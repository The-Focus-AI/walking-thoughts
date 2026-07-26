import { getArtifactRepository } from "@/lib/artifacts/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

/**
 * Every published Artifact, as summaries. The desk asks once per sync cycle
 * and marks the Threads that have a page to open, rather than asking per
 * Thread — the list pane holds every day the walker has ever walked.
 */
export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId");
  const repository = getArtifactRepository();
  const artifacts = threadId
    ? await repository.listThreadArtifacts(access.userId, threadId)
    : await repository.listArtifacts(access.userId);

  return Response.json(
    { artifacts },
    { headers: { "cache-control": "private, no-store" } },
  );
}
