import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/** Mark a Thread reviewed at the desk (or clear it back to new). */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { threadId?: string; reviewed?: boolean };
  try {
    body = (await request.json()) as { threadId?: string; reviewed?: boolean };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const threadId = body.threadId?.trim();
  if (!threadId) {
    return Response.json({ error: "threadId_required" }, { status: 400 });
  }

  const reviewedAt = body.reviewed === false ? null : new Date().toISOString();
  try {
    const result = await getThreadRepository().setThreadReviewed(
      access.userId,
      threadId,
      reviewedAt,
    );
    return Response.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "review_failed";
    if (reason === "thread_not_found") {
      return Response.json({ error: reason }, { status: 404 });
    }
    return Response.json({ error: reason }, { status: 500 });
  }
}
