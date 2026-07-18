import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const repository = getThreadRepository();
  const threads = await repository.listThreads(access.userId);
  return Response.json({ threads });
}
