import { getPrivateBlobStore } from "@/lib/media/blob-store";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const form = await request.formData();
  const attachmentId = String(form.get("attachmentId") ?? "");
  const operationId = String(form.get("operationId") ?? attachmentId);
  const mimeType = String(form.get("mimeType") ?? "application/octet-stream");
  const file = form.get("file");

  if (!attachmentId || !(file instanceof File)) {
    return Response.json({ error: "attachment_required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await getPrivateBlobStore().put({
    userId: access.userId,
    attachmentId,
    mimeType,
    bytes,
    operationId,
  });

  return Response.json({
    attachmentId: result.attachmentId,
    duplicate: result.duplicate,
    // Never expose a permanent public object URL.
  });
}
