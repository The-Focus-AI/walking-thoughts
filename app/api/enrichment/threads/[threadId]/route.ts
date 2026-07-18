import { getEnrichmentRepository } from "@/lib/enrichment/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const { threadId } = await context.params;
  if (!threadId) {
    return Response.json({ error: "thread_id_required" }, { status: 400 });
  }

  const repository = getEnrichmentRepository();
  const enrichments = await repository.listThreadEnrichments(
    access.userId,
    threadId,
  );
  return Response.json({ enrichments });
}
