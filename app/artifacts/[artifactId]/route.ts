import {
  ARTIFACT_RESPONSE_HEADERS,
  renderArtifactDocument,
} from "@/lib/artifacts/document";
import { getArtifactRepository } from "@/lib/artifacts/repository";
import { requireSyncAccess } from "@/lib/sync/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ artifactId: string }>;
};

/**
 * One published report, browsable on its own URL: the whole page, served as
 * a document rather than as data for the app shell to render. Private —
 * behind the same fail-closed boundary as every other Thread surface.
 */
export async function GET(request: Request, context: RouteContext) {
  const access = await requireSyncAccess(request);
  if ("error" in access) return access.error;

  const { artifactId } = await context.params;
  if (!artifactId) {
    return Response.json({ error: "artifact_id_required" }, { status: 400 });
  }

  const artifact = await getArtifactRepository().getArtifact(
    access.userId,
    artifactId,
  );
  if (!artifact) {
    return Response.json({ error: "artifact_not_found" }, { status: 404 });
  }

  return new Response(renderArtifactDocument(artifact), {
    status: 200,
    headers: ARTIFACT_RESPONSE_HEADERS,
  });
}
