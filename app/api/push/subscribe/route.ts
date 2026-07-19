import { getPushRepository } from "@/lib/push/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
};

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.p256dh?.trim();
  const auth = body.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const repository = getPushRepository();
  const record = await repository.upsertSubscription(access.userId, {
    endpoint,
    p256dh,
    auth,
  });
  return Response.json({ ok: true, endpoint: record.endpoint });
}

export async function DELETE(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }
  await getPushRepository().deleteSubscription(access.userId, endpoint);
  return Response.json({ ok: true });
}
