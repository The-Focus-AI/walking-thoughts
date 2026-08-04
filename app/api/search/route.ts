import { searchSnippet } from "@/lib/desk/search";
import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

/**
 * Search the whole corpus, not just this device.
 *
 * The desk searches what it holds, which is what it has cached — a report
 * the phone never opened is invisible to it, and the same query answers
 * differently on two devices of the same walker. The server holds every
 * Capture and every report, so it can answer completely.
 *
 * Substring matching, deliberately: it finds the words the walker types.
 * Nothing here embeds the query.
 */
export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!query) return Response.json({ results: [] });

  const repository = getEnrichmentRepository();
  if (!repository.searchThreads) return Response.json({ results: [] });

  try {
    const found = await repository.searchThreads(access.userId, query, {
      limit: 25,
    });
    return Response.json({
      results: found.map((entry) => ({
        threadId: entry.threadId,
        title: entry.title,
        // The line it matched on, so a result answers rather than points.
        snippet: searchSnippet([entry.matchedText], query),
      })),
    });
  } catch {
    // The device's own search still stands.
    return Response.json({ results: [] });
  }
}
