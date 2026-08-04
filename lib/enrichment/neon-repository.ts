import { neon } from "@neondatabase/serverless";
import type { ThreadRepository } from "@/lib/sync/types";
import { MAX_ENRICHMENT_ATTEMPTS } from "./failures";
import type {
  EnrichmentJob,
  EnrichmentMention,
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
  /** False when pgvector is unavailable; similarity then simply has none. */
  let vectorReady = false;
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
        ALTER TABLE enrichment_jobs
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
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
          memory_patches JSONB NOT NULL DEFAULT '[]'::jsonb,
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
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS memory_patches JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS kind TEXT
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS ask TEXT
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS transcripts JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE enrichments
        ADD COLUMN IF NOT EXISTS suggested_questions JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      // Similarity storage. pgvector may be unavailable (an older branch, a
      // role without CREATE privileges); that costs the desk its "prior
      // Threads" fallback and nothing else, so it must not take the whole
      // schema down with it.
      try {
        await sql`CREATE EXTENSION IF NOT EXISTS vector`;
        await sql`
          CREATE TABLE IF NOT EXISTS thread_embeddings (
            user_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            model TEXT NOT NULL,
            embedding vector NOT NULL,
            embedded_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (user_id, thread_id)
          )
        `;
        vectorReady = true;
      } catch {
        vectorReady = false;
      }
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
    started_at?: string | Date | null;
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
      startedAt:
        row.started_at instanceof Date
          ? row.started_at.toISOString()
          : (row.started_at ?? null),
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
                 target_capture_ids, title, sources, research, memory_patches, created_at
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
          memory_patches: ThreadEnrichment["memoryPatches"];
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
               target_capture_ids, title, kind, topics, ask, sources, research,
               memory_patches, transcripts, mentions, suggested_questions,
               created_at
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
        kind: ThreadEnrichment["kind"];
        topics: string[] | null;
        ask: string | null;
        sources: ThreadEnrichment["sources"];
        research: ThreadEnrichment["research"];
        memory_patches: ThreadEnrichment["memoryPatches"];
        transcripts: ThreadEnrichment["transcripts"];
        mentions: ThreadEnrichment["mentions"];
        suggested_questions: ThreadEnrichment["suggestedQuestions"];
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
        kind: row.kind ?? null,
        topics: row.topics ?? [],
        ask: row.ask ?? null,
        sources: row.sources ?? [],
        research: row.research ?? [],
        memoryPatches: row.memory_patches ?? [],
        transcripts: row.transcripts ?? [],
        mentions: row.mentions ?? [],
        suggestedQuestions: row.suggested_questions ?? [],
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
               basis_history, target_capture_ids, model, status, attempts, error,
               started_at
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
        started_at: string | Date | null;
      }>;
      return rows.map(mapJob);
    },

    async markJobRunning(userId, jobId) {
      await ensure();
      await sql`
        UPDATE enrichment_jobs
        SET status = 'running',
            attempts = attempts + 1,
            error = NULL,
            started_at = now()
        WHERE user_id = ${userId}
          AND id = ${jobId}
          AND status IN ('queued', 'running')
      `;
      const rows = (await sql`
        SELECT id, idempotency_key, thread_id, basis_revision, basis_entry_ids,
               basis_history, target_capture_ids, model, status, attempts, error,
               started_at
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
        started_at: string | Date | null;
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
               target_capture_ids, title, kind, topics, ask, sources, research,
               memory_patches, transcripts, mentions, suggested_questions,
               created_at
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
        kind: ThreadEnrichment["kind"];
        topics: string[] | null;
        ask: string | null;
        sources: ThreadEnrichment["sources"];
        research: ThreadEnrichment["research"];
        memory_patches: ThreadEnrichment["memoryPatches"];
        transcripts: ThreadEnrichment["transcripts"];
        mentions: ThreadEnrichment["mentions"];
        suggested_questions: ThreadEnrichment["suggestedQuestions"];
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
          kind: existing[0].kind ?? null,
          topics: existing[0].topics ?? [],
          ask: existing[0].ask ?? null,
          sources: existing[0].sources ?? [],
          research: existing[0].research ?? [],
          memoryPatches: existing[0].memory_patches ?? [],
          transcripts: existing[0].transcripts ?? [],
          mentions: existing[0].mentions ?? [],
          suggestedQuestions: existing[0].suggested_questions ?? [],
        };
      } else {
        created = true;
        const createdAt = new Date().toISOString();
        await sql`
          INSERT INTO enrichments (
            id, user_id, thread_id, text, model, basis_revision,
            basis_entry_ids, target_capture_ids, title, kind, topics, ask,
            sources, research, memory_patches, transcripts, mentions,
            suggested_questions, created_at
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
            ${enrichment.kind ?? null},
            ${JSON.stringify(enrichment.topics ?? [])},
            ${enrichment.ask ?? null},
            ${JSON.stringify(enrichment.sources ?? [])},
            ${JSON.stringify(enrichment.research ?? [])},
            ${JSON.stringify(enrichment.memoryPatches ?? [])},
            ${JSON.stringify(enrichment.transcripts ?? [])},
            ${JSON.stringify(enrichment.mentions ?? [])},
            ${JSON.stringify(enrichment.suggestedQuestions ?? [])},
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
          kind: enrichment.kind ?? null,
          topics: enrichment.topics ?? [],
          ask: enrichment.ask ?? null,
          sources: enrichment.sources ?? [],
          research: enrichment.research ?? [],
          memoryPatches: enrichment.memoryPatches ?? [],
          transcripts: enrichment.transcripts ?? [],
          mentions: enrichment.mentions ?? [],
          suggestedQuestions: enrichment.suggestedQuestions ?? [],
        };
        if (enrichment.title && threadRepository.updateThreadTitle) {
          await threadRepository.updateThreadTitle(
            userId,
            job.threadId,
            enrichment.title,
          );
        }
        // The Thread carries the newest Enrichment's verdict, so the queue can
        // group by kind — and show an open question — without reading every
        // report. A follow-up that answers the question clears it.
        if (threadRepository.updateThreadClassification) {
          await threadRepository.updateThreadClassification(
            userId,
            job.threadId,
            {
              kind: enrichment.kind ?? null,
              topics: enrichment.topics ?? [],
              ask: enrichment.ask ?? null,
            },
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
      // Permanent failures (source media gone, model cannot read the media)
      // must not retry forever, and nothing retries past the attempt cap.
      // These predicates mirror lib/enrichment/failures.ts.
      if (jobId) {
        const updated = (await sql`
          UPDATE enrichment_jobs
          SET status = 'queued', error = NULL
          WHERE user_id = ${userId} AND id = ${jobId} AND status = 'failed'
            AND attempts < ${MAX_ENRICHMENT_ATTEMPTS}
            AND (error IS NULL OR (
              error NOT LIKE 'missing\_original\_media\_%'
              AND error NOT LIKE 'model\_%\_unsupported\_media\_%'
            ))
          RETURNING id
        `) as Array<{ id: string }>;
        return updated.length;
      }
      const updated = (await sql`
        UPDATE enrichment_jobs
        SET status = 'queued', error = NULL
        WHERE user_id = ${userId} AND status = 'failed'
          AND attempts < ${MAX_ENRICHMENT_ATTEMPTS}
          AND (error IS NULL OR (
            error NOT LIKE 'missing\_original\_media\_%'
            AND error NOT LIKE 'model\_%\_unsupported\_media\_%'
          ))
        RETURNING id
      `) as Array<{ id: string }>;
      return updated.length;
    },

    async storeThreadEmbedding(userId, threadId, embedding) {
      await ensure();
      if (!vectorReady || embedding.vector.length === 0) return;
      const literal = `[${embedding.vector.join(",")}]`;
      const embeddedAt = embedding.embeddedAt ?? new Date().toISOString();
      // Re-embedding replaces: one row per Thread, always the current model.
      await sql`
        INSERT INTO thread_embeddings (
          user_id, thread_id, model, embedding, embedded_at
        ) VALUES (
          ${userId}, ${threadId}, ${embedding.model}, ${literal}::vector,
          ${embeddedAt}
        )
        ON CONFLICT (user_id, thread_id) DO UPDATE
        SET model = EXCLUDED.model,
            embedding = EXCLUDED.embedding,
            embedded_at = EXCLUDED.embedded_at
      `;
    },

    async listEmbeddedThreadIds(userId, model) {
      await ensure();
      if (!vectorReady) return [];
      const rows = (await sql`
        SELECT thread_id FROM thread_embeddings
        WHERE user_id = ${userId} AND model = ${model}
      `) as Array<{ thread_id: string }>;
      return rows.map((row) => row.thread_id);
    },

    async listThreadMentionIndex(userId) {
      await ensure();
      // One row per Thread: its newest Enrichment is the current reading of
      // what the Thread is about.
      const rows = (await sql`
        SELECT DISTINCT ON (e.thread_id)
               e.thread_id, e.mentions, t.title, t.created_at
        FROM enrichments e
        JOIN threads t ON t.id = e.thread_id AND t.user_id = e.user_id
        WHERE e.user_id = ${userId}
        ORDER BY e.thread_id, e.created_at DESC
      `) as Array<{
        thread_id: string;
        mentions: EnrichmentMention[] | null;
        title: string;
        created_at: string;
      }>;
      return rows.map((row) => ({
        threadId: row.thread_id,
        title: row.title,
        at: new Date(row.created_at).toISOString(),
        mentions: row.mentions ?? [],
      }));
    },

    async findSimilarToVector(userId, vector, options) {
      await ensure();
      if (!vectorReady || vector.length === 0) return [];
      const literal = `[${vector.join(",")}]`;
      const rows = (await sql`
        SELECT thread_id, 1 - (embedding <=> ${literal}::vector) AS score
        FROM thread_embeddings
        WHERE user_id = ${userId}
          AND model = ${options.model}
          AND thread_id <> ${options.excludeThreadId ?? ""}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${options.limit ?? 5}
      `) as Array<{ thread_id: string; score: number }>;
      return rows.map((row) => ({
        threadId: row.thread_id,
        score: Number(row.score),
      }));
    },

    async findSimilarThreads(userId, threadId, options) {
      await ensure();
      if (!vectorReady) return [];
      const limit = options?.limit ?? 5;
      const mine = (await sql`
        SELECT model, embedding::text AS embedding FROM thread_embeddings
        WHERE user_id = ${userId} AND thread_id = ${threadId}
      `) as Array<{ model: string; embedding: string }>;
      // No embedding yet is a first sighting, not a failure.
      if (mine.length === 0) return [];
      // Only ever compared against its own model: two models do not share a
      // vector space, so a cross-model neighbour is noise wearing a number.
      const rows = (await sql`
        SELECT thread_id, 1 - (embedding <=> ${mine[0].embedding}::vector) AS score
        FROM thread_embeddings
        WHERE user_id = ${userId}
          AND model = ${mine[0].model}
          AND thread_id <> ${threadId}
        ORDER BY embedding <=> ${mine[0].embedding}::vector
        LIMIT ${limit}
      `) as Array<{ thread_id: string; score: number }>;
      return rows.map((row) => ({
        threadId: row.thread_id,
        score: Number(row.score),
      }));
    },
  };
}
