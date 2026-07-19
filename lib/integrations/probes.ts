import { neon } from "@neondatabase/serverless";
import type { HealthProbeResults } from "./health";

/**
 * Cheap live probes for health. Failures become status codes, never secret
 * material. Queue processing shares Neon with Enrichment job storage.
 */
export async function probeIntegrationDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<HealthProbeResults> {
  const databaseUrl = environment.DATABASE_URL?.trim();
  let database: HealthProbeResults["database"] = {
    ok: false,
    reason: "DATABASE_URL",
  };
  let queue: HealthProbeResults["queue"] = {
    ok: false,
    reason: "database_unavailable",
  };

  if (databaseUrl) {
    try {
      const sql = neon(databaseUrl);
      await sql`select 1 as ok`;
      database = { ok: true };
      queue = { ok: true };
    } catch {
      database = { ok: false, reason: "unreachable" };
      queue = { ok: false, reason: "database_unavailable" };
    }
  }

  const blobToken = environment.BLOB_READ_WRITE_TOKEN?.trim();
  let blob: HealthProbeResults["blob"] = {
    ok: false,
    reason: "token_missing",
  };
  if (blobToken) {
    // Walking Thoughts always uses the private Blob adapter (`access: "private"`).
    // Health reports that policy; it does not open a public URL to prove isolation.
    blob = { ok: true, privateAccess: true };
  }

  return { database, blob, queue };
}
