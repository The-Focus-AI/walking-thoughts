import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";
import type { TrashMutation } from "@/lib/sync/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const repository = getThreadRepository();
  const records = await repository.listTrash(access.userId);
  return Response.json({ records });
}

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { mutations?: TrashMutation[] };
  try {
    body = (await request.json()) as { mutations?: TrashMutation[] };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const mutations = body.mutations ?? [];
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return Response.json({ error: "mutations_required" }, { status: 400 });
  }

  const repository = getThreadRepository();
  const response = await repository.applyTrashMutations(
    access.userId,
    mutations,
  );
  return Response.json(response);
}
