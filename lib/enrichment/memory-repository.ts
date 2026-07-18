import { createMemoryThreadRepository } from "@/lib/sync/memory-repository";
import type { ThreadRepository } from "@/lib/sync/types";
import type {
  EnrichmentJob,
  EnrichmentRepository,
  EnrichmentThreadSnapshot,
  ThreadEnrichment,
} from "./types";

type MemoryEnrichmentState = {
  jobs: Map<string, EnrichmentJob>;
  enrichments: Map<string, ThreadEnrichment>;
  includedBy: Map<string, string>;
  /** userId:idempotencyKey -> job id */
  jobKeys: Map<string, string>;
};

const states = new Map<string, MemoryEnrichmentState>();

function createState(): MemoryEnrichmentState {
  return {
    jobs: new Map(),
    enrichments: new Map(),
    includedBy: new Map(),
    jobKeys: new Map(),
  };
}

function stateFor(namespace: string): MemoryEnrichmentState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created = createState();
  states.set(namespace, created);
  return created;
}

export function resetMemoryEnrichmentRepository(namespace = "default"): void {
  states.set(namespace, createState());
}

function jobKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey}`;
}

export function createMemoryEnrichmentRepository(
  namespace = "default",
  threadRepository: ThreadRepository = createMemoryThreadRepository(namespace),
): EnrichmentRepository {
  const state = () => stateFor(namespace);

  return {
    async listPendingThreads(userId) {
      const threads = await threadRepository.listThreads(userId);
      const db = state();
      return threads.map((thread) => {
        const forThread = [...db.enrichments.entries()]
          .filter(([key]) => key.startsWith(`${userId}:`))
          .map(([, entry]) => entry)
          .filter((entry) => entry.threadId === thread.id);
        const captureEntries = thread.captures.map((capture) => ({
          id: capture.id,
          kind: "capture" as const,
          text: capture.text,
          sequence: capture.sequence,
          includedBy: db.includedBy.get(`${userId}:${capture.id}`) ?? null,
          order: capture.sequence,
        }));
        const enrichmentEntries = forThread.map((entry, index) => ({
          id: entry.id,
          kind: "enrichment" as const,
          text: entry.text,
          model: entry.model,
          basisRevision: entry.basisRevision,
          order: entry.basisRevision + 0.5 + index * 0.001,
        }));
        const entries = [...captureEntries, ...enrichmentEntries]
          .sort((a, b) => a.order - b.order)
          .map((entry) => {
            const { order, sequence, ...rest } = entry as typeof entry & {
              order: number;
              sequence?: number;
            };
            void order;
            if (rest.kind === "capture") {
              return {
                id: rest.id,
                kind: "capture" as const,
                text: rest.text,
                sequence: sequence ?? 0,
                includedBy: (rest as { includedBy: string | null }).includedBy,
              };
            }
            return {
              id: rest.id,
              kind: "enrichment" as const,
              text: rest.text,
              model: (rest as { model: string }).model,
              basisRevision: (rest as { basisRevision: number }).basisRevision,
            };
          });

        return {
          id: thread.id,
          title: thread.title,
          revision: thread.revision,
          enrichmentCount: forThread.length,
          entries,
        } satisfies EnrichmentThreadSnapshot;
      });
    },

    async getOrCreateJob(userId, job) {
      const db = state();
      const key = jobKey(userId, job.idempotencyKey);
      const existingId = db.jobKeys.get(key);
      if (existingId) {
        const existing = db.jobs.get(`${userId}:${existingId}`);
        if (existing) return existing;
      }
      const created: EnrichmentJob = {
        id: job.id,
        idempotencyKey: job.idempotencyKey,
        threadId: job.threadId,
        basisRevision: job.basisRevision,
        basisEntryIds: job.basisEntryIds,
        basisHistory: job.basisHistory ?? [],
        targetCaptureIds: job.targetCaptureIds,
        model: job.model,
        status: job.status ?? "queued",
        attempts: 0,
      };
      db.jobs.set(`${userId}:${created.id}`, created);
      db.jobKeys.set(key, created.id);
      return created;
    },

    async listOpenJobs(userId) {
      return [...state().jobs.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([, job]) => job)
        .filter(
          (job) =>
            job.status === "queued" ||
            job.status === "running" ||
            job.status === "failed",
        );
    },

    async markJobRunning(userId, jobId) {
      const db = state();
      const job = db.jobs.get(`${userId}:${jobId}`);
      if (!job) throw new Error(`Unknown job ${jobId}`);
      const next: EnrichmentJob = {
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        error: undefined,
      };
      db.jobs.set(`${userId}:${jobId}`, next);
      return next;
    },

    async markJobFailed(userId, jobId, error) {
      const db = state();
      const job = db.jobs.get(`${userId}:${jobId}`);
      if (!job) throw new Error(`Unknown job ${jobId}`);
      const next: EnrichmentJob = { ...job, status: "failed", error };
      db.jobs.set(`${userId}:${jobId}`, next);
      return next;
    },

    async completeJob(userId, jobId, enrichment) {
      const db = state();
      const job = db.jobs.get(`${userId}:${jobId}`);
      if (!job) throw new Error(`Unknown job ${jobId}`);

      const enrichmentId = `enrichment:${job.id}`;
      const existing = db.enrichments.get(`${userId}:${enrichmentId}`);
      let created = false;
      let stored = existing;
      if (!stored) {
        created = true;
        stored = {
          id: enrichmentId,
          threadId: job.threadId,
          text: enrichment.text,
          model: enrichment.model,
          basisRevision: job.basisRevision,
          basisEntryIds: [...job.basisEntryIds],
          targetCaptureIds: [...job.targetCaptureIds],
          createdAt: new Date().toISOString(),
          title: enrichment.title,
        };
        db.enrichments.set(`${userId}:${enrichmentId}`, stored);
        if (enrichment.title && threadRepository.updateThreadTitle) {
          await threadRepository.updateThreadTitle(
            userId,
            job.threadId,
            enrichment.title,
          );
        }
      }
      for (const captureId of job.targetCaptureIds) {
        if (!db.includedBy.has(`${userId}:${captureId}`)) {
          db.includedBy.set(`${userId}:${captureId}`, enrichmentId);
        }
      }
      const nextJob: EnrichmentJob = {
        ...job,
        status: "complete",
        error: undefined,
      };
      db.jobs.set(`${userId}:${jobId}`, nextJob);
      return { job: nextJob, enrichment: stored, created };
    },

    async requeueFailed(userId, jobId) {
      const db = state();
      let count = 0;
      for (const [key, job] of db.jobs) {
        if (!key.startsWith(`${userId}:`)) continue;
        if (job.status !== "failed") continue;
        if (jobId && job.id !== jobId) continue;
        db.jobs.set(key, { ...job, status: "queued", error: undefined });
        count += 1;
      }
      return count;
    },
  };
}
