import { neon } from "@neondatabase/serverless";
import type { EnrichmentSource } from "@/lib/enrichment/types";
import { asThreadKind } from "@/lib/local-capture/types";
import {
  toArtifactSummary,
  type ArtifactRepository,
  type ThreadArtifact,
} from "./types";

type ArtifactRow = {
  id: string;
  thread_id: string;
  enrichment_id: string;
  title: string;
  standfirst: string | null;
  kind: string | null;
  body: string;
  sources: EnrichmentSource[] | null;
  model: string;
  created_at: string;
};

function mapArtifact(row: ArtifactRow): ThreadArtifact {
  return {
    id: row.id,
    threadId: row.thread_id,
    enrichmentId: row.enrichment_id,
    title: row.title,
    standfirst: row.standfirst,
    kind: asThreadKind(row.kind),
    body: row.body,
    sources: row.sources ?? [],
    model: row.model,
    createdAt: row.created_at,
  };
}

export function createNeonArtifactRepository(
  databaseUrl: string,
): ArtifactRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          enrichment_id TEXT NOT NULL,
          title TEXT NOT NULL,
          standfirst TEXT,
          kind TEXT,
          body TEXT NOT NULL,
          sources JSONB NOT NULL DEFAULT '[]'::jsonb,
          model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS artifacts_user_thread_idx
        ON artifacts (user_id, thread_id)
      `;
    })();
    return ready;
  };

  const selectColumns = async (userId: string, artifactId: string) =>
    (await sql`
      SELECT id, thread_id, enrichment_id, title, standfirst, kind, body,
             sources, model, created_at
      FROM artifacts
      WHERE user_id = ${userId} AND id = ${artifactId}
      LIMIT 1
    `) as ArtifactRow[];

  return {
    async saveArtifact(userId, artifact) {
      await ensure();
      const existing = await selectColumns(userId, artifact.id);
      if (existing[0]) {
        return { artifact: mapArtifact(existing[0]), created: false };
      }
      await sql`
        INSERT INTO artifacts (
          id, user_id, thread_id, enrichment_id, title, standfirst, kind,
          body, sources, model, created_at
        ) VALUES (
          ${artifact.id},
          ${userId},
          ${artifact.threadId},
          ${artifact.enrichmentId},
          ${artifact.title},
          ${artifact.standfirst},
          ${artifact.kind},
          ${artifact.body},
          ${JSON.stringify(artifact.sources)},
          ${artifact.model},
          ${artifact.createdAt}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      // A concurrent publish may have won the insert; read back what stands.
      const stored = await selectColumns(userId, artifact.id);
      return {
        artifact: stored[0] ? mapArtifact(stored[0]) : artifact,
        created: true,
      };
    },

    async getArtifact(userId, artifactId) {
      await ensure();
      const rows = await selectColumns(userId, artifactId);
      return rows[0] ? mapArtifact(rows[0]) : null;
    },

    async listArtifacts(userId) {
      await ensure();
      const rows = (await sql`
        SELECT id, thread_id, enrichment_id, title, standfirst, kind,
               '' AS body, '[]'::jsonb AS sources, model, created_at
        FROM artifacts
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `) as ArtifactRow[];
      return rows.map((row) => toArtifactSummary(mapArtifact(row)));
    },

    async listThreadArtifacts(userId, threadId) {
      await ensure();
      const rows = (await sql`
        SELECT id, thread_id, enrichment_id, title, standfirst, kind,
               '' AS body, '[]'::jsonb AS sources, model, created_at
        FROM artifacts
        WHERE user_id = ${userId} AND thread_id = ${threadId}
        ORDER BY created_at DESC
      `) as ArtifactRow[];
      return rows.map((row) => toArtifactSummary(mapArtifact(row)));
    },
  };
}
