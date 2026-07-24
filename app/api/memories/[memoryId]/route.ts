import { applyMemoryPatch } from "@/lib/memory/patches";
import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ memoryId: string }>;
};

/** Forget = a manual remove patch; the log keeps the history, revertible. */
export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const { memoryId } = await context.params;
  const result = await applyMemoryPatch(
    getWalkerMemoryRepository(),
    access.userId,
    { op: "remove", memoryId, source: "manual" },
    {
      now: () => new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    },
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }
  return Response.json({ forgotten: true, patch: result.patch });
}
