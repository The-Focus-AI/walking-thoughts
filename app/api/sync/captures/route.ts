import { requireSyncAccess } from "@/lib/sync/access";
import { getThreadRepository } from "@/lib/sync/repository";
import type { SyncCapturePayload } from "@/lib/sync/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { captures?: SyncCapturePayload[] };
  try {
    body = (await request.json()) as { captures?: SyncCapturePayload[] };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const captures = body.captures ?? [];
  if (!Array.isArray(captures) || captures.length === 0) {
    return Response.json({ error: "captures_required" }, { status: 400 });
  }

  const repository = getThreadRepository();
  const response = await repository.upsertCaptures(access.userId, captures);
  return Response.json(response);
}
