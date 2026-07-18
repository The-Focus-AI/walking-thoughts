import { requireSyncAccess } from "@/lib/sync/access";
import { createMediaAccessService, MediaAccessError } from "@/lib/media/access-service";
import { getPrivateBlobStore } from "@/lib/media/blob-store";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  const { attachmentId } = await context.params;
  const userId = "error" in access ? null : access.userId;

  try {
    const media = await createMediaAccessService(getPrivateBlobStore()).read({
      userId,
      attachmentId,
    });
    return new Response(Buffer.from(media.bytes), {
      status: 200,
      headers: {
        "content-type": media.mimeType,
        "cache-control": "private, no-store",
        "x-walking-thoughts-media-access": "authenticated",
      },
    });
  } catch (error) {
    if (error instanceof MediaAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "media_read_failed" }, { status: 500 });
  }
}
