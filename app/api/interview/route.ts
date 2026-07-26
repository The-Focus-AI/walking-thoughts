import { advanceInterview, readInterviewState } from "@/lib/interview/run";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const state = await readInterviewState(access.userId);
  return Response.json(state);
}

/** The walker's verdict on one Proposed Project: name it, or turn it down. */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { projectId?: string; confirm?: boolean; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return Response.json({ error: "project_id_required" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (name && name.length > 60) {
    return Response.json({ error: "name_too_long" }, { status: 400 });
  }

  const state = await advanceInterview(
    access.userId,
    body.confirm === false
      ? { projectId, confirm: false }
      : { projectId, confirm: true, name },
  );
  return Response.json(state);
}
