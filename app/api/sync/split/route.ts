import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/**
 * Split a multi-Capture Thread: each Capture moves into its own Thread and
 * loses its Enrichment inclusion so the queue researches it afresh. The
 * emptied source Thread goes to Trash (ADR 0011 repair).
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { threadId?: string };
  try {
    body = (await request.json()) as { threadId?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const threadId = body.threadId?.trim();
  if (!threadId) {
    return Response.json({ error: "threadId_required" }, { status: 400 });
  }

  const threads = getThreadRepository();
  const result = await threads.splitThread(access.userId, threadId);
  if (result.moves.length > 0) {
    await getEnrichmentRepository().resetInclusions(
      access.userId,
      result.moves.map((move) => move.captureId),
    );
  }
  return Response.json(result);
}
