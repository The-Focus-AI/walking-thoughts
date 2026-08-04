import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

/**
 * What this Thread reads like elsewhere in the corpus. Only the embedding
 * half lives here — shared mentions are exact, already on the device, and
 * the desk ranks them above anything this route can say.
 *
 * A Thread with no embedding yet answers with an empty list: a first
 * sighting is a fact about the corpus, not a failure to report.
 */
export async function GET(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const { threadId } = await context.params;
  if (!threadId) {
    return Response.json({ error: "thread_id_required" }, { status: 400 });
  }

  const repository = getEnrichmentRepository();
  if (!repository.findSimilarThreads) return Response.json({ similar: [] });

  const similar = await repository.findSimilarThreads(access.userId, threadId, {
    limit: 5,
  });
  return Response.json({ similar });
}
