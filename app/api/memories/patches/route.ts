import { revertMemoryPatch } from "@/lib/memory/patches";
import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

/** Revert one patch from the Changes timeline by appending its inverse. */
export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let patchId = "";
  try {
    const body = (await request.json()) as { revertPatchId?: string };
    patchId = body.revertPatchId ?? "";
  } catch {
    // handled below
  }
  if (!patchId) {
    return Response.json({ error: "revertPatchId_required" }, { status: 400 });
  }

  const result = await revertMemoryPatch(
    getWalkerMemoryRepository(),
    access.userId,
    patchId,
    {
      now: () => new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    },
  );
  if (!result.ok) {
    const status = result.error === "patch_not_found" ? 404 : 409;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ reverted: true, patch: result.patch });
}
