import { neon } from "@neondatabase/serverless";
import { titleFromText } from "@/lib/local-capture/thread-destination";
import { expiresAtFrom, isExpired } from "./trash";
import type {
  PurgeExpiredResult,
  PurgeTarget,
  SyncBatchResponse,
  SyncCapturePayload,
  SyncCaptureResult,
  ThreadRepository,
  TrashBatchResponse,
  TrashMutation,
  TrashMutationResult,
  TrashRecord,
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
          attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
          UNIQUE (user_id, idempotency_key)
        )
      `;
      await sql`
        ALTER TABLE sync_captures
        ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_trash (
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          target_id TEXT NOT NULL,
          trashed_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          PRIMARY KEY (user_id, kind, target_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_trash_ops (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          action TEXT NOT NULL,
          kind TEXT NOT NULL,
          target_id TEXT NOT NULL,
          record JSONB,
          PRIMARY KEY (user_id, idempotency_key)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_purge_ops (
          user_id TEXT NOT NULL,
          operation_id TEXT NOT NULL,
          purged JSONB NOT NULL,
          PRIMARY KEY (user_id, operation_id)
        )
      `;
    })();
    return ready;
  };

  async function loadTrashOp(
    userId: string,
    idempotencyKey: string,
  ): Promise<TrashMutationResult | null> {
    const rows = (await sql`
      SELECT idempotency_key, record
      FROM sync_trash_ops
      WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `) as Array<{ idempotency_key: string; record: TrashRecord | null }>;
    if (!rows[0]) return null;
    return {
      idempotencyKey: rows[0].idempotency_key,
      status: "complete",
      record: rows[0].record,
    };
  }

  async function applyOneTrash(
    userId: string,
    mutation: TrashMutation,
  ): Promise<TrashMutationResult> {
    const prior = await loadTrashOp(userId, mutation.idempotencyKey);
    if (prior) return prior;

    if (mutation.action === "trash") {
      if (!mutation.trashedAt) {
        throw new Error("trashedAt_required");
      }
      const existing = (await sql`
        SELECT kind, target_id, trashed_at, expires_at, attachment_ids
        FROM sync_trash
        WHERE user_id = ${userId}
          AND kind = ${mutation.kind}
          AND target_id = ${mutation.targetId}
        LIMIT 1
      `) as Array<{
        kind: TrashRecord["kind"];
        target_id: string;
        trashed_at: string;
        expires_at: string;
        attachment_ids: string[];
      }>;

      let record: TrashRecord;
      if (existing[0]) {
        record = {
          kind: existing[0].kind,
          targetId: existing[0].target_id,
          trashedAt: existing[0].trashed_at,
          expiresAt: existing[0].expires_at,
          attachmentIds: existing[0].attachment_ids ?? [],
        };
      } else {
        record = {
          kind: mutation.kind,
          targetId: mutation.targetId,
          trashedAt: mutation.trashedAt,
          expiresAt: expiresAtFrom(mutation.trashedAt),
          attachmentIds: [...new Set(mutation.attachmentIds ?? [])],
        };
        await sql`
          INSERT INTO sync_trash (
            user_id, kind, target_id, trashed_at, expires_at, attachment_ids
          )
          VALUES (
            ${userId},
            ${record.kind},
            ${record.targetId},
            ${record.trashedAt},
            ${record.expiresAt},
            ${JSON.stringify(record.attachmentIds)}
          )
          ON CONFLICT (user_id, kind, target_id) DO NOTHING
        `;
      }

      const result: TrashMutationResult = {
        idempotencyKey: mutation.idempotencyKey,
        status: "complete",
        record,
      };
      await sql`
        INSERT INTO sync_trash_ops (
          user_id, idempotency_key, action, kind, target_id, record
        )
        VALUES (
          ${userId},
          ${mutation.idempotencyKey},
          ${mutation.action},
          ${mutation.kind},
          ${mutation.targetId},
          ${JSON.stringify(record)}
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
      `;
      return (await loadTrashOp(userId, mutation.idempotencyKey)) ?? result;
    }

    const existing = (await sql`
      SELECT expires_at
      FROM sync_trash
      WHERE user_id = ${userId}
        AND kind = ${mutation.kind}
        AND target_id = ${mutation.targetId}
      LIMIT 1
    `) as Array<{ expires_at: string }>;
    if (existing[0]) {
      const now = mutation.now ?? new Date().toISOString();
      if (isExpired(existing[0].expires_at, now)) {
        throw new Error("trash_expired");
      }
    }

    await sql`
      DELETE FROM sync_trash
      WHERE user_id = ${userId}
        AND kind = ${mutation.kind}
        AND target_id = ${mutation.targetId}
    `;
    const result: TrashMutationResult = {
      idempotencyKey: mutation.idempotencyKey,
      status: "complete",
      record: null,
    };
    await sql`
      INSERT INTO sync_trash_ops (
        user_id, idempotency_key, action, kind, target_id, record
      )
      VALUES (
        ${userId},
        ${mutation.idempotencyKey},
        ${mutation.action},
        ${mutation.kind},
        ${mutation.targetId},
        ${null}
      )
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
    `;
    return (await loadTrashOp(userId, mutation.idempotencyKey)) ?? result;
  }

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
              id, user_id, thread_id, text, created_at, location, sequence,
              idempotency_key, attachments
            )
            VALUES (
              ${payload.id},
              ${userId},
              ${threadId},
              ${payload.text},
              ${payload.createdAt},
              ${JSON.stringify(payload.location)},
              ${payload.sequence},
              ${payload.idempotencyKey},
              ${JSON.stringify(payload.attachments ?? [])}
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
          AND NOT EXISTS (
            SELECT 1 FROM sync_trash
            WHERE sync_trash.user_id = ${userId}
              AND sync_trash.kind = 'thread'
              AND sync_trash.target_id = sync_threads.id
          )
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
          SELECT id, text, created_at, location, sequence, attachments
          FROM sync_captures
          WHERE user_id = ${userId} AND thread_id = ${thread.id}
            AND NOT EXISTS (
              SELECT 1 FROM sync_trash
              WHERE sync_trash.user_id = ${userId}
                AND sync_trash.kind = 'capture'
                AND sync_trash.target_id = sync_captures.id
            )
          ORDER BY sequence ASC
        `) as Array<{
          id: string;
          text: string;
          created_at: string;
          location: SyncCapturePayload["location"];
          sequence: number;
          attachments: SyncCapturePayload["attachments"];
        }>;
        if (captures.length === 0) continue;
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
            attachments: capture.attachments ?? [],
          })),
        });
      }
      return result;
    },

    async updateThreadTitle(userId, threadId, title) {
      await ensure();
      await sql`
        UPDATE sync_threads
        SET title = ${title}
        WHERE user_id = ${userId} AND id = ${threadId}
      `;
    },

    async applyTrashMutations(userId, mutations) {
      await ensure();
      const results: TrashMutationResult[] = [];
      const failures: TrashBatchResponse["failures"] = [];

      for (const mutation of mutations) {
        try {
          results.push(await applyOneTrash(userId, mutation));
        } catch (error) {
          failures.push({
            idempotencyKey: mutation.idempotencyKey,
            status: "needs_attention",
            reason: error instanceof Error ? error.message : "trash_failed",
            retryable: true,
          });
        }
      }

      return { results, failures };
    },

    async listTrash(userId) {
      await ensure();
      const rows = (await sql`
        SELECT kind, target_id, trashed_at, expires_at, attachment_ids
        FROM sync_trash
        WHERE user_id = ${userId}
        ORDER BY trashed_at DESC
      `) as Array<{
        kind: TrashRecord["kind"];
        target_id: string;
        trashed_at: string;
        expires_at: string;
        attachment_ids: string[];
      }>;
      return rows.map((row) => ({
        kind: row.kind,
        targetId: row.target_id,
        trashedAt: row.trashed_at,
        expiresAt: row.expires_at,
        attachmentIds: row.attachment_ids ?? [],
      }));
    },

    async purgeExpired(userId, now, operationId) {
      await ensure();
      const prior = (await sql`
        SELECT purged
        FROM sync_purge_ops
        WHERE user_id = ${userId} AND operation_id = ${operationId}
        LIMIT 1
      `) as Array<{ purged: PurgeTarget[] }>;
      if (prior[0]) {
        return { purged: prior[0].purged, duplicate: true };
      }

      const expired = (await sql`
        SELECT kind, target_id, expires_at, attachment_ids
        FROM sync_trash
        WHERE user_id = ${userId}
      `) as Array<{
        kind: TrashRecord["kind"];
        target_id: string;
        expires_at: string;
        attachment_ids: string[];
      }>;

      const purged: PurgeTarget[] = [];
      for (const row of expired) {
        if (!isExpired(row.expires_at, now)) continue;

        if (row.kind === "capture") {
          const existing = (await sql`
            SELECT thread_id
            FROM sync_captures
            WHERE user_id = ${userId} AND id = ${row.target_id}
            LIMIT 1
          `) as Array<{ thread_id: string }>;
          await sql`
            DELETE FROM sync_captures
            WHERE user_id = ${userId} AND id = ${row.target_id}
          `;
          if (existing[0]) {
            const remaining = (await sql`
              SELECT id FROM sync_captures
              WHERE user_id = ${userId} AND thread_id = ${existing[0].thread_id}
              LIMIT 1
            `) as Array<{ id: string }>;
            if (remaining.length === 0) {
              await sql`
                DELETE FROM sync_threads
                WHERE user_id = ${userId} AND id = ${existing[0].thread_id}
              `;
            }
          }
        } else {
          await sql`
            DELETE FROM sync_captures
            WHERE user_id = ${userId} AND thread_id = ${row.target_id}
          `;
          await sql`
            DELETE FROM sync_threads
            WHERE user_id = ${userId} AND id = ${row.target_id}
          `;
        }
        await sql`
          DELETE FROM sync_trash
          WHERE user_id = ${userId}
            AND kind = ${row.kind}
            AND target_id = ${row.target_id}
        `;
        purged.push({
          kind: row.kind,
          targetId: row.target_id,
          attachmentIds: row.attachment_ids ?? [],
        });
      }

      await sql`
        INSERT INTO sync_purge_ops (user_id, operation_id, purged)
        VALUES (${userId}, ${operationId}, ${JSON.stringify(purged)})
        ON CONFLICT (user_id, operation_id) DO NOTHING
      `;
      const stored = (await sql`
        SELECT purged
        FROM sync_purge_ops
        WHERE user_id = ${userId} AND operation_id = ${operationId}
        LIMIT 1
      `) as Array<{ purged: PurgeTarget[] }>;
      return {
        purged: stored[0]?.purged ?? purged,
        duplicate: false,
      } satisfies PurgeExpiredResult;
    },
  };
}
