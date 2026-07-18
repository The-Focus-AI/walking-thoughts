import { decideAccess } from "@/lib/access";

export async function requireSyncAccess(request?: Request) {
  const testUser = process.env.SYNC_TEST_USER_ID;
  const isProduction = process.env.VERCEL_ENV === "production";
  if (!isProduction && testUser && request) {
    const header = request.headers.get("x-walking-thoughts-test-user");
    if (header === testUser) {
      return { userId: testUser };
    }
  }

  const access = await decideAccess();
  if (access.status === "configuration_required") {
    return {
      error: Response.json({ error: access.status }, { status: 503 }),
    };
  }
  if (access.status === "signed_out") {
    return { error: Response.json({ error: access.status }, { status: 401 }) };
  }
  if (access.status === "forbidden") {
    return { error: Response.json({ error: access.status }, { status: 403 }) };
  }
  return { userId: access.userId };
}
