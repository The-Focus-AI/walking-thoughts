import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

/** The Projects a walker files Threads into. */
export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const projects = await getThreadRepository().listProjects(access.userId);
  return Response.json({ projects });
}

/** Create a Project by name; filing the same name twice returns the same one. */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return Response.json({ error: "name_required" }, { status: 400 });
  }
  if (name.length > 60) {
    return Response.json({ error: "name_too_long" }, { status: 400 });
  }

  try {
    const project = await getThreadRepository().createProject(
      access.userId,
      name,
    );
    return Response.json({ project });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "create_failed";
    return Response.json({ error: reason }, { status: 500 });
  }
}
