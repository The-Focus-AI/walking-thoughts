import { neon } from "@neondatabase/serverless";
import { getPrivateBlobStore } from "@/lib/media/blob-store";
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
    // Exercise a real private round-trip. A token that belongs to a public
    // store passes shallow checks but rejects `access: "private"` writes —
    // exactly the misconfiguration that silently broke media upload once.
    try {
      const store = getPrivateBlobStore(environment);
      const probeId = `probe-${crypto.randomUUID()}`;
      await store.put({
        userId: "health-probe",
        attachmentId: probeId,
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("walking-thoughts health probe"),
        operationId: probeId,
      });
      const read = await store.get("health-probe", probeId);
      await store.delete?.("health-probe", probeId);
      blob = read
        ? { ok: true, privateAccess: true }
        : { ok: false, reason: "private_read_failed" };
    } catch {
      blob = { ok: false, reason: "private_write_failed" };
    }
  }

  return { database, blob, queue };
}
