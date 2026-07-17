import { decideAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await decideAccess();
  if (access.status === "configuration_required") {
    return Response.json({ error: access.status }, { status: 503 });
  }
  if (access.status === "signed_out") {
    return Response.json({ error: access.status }, { status: 401 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: access.status }, { status: 403 });
  }
  return Response.json({ userId: access.userId });
}
