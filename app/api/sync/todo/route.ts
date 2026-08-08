import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/**
 * Check a routed to-do off (or back on) from the To-do list. The walker's
 * action on the destination surface — deliberately not the filing seam:
 * checking an item done never reopens or re-files the Thread, so this write
 * touches todo_done_at and nothing else.
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { threadId?: string; done?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const threadId = body.threadId?.trim();
  if (!threadId) {
    return Response.json({ error: "threadId_required" }, { status: 400 });
  }

  const todoDoneAt = body.done === false ? null : new Date().toISOString();
  try {
    const result = await getThreadRepository().setThreadTodoDone(
      access.userId,
      threadId,
      todoDoneAt,
    );
    if (!result) {
      return Response.json({ error: "thread_not_found" }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "todo_failed";
    return Response.json({ error: reason }, { status: 500 });
  }
}
