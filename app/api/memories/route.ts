import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const memories = await getWalkerMemoryRepository().listMemories(
    access.userId,
  );
  return Response.json({ memories });
}
