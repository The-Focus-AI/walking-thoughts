import { neon } from "@neondatabase/serverless";
import { titleFromText } from "@/lib/local-capture/thread-destination";
import type {
  SyncBatchResponse,
  SyncCapturePayload,
  SyncCaptureResult,
  ThreadRepository,
} from "./types";

export function createNeonThreadRepository(databaseUrl: string): ThreadRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS sync_threads (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_captures (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          thread_id TEXT NOT NULL REFERENCES sync_threads(id),
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          location JSONB,
          sequence INTEGER NOT NULL,
          idempotency_key TEXT NOT NULL,
          UNIQUE (user_id, idempotency_key)
        )
      `;
    })();
    return ready;
  };

  return {
    async upsertCaptures(userId, captures) {
      await ensure();
      const results: SyncCaptureResult[] = [];
      const failures: SyncBatchResponse["failures"] = [];

      for (const payload of captures) {
        try {
          const existing = (await sql`
            SELECT id, thread_id, sequence
            FROM sync_captures
            WHERE user_id = ${userId} AND idempotency_key = ${payload.idempotencyKey}
            LIMIT 1
          `) as Array<{ id: string; thread_id: string; sequence: number }>;

          if (existing[0]) {
            results.push({
              id: existing[0].id,
              threadId: existing[0].thread_id,
              sequence: existing[0].sequence,
              status: "complete",
            });
            continue;
          }

          const threadId = payload.threadId ?? payload.id;
          const title = titleFromText(payload.text);
          await sql`
            INSERT INTO sync_threads (id, user_id, title, revision, updated_at)
            VALUES (${threadId}, ${userId}, ${title}, ${payload.sequence}, ${payload.createdAt})
            ON CONFLICT (id) DO UPDATE SET
              revision = GREATEST(sync_threads.revision, EXCLUDED.revision),
              updated_at = CASE
                WHEN EXCLUDED.updated_at > sync_threads.updated_at THEN EXCLUDED.updated_at
                ELSE sync_threads.updated_at
              END
          `;
          await sql`
            INSERT INTO sync_captures (
              id, user_id, thread_id, text, created_at, location, sequence, idempotency_key
            )
            VALUES (
              ${payload.id},
              ${userId},
              ${threadId},
              ${payload.text},
              ${payload.createdAt},
              ${JSON.stringify(payload.location)},
              ${payload.sequence},
              ${payload.idempotencyKey}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          results.push({
            id: payload.id,
            threadId,
            sequence: payload.sequence,
            status: "complete",
          });
        } catch (error) {
          failures.push({
            id: payload.id,
            status: "needs_attention",
            reason: error instanceof Error ? error.message : "sync_failed",
            retryable: true,
          });
        }
      }

      return { results, failures };
    },

    async listThreads(userId) {
      await ensure();
      const threads = (await sql`
        SELECT id, title, revision, updated_at
        FROM sync_threads
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `) as Array<{
        id: string;
        title: string;
        revision: number;
        updated_at: string;
      }>;

      const result = [];
      for (const thread of threads) {
        const captures = (await sql`
          SELECT id, text, created_at, location, sequence
          FROM sync_captures
          WHERE user_id = ${userId} AND thread_id = ${thread.id}
          ORDER BY sequence ASC
        `) as Array<{
          id: string;
          text: string;
          created_at: string;
          location: SyncCapturePayload["location"];
          sequence: number;
        }>;
        result.push({
          id: thread.id,
          title: thread.title,
          revision: thread.revision,
          updatedAt: thread.updated_at,
          captures: captures.map((capture) => ({
            id: capture.id,
            text: capture.text,
            createdAt: capture.created_at,
            location: capture.location,
            sequence: capture.sequence,
          })),
        });
      }
      return result;
    },
  };
}
