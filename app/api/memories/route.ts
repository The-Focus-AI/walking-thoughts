import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const repository = getWalkerMemoryRepository();
  const [memories, patches] = await Promise.all([
    repository.listMemories(access.userId),
    repository.listPatches(access.userId),
  ]);
  return Response.json({ memories, patches });
}
