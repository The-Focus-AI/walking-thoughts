import {
  asResearchVerdict,
  asThreadKind,
  asThreadRoute,
  verdictImpliedByRoute,
} from "@/lib/local-capture/types";
import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/**
 * File a Thread at the desk. Settling its Route, confirming its kind,
 * putting it in a Project, or simply having read it all settle the Thread —
 * it leaves the New queue, and a Route brings its handoff with it
 * (ADR 0017): Journal implies the research is kept, Drop implies dismissed,
 * which is what retracts the Artifact page.
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: {
    threadId?: string;
    reviewed?: boolean;
    kind?: string | null;
    projectId?: string | null;
    researchVerdict?: string | null;
    route?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const threadId = body.threadId?.trim();
  if (!threadId) {
    return Response.json({ error: "threadId_required" }, { status: 400 });
  }

  const reviewedAt = body.reviewed === false ? null : new Date().toISOString();
  // An unknown kind is dropped rather than stored: the walker's filing is the
  // one place a kind outranks the model, so it has to be a real one.
  const kind = body.kind === undefined ? undefined : asThreadKind(body.kind);
  // Same shape as kind: an unknown verdict clears rather than stores — only
  // the two words the glossary names (kept, dismissed) are worth keeping.
  let researchVerdict =
    body.researchVerdict === undefined
      ? undefined
      : asResearchVerdict(body.researchVerdict);
  // Same narrowing again: only a Route the glossary names is a place to go.
  const route =
    body.route === undefined ? undefined : asThreadRoute(body.route);
  // The Route implies the verdict when the filing does not say one outright.
  if (route && researchVerdict === undefined) {
    const implied = verdictImpliedByRoute(route);
    if (implied !== undefined) researchVerdict = implied;
  }

  try {
    const repository = getThreadRepository();
    const thread = await repository.fileThread(access.userId, threadId, {
      kind,
      projectId: body.projectId,
      reviewedAt,
      researchVerdict,
      route,
    });
    if (!thread) {
      return Response.json({ error: "thread_not_found" }, { status: 404 });
    }
    return Response.json({
      threadId: thread.id,
      reviewedAt: thread.reviewedAt ?? null,
      kind: thread.kind ?? null,
      projectId: thread.projectId ?? null,
      projectName: thread.projectName ?? null,
      researchVerdict: thread.researchVerdict ?? null,
      route: thread.route ?? null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "review_failed";
    if (reason === "thread_not_found") {
      return Response.json({ error: reason }, { status: 404 });
    }
    return Response.json({ error: reason }, { status: 500 });
  }
}
