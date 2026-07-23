import { neon } from "@neondatabase/serverless";
import type { ThreadRepository } from "@/lib/sync/types";
import type {
  EnrichmentJob,
  EnrichmentRepository,
  EnrichmentThreadSnapshot,
  ThreadEnrichment,
} from "./types";

export function createNeonEnrichmentRepository(
  databaseUrl: string,
  threadRepository: ThreadRepository,
): EnrichmentRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS enrichment_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          basis_revision INTEGER NOT NULL,
          basis_entry_ids JSONB NOT NULL,
          basis_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          target_capture_ids JSONB NOT NULL,
          model TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          UNIQUE (user_id, idempotency_key)
        )
      `;
      await sql`
        ALTER TABLE enrichment_jobs
        ADD COLUMN IF NOT EXISTS basis_history JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS enrichments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          text TEXT NOT NULL,
          model TEXT NOT NULL,
          basis_revision INTEGER NOT NULL,
          basis_entry_ids JSONB NOT NULL,
          target_capture_ids JSONB NOT NULL,
          title TEXT,
          sources JSONB NOT NULL DEFAULT '[]'::jsonb,
          research JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS research JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS enrichment_inclusions (
          user_id TEXT NOT NULL,
          capture_id TEXT NOT NULL,
          enrichment_id TEXT NOT NULL,
          PRIMARY KEY (user_id, capture_id)
        )
      `;
    })();
    return ready;
  };

  function mapJob(row: {
    id: string;
    idempotency_key: string;
    thread_id: string;
    basis_revision: number;
    basis_entry_ids: string[];
    basis_history?: EnrichmentJob["basisHistory"] | null;
    target_capture_ids: string[];
    model: string;
    status: EnrichmentJob["status"];
    attempts: number;
    error: string | null;
  }): EnrichmentJob {
    return {
      id: row.id,
      idempotencyKey: row.idempotency_key,
      threadId: row.thread_id,
      basisRevision: row.basis_revision,
      basisEntryIds: row.basis_entry_ids,
      basisHistory: row.basis_history ?? [],
      targetCaptureIds: row.target_capture_ids,
      model: row.model,
      status: row.status,
      attempts: row.attempts,
      error: row.error ?? undefined,
    };
  }

  return {
    async listPendingThreads(userId) {
      await ensure();
      const threads = await threadRepository.listThreads(userId);
      const snapshots: EnrichmentThreadSnapshot[] = [];
      for (const thread of threads) {
        const enrichments = (await sql`
          SELECT id, thread_id, text, model, basis_revision, basis_entry_ids,
                 target_capture_ids, title, sources, research, created_at
          FROM enrichments
          WHERE user_id = ${userId} AND thread_id = ${thread.id}
          ORDER BY created_at ASC
        `) as Array<{
          id: string;
          thread_id: string;
          text: string;
          model: string;
          basis_revision: number;
          basis_entry_ids: string[];
          target_capture_ids: string[];
          title: string | null;
          sources: ThreadEnrichment["sources"];
          research: ThreadEnrichment["research"];
          created_at: string;
        }>;
        const captureIds = thread.captures.map((capture) => capture.id);
        const inclusions = (
          captureIds.length === 0
            ? []
            : ((await sql`
          SELECT capture_id, enrichment_id
          FROM enrichment_inclusions
          WHERE user_id = ${userId}
            AND capture_id = ANY(${captureIds})
        `) as Array<{ capture_id: string; enrichment_id: string }>)
        );
        const includedBy = new Map(
          inclusions.map((row) => [row.capture_id, row.enrichment_id]),
        );
        const ordered = [
          ...thread.captures.map((capture) => ({
            order: capture.sequence,
            entry: {
              id: capture.id,
              kind: "capture" as const,
              text: capture.text,
              sequence: capture.sequence,
              includedBy: includedBy.get(capture.id) ?? null,
              createdAt: capture.createdAt,
              location: capture.location,
              attachments: capture.attachments ?? [],
            },
          })),
          ...enrichments.map((entry, index) => ({
            order: entry.basis_revision + 0.5 + index * 0.001,
            entry: {
              id: entry.id,
              kind: "enrichment" as const,
              text: entry.text,
              model: entry.model,
              basisRevision: entry.basis_revision,
              sources: entry.sources ?? [],
            },
          })),
        ]
          .sort((a, b) => a.order - b.order)
          .map((item) => item.entry);
        snapshots.push({
          id: thread.id,
          title: thread.title,
          revision: thread.revision,
          enrichmentCount: enrichments.length,
          entries: ordered,
        });
      }
      return snapshots;
    },

    async listThreadEnrichments(userId, threadId) {
      await ensure();
      const rows = (await sql`
        SELECT id, thread_id, text, model, basis_revision, basis_entry_ids,
               target_capture_ids, title, sources, research, created_at
        FROM enrichments
        WHERE user_id = ${userId} AND thread_id = ${threadId}
        ORDER BY created_at ASC
      `) as Array<{
        id: string;
        thread_id: string;
        text: string;
        model: string;
        basis_revision: number;
        basis_entry_ids: string[];
        target_capture_ids: string[];
        title: string | null;
        sources: ThreadEnrichment["sources"];
        research: ThreadEnrichment["research"];
        created_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        threadId: row.thread_id,
        text: row.text,
        model: row.model,
        basisRevision: row.basis_revision,
        basisEntryIds: row.basis_entry_ids,
        targetCaptureIds: row.target_capture_ids,
        createdAt: row.created_at,
        title: row.title,
        sources: row.sources ?? [],
        research: row.research ?? [],
      }));
    },

    async getOrCreateJob(userId, job) {
      await ensure();
      const existing = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId} AND idempotency_key = ${job.idempotencyKey}
        LIMIT 1
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      if (existing[0]) return mapJob(existing[0]);

      await sql`
        INSERT INTO enrichment_jobs (
          id, user_id, idempotency_key, thread_id, basis_revision,
          basis_entry_ids, basis_history, target_capture_ids, model, status, attempts
        ) VALUES (
          ${job.id},
          ${userId},
          ${job.idempotencyKey},
          ${job.threadId},
          ${job.basisRevision},
          ${JSON.stringify(job.basisEntryIds)},
          ${JSON.stringify(job.basisHistory ?? [])},
          ${JSON.stringify(job.targetCaptureIds)},
          ${job.model},
          ${job.status ?? "queued"},
          0
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
      `;
      const created = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId} AND idempotency_key = ${job.idempotencyKey}
        LIMIT 1
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      return mapJob(created[0]);
    },

    async listOpenJobs(userId) {
      await ensure();
      const rows = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId}
          AND status IN ('queued', 'running', 'failed')
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      return rows.map(mapJob);
    },

    async markJobRunning(userId, jobId) {
      await ensure();
      await sql`
        UPDATE enrichment_jobs
        SET status = 'running',
            attempts = attempts + 1,
            error = NULL
        WHERE user_id = ${userId}
          AND id = ${jobId}
          AND status IN ('queued', 'running')
      `;
      const rows = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId} AND id = ${jobId}
        LIMIT 1
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      if (!rows[0]) throw new Error(`Unknown job ${jobId}`);
      return mapJob(rows[0]);
    },

    async markJobFailed(userId, jobId, error) {
      await ensure();
      await sql`
        UPDATE enrichment_jobs
        SET status = 'failed', error = ${error}
        WHERE user_id = ${userId}
          AND id = ${jobId}
          AND status IN ('queued', 'running')
      `;
      const rows = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId} AND id = ${jobId}
        LIMIT 1
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      if (!rows[0]) throw new Error(`Unknown job ${jobId}`);
      return mapJob(rows[0]);
    },

    async completeJob(userId, jobId, enrichment) {
      await ensure();
      const jobs = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error
        FROM enrichment_jobs
        WHERE user_id = ${userId} AND id = ${jobId}
        LIMIT 1
      `) as Array<{
        id: string;
        idempotency_key: string;
        thread_id: string;
        basis_revision: number;
        basis_entry_ids: string[];
        basis_history: EnrichmentJob["basisHistory"];
        target_capture_ids: string[];
        model: string;
        status: EnrichmentJob["status"];
        attempts: number;
        error: string | null;
      }>;
      const job = jobs[0] ? mapJob(jobs[0]) : null;
      if (!job) throw new Error(`Unknown job ${jobId}`);

      const enrichmentId = `enrichment:${job.id}`;
      const existing = (await sql`
        SELECT id, thread_id, text, model, basis_revision, basis_entry_ids,
               target_capture_ids, title, sources, research, created_at
        FROM enrichments
        WHERE user_id = ${userId} AND id = ${enrichmentId}
        LIMIT 1
      `) as Array<{
        id: string;
        thread_id: string;
        text: string;
        model: string;
        basis_revision: number;
        basis_entry_ids: string[];
        target_capture_ids: string[];
        title: string | null;
        sources: ThreadEnrichment["sources"];
        research: ThreadEnrichment["research"];
        created_at: string;
      }>;

      let created = false;
      let stored: ThreadEnrichment;
      if (existing[0]) {
        stored = {
          id: existing[0].id,
          threadId: existing[0].thread_id,
          text: existing[0].text,
          model: existing[0].model,
          basisRevision: existing[0].basis_revision,
          basisEntryIds: existing[0].basis_entry_ids,
          targetCaptureIds: existing[0].target_capture_ids,
          createdAt: existing[0].created_at,
          title: existing[0].title,
          sources: existing[0].sources ?? [],
          research: existing[0].research ?? [],
        };
      } else {
        created = true;
        const createdAt = new Date().toISOString();
        await sql`
          INSERT INTO enrichments (
            id, user_id, thread_id, text, model, basis_revision,
            basis_entry_ids, target_capture_ids, title, sources, research, created_at
          ) VALUES (
            ${enrichmentId},
            ${userId},
            ${job.threadId},
            ${enrichment.text},
            ${enrichment.model},
            ${job.basisRevision},
            ${JSON.stringify(job.basisEntryIds)},
            ${JSON.stringify(job.targetCaptureIds)},
            ${enrichment.title},
            ${JSON.stringify(enrichment.sources ?? [])},
            ${JSON.stringify(enrichment.research ?? [])},
            ${createdAt}
          )
          ON CONFLICT (id) DO NOTHING
        `;
        stored = {
          id: enrichmentId,
          threadId: job.threadId,
          text: enrichment.text,
          model: enrichment.model,
          basisRevision: job.basisRevision,
          basisEntryIds: [...job.basisEntryIds],
          targetCaptureIds: [...job.targetCaptureIds],
          createdAt,
          title: enrichment.title,
          sources: enrichment.sources ?? [],
          research: enrichment.research ?? [],
        };
        if (enrichment.title && threadRepository.updateThreadTitle) {
          await threadRepository.updateThreadTitle(
            userId,
            job.threadId,
            enrichment.title,
          );
        }
      }

      for (const captureId of job.targetCaptureIds) {
        await sql`
          INSERT INTO enrichment_inclusions (user_id, capture_id, enrichment_id)
          VALUES (${userId}, ${captureId}, ${enrichmentId})
          ON CONFLICT (user_id, capture_id) DO NOTHING
        `;
      }

      await sql`
        UPDATE enrichment_jobs
        SET status = 'complete', error = NULL
        WHERE user_id = ${userId}
          AND id = ${jobId}
          AND status IN ('queued', 'running', 'complete')
      `;

      return {
        job: { ...job, status: "complete", error: undefined },
        enrichment: stored,
        created,
      };
    },

    async resetInclusions(userId, captureIds) {
      await ensure();
      if (captureIds.length === 0) return 0;
      const deleted = (await sql`
        DELETE FROM enrichment_inclusions
        WHERE user_id = ${userId} AND capture_id = ANY(${captureIds})
        RETURNING capture_id
      `) as Array<{ capture_id: string }>;
      return deleted.length;
    },

    async requeueFailed(userId, jobId) {
      await ensure();
      if (jobId) {
        const updated = (await sql`
          UPDATE enrichment_jobs
          SET status = 'queued', error = NULL
          WHERE user_id = ${userId} AND id = ${jobId} AND status = 'failed'
            AND (error IS NULL OR error NOT LIKE 'missing\_original\_media\_%')
          RETURNING id
        `) as Array<{ id: string }>;
        return updated.length;
      }
      // Permanent failures (source media gone) must not retry forever.
      const updated = (await sql`
        UPDATE enrichment_jobs
        SET status = 'queued', error = NULL
        WHERE user_id = ${userId} AND status = 'failed'
          AND (error IS NULL OR error NOT LIKE 'missing\_original\_media\_%')
        RETURNING id
      `) as Array<{ id: string }>;
      return updated.length;
    },
  };
}
