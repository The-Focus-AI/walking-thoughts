import { asProjectRepository } from "@/lib/local-capture/types";
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

/**
 * Create a Project by name; filing the same name twice returns the same one.
 * An optional `repository` (`owner/repo`) names where spec Threads routed to
 * this Project draft their issues (ADR 0018); passing it for an existing
 * name sets it, `null` clears it, omitting it keeps what the Project has.
 */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { name?: string; repository?: string | null };
  try {
    body = (await request.json()) as typeof body;
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
  let repository: string | null | undefined = undefined;
  if (body.repository !== undefined) {
    repository = body.repository === null ? null : asProjectRepository(body.repository);
    if (body.repository !== null && !repository) {
      return Response.json({ error: "repository_invalid" }, { status: 400 });
    }
  }

  try {
    const project = await getThreadRepository().createProject(
      access.userId,
      name,
      repository === undefined ? undefined : { repository },
    );
    return Response.json({ project });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "create_failed";
    return Response.json({ error: reason }, { status: 500 });
  }
}
