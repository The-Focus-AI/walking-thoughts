import { neon } from "@neondatabase/serverless";
import type { HealthProbes } from "./health";

export function createNeonHealthProbes(): HealthProbes {
  return {
    async database(databaseUrl) {
      const sql = neon(databaseUrl);
      await sql`SELECT 1`;
    },

    async queueDepth(databaseUrl) {
      const sql = neon(databaseUrl);
      const tables = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'enrichment_jobs'
      `;
      if (tables.length === 0) return null;
      const rows = await sql`
        SELECT count(*)::int AS open FROM enrichment_jobs
        WHERE status IN ('pending', 'running')
      `;
      return (rows[0]?.open as number) ?? 0;
    },
  };
}
