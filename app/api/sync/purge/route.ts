import { getPrivateBlobStore } from "@/lib/media/blob-store";
import { requireSyncAccess } from "@/lib/sync/access";
import { purgeExpiredTrash } from "@/lib/sync/purge";
import { getThreadRepository } from "@/lib/sync/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { now?: string; operationId?: string };
  try {
    body = (await request.json()) as { now?: string; operationId?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const now = body.now ?? new Date().toISOString();
  // Bucket by UTC day so naive same-day retries share an idempotency key.
  const operationId =
    body.operationId ?? `purge:${access.userId}:${now.slice(0, 10)}`;

  const result = await purgeExpiredTrash(
    getThreadRepository(),
    getPrivateBlobStore(),
    {
      userId: access.userId,
      now,
      operationId,
    },
  );
  return Response.json(result);
}
