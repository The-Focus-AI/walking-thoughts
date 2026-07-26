import { publishThreadArtifact } from "@/lib/artifacts/build";
import { getArtifactRepository } from "@/lib/artifacts/repository";
import { toArtifactSummary } from "@/lib/artifacts/types";
import { getGatewayClient } from "@/lib/enrichment/gateway";
import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/**
 * Publish a Thread's newest Enrichment as a page, on the walker's word. The
 * queue publishes reports on its own; this is how a Thread the queue judged
 * too slight — or one whose page was never written because the gateway was
 * down — gets one anyway. Publishing twice returns the page already stored.
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let threadId = "";
  try {
    const body = (await request.json()) as { threadId?: string };
    threadId = body.threadId?.trim() ?? "";
  } catch {
    // Handled by the check below.
  }
  if (!threadId) {
    return Response.json({ error: "thread_id_required" }, { status: 400 });
  }

  const threadRepository = getThreadRepository();
  const thread = (await threadRepository.listThreads(access.userId)).find(
    (candidate) => candidate.id === threadId,
  );
  if (!thread) {
    return Response.json({ error: "thread_not_found" }, { status: 404 });
  }

  const enrichments = await getEnrichmentRepository().listThreadEnrichments(
    access.userId,
    threadId,
  );
  const newest = enrichments[enrichments.length - 1];
  if (!newest) {
    return Response.json({ error: "no_enrichment_to_publish" }, { status: 409 });
  }

  const covered = new Set(newest.targetCaptureIds);
  try {
    const { artifact, created } = await publishThreadArtifact({
      userId: access.userId,
      threadTitle: thread.title,
      enrichment: newest,
      captureWords: thread.captures
        .filter((capture) => covered.has(capture.id))
        .map((capture) => capture.text.trim())
        .filter((text) => text.length > 0),
      walkedAt: thread.captures[0]?.createdAt ?? null,
      repository: getArtifactRepository(),
      gateway: getGatewayClient(),
    });
    return Response.json({ artifact: toArtifactSummary(artifact), created });
  } catch {
    return Response.json({ error: "publish_failed" }, { status: 502 });
  }
}
