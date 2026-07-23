import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ memoryId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const { memoryId } = await context.params;
  const forgotten = await getWalkerMemoryRepository().forgetMemory(
    access.userId,
    memoryId,
  );
  if (!forgotten) {
    return Response.json({ error: "memory_not_found" }, { status: 404 });
  }
  return Response.json({ forgotten: true });
}
