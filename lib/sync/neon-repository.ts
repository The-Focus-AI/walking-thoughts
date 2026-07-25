import { neon } from "@neondatabase/serverless";
import { titleFromText } from "@/lib/local-capture/thread-destination";
import { asThreadKind } from "@/lib/local-capture/types";
import { expiresAtFrom, isExpired } from "./trash";
import type {
  PurgeExpiredResult,
  PurgeTarget,
  SyncBatchResponse,
  SyncCapturePayload,
  SyncCaptureResult,
  ThreadRepository,
  ThreadSplitResult,
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
          updated_at TIMESTAMPTZ NOT NULL,
          reviewed_at TIMESTAMPTZ
        )
      `;
      await sql`
        ALTER TABLE sync_threads
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
      `;
      await sql`
        ALTER TABLE sync_threads
        ADD COLUMN IF NOT EXISTS kind TEXT
      `;
      await sql`
        ALTER TABLE sync_threads
        ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE sync_threads
        ADD COLUMN IF NOT EXISTS ask TEXT
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          UNIQUE (user_id, name)
        )
      `;
      await sql`
        ALTER TABLE sync_threads
        ADD COLUMN IF NOT EXISTS project_id TEXT
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
        SELECT t.id, t.title, t.revision, t.updated_at, t.reviewed_at, t.kind,
               t.topics, t.ask, t.project_id, p.name AS project_name
        FROM sync_threads t
        LEFT JOIN sync_projects p ON p.id = t.project_id AND p.user_id = t.user_id
        WHERE t.user_id = ${userId}
          AND NOT EXISTS (
            SELECT 1 FROM sync_trash
            WHERE sync_trash.user_id = ${userId}
              AND sync_trash.kind = 'thread'
              AND sync_trash.target_id = t.id
          )
        ORDER BY t.updated_at DESC
      `) as Array<{
        id: string;
        title: string;
        revision: number;
        updated_at: string;
        reviewed_at: string | null;
        kind: string | null;
        topics: string[] | null;
        ask: string | null;
        project_id: string | null;
        project_name: string | null;
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
          reviewedAt: thread.reviewed_at ?? null,
          kind: asThreadKind(thread.kind),
          topics: thread.topics ?? [],
          ask: thread.ask ?? null,
          projectId: thread.project_id ?? null,
          projectName: thread.project_name ?? null,
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

    async listProjects(userId) {
      await ensure();
      const rows = (await sql`
        SELECT id, name, created_at FROM sync_projects
        WHERE user_id = ${userId}
        ORDER BY name ASC
      `) as Array<{ id: string; name: string; created_at: string }>;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
      }));
    },

    async createProject(userId, name) {
      await ensure();
      const trimmed = name.trim();
      if (!trimmed) throw new Error("project_name_required");
      const rows = (await sql`
        INSERT INTO sync_projects (id, user_id, name, created_at)
        VALUES (${crypto.randomUUID()}, ${userId}, ${trimmed}, ${new Date().toISOString()})
        ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name, created_at
      `) as Array<{ id: string; name: string; created_at: string }>;
      return {
        id: rows[0].id,
        name: rows[0].name,
        createdAt: rows[0].created_at,
      };
    },

    async fileThread(userId, threadId, filing) {
      await ensure();
      const updated = (await sql`
        UPDATE sync_threads
        SET reviewed_at = ${filing.reviewedAt},
            kind = COALESCE(${filing.kind ?? null}, kind),
            project_id = CASE
              WHEN ${filing.projectId === undefined} THEN project_id
              ELSE ${filing.projectId ?? null}
            END
        WHERE user_id = ${userId} AND id = ${threadId}
        RETURNING id
      `) as Array<{ id: string }>;
      if (updated.length === 0) return null;
      const threads = await this.listThreads(userId);
      return threads.find((thread) => thread.id === threadId) ?? null;
    },

    async updateThreadClassification(userId, threadId, classification) {
      await ensure();
      // An Enrichment that could not tell leaves the prior verdict standing;
      // the question it asked always replaces the previous one, so answering
      // a Thread clears it.
      await sql`
        UPDATE sync_threads
        SET kind = CASE
              WHEN reviewed_at IS NOT NULL THEN kind
              ELSE COALESCE(${classification.kind}, kind)
            END,
            topics = CASE
              WHEN ${classification.topics.length} > 0
                THEN ${JSON.stringify(classification.topics)}::jsonb
              ELSE topics
            END,
            ask = ${classification.ask}
        WHERE user_id = ${userId} AND id = ${threadId}
      `;
    },

    async setThreadReviewed(userId, threadId, reviewedAt) {
      await ensure();
      const updated = (await sql`
        UPDATE sync_threads
        SET reviewed_at = ${reviewedAt}
        WHERE user_id = ${userId} AND id = ${threadId}
        RETURNING id
      `) as Array<{ id: string }>;
      if (!updated[0]) throw new Error("thread_not_found");
      return { threadId, reviewedAt };
    },

    async splitThread(userId, threadId, now = new Date().toISOString()) {
      await ensure();
      const captures = (await sql`
        SELECT id, text, created_at
        FROM sync_captures
        WHERE user_id = ${userId} AND thread_id = ${threadId}
          AND NOT EXISTS (
            SELECT 1 FROM sync_trash
            WHERE sync_trash.user_id = ${userId}
              AND sync_trash.kind = 'capture'
              AND sync_trash.target_id = sync_captures.id
          )
        ORDER BY sequence ASC
      `) as Array<{ id: string; text: string; created_at: string }>;

      const result: ThreadSplitResult = { moves: [], trashedThreadId: null };
      if (captures.length <= 1) return result;

      for (const capture of captures) {
        const newThreadId = capture.id;
        const title = titleFromText(capture.text || "Capture");
        await sql`
          INSERT INTO sync_threads (id, user_id, title, revision, updated_at)
          VALUES (${newThreadId}, ${userId}, ${title}, 1, ${capture.created_at})
          ON CONFLICT (id) DO NOTHING
        `;
        await sql`
          UPDATE sync_captures
          SET thread_id = ${newThreadId}, sequence = 1
          WHERE user_id = ${userId} AND id = ${capture.id}
        `;
        result.moves.push({
          captureId: capture.id,
          threadId: newThreadId,
          title,
          createdAt: capture.created_at,
        });
      }

      // Media now belongs to the moved Captures — the emptied Thread's
      // Trash record must not claim (and later purge) any attachments.
      await applyOneTrash(userId, {
        action: "trash",
        kind: "thread",
        targetId: threadId,
        trashedAt: now,
        attachmentIds: [],
        idempotencyKey: `split:${threadId}`,
      });
      result.trashedThreadId = threadId;
      return result;
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
