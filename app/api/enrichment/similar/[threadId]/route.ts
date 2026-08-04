import { priorThreads } from "@/lib/desk/similarity";
import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

/**
 * What came before this Thread, named. Shared mentions are exact and ranked
 * first; embedding neighbours follow. Both are resolved to titles and walk
 * dates here rather than on the device, because the device holds only its
 * own Threads and this is a question about the whole corpus.
 *
 * A Thread with nothing behind it answers with an empty list: a first
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
  if (!repository.listThreadMentionIndex) {
    return Response.json({ similar: [] });
  }

  const index = await repository.listThreadMentionIndex(access.userId);
  const mine = index.find((entry) => entry.threadId === threadId);
  if (!mine) return Response.json({ similar: [] });

  const embeddingMatches = repository.findSimilarThreads
    ? await repository.findSimilarThreads(access.userId, threadId, { limit: 5 })
    : [];

  const similar = priorThreads({
    thread: {
      threadId: mine.threadId,
      title: mine.title,
      dayKey: mine.at.slice(0, 10),
      at: mine.at,
      mentions: mine.mentions.map((mention) => ({
        slug: mention.slug,
        name: mention.name,
      })),
    },
    candidates: index.map((entry) => ({
      threadId: entry.threadId,
      title: entry.title,
      dayKey: entry.at.slice(0, 10),
      at: entry.at,
      mentions: entry.mentions.map((mention) => ({
        slug: mention.slug,
        name: mention.name,
      })),
    })),
    embeddingMatches,
  });

  return Response.json({ similar });
}
