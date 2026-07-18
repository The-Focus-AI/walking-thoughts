import type { ThreadRepository } from "@/lib/sync/types";
import { enrichmentSystemAndModel, getGatewayClient } from "./gateway";
import { buildEnrichmentPrompt } from "./system-instruction";
import type {
  EnrichmentBatchResponse,
  EnrichmentCaptureResult,
  EnrichmentJob,
  EnrichmentRepository,
  EnrichmentThreadSnapshot,
  GatewayClient,
} from "./types";

function createJobId(): string {
  return crypto.randomUUID();
}

function pendingCaptureIds(thread: EnrichmentThreadSnapshot): string[] {
  return thread.entries
    .filter(
      (entry) =>
        entry.kind === "capture" && entry.includedBy === null,
    )
    .map((entry) => entry.id);
}

function hasOpenEnrichJob(
  jobs: EnrichmentJob[],
  threadId: string,
): boolean {
  return jobs.some(
    (job) =>
      job.threadId === threadId &&
      (job.status === "queued" ||
        job.status === "running" ||
        job.status === "failed"),
  );
}

async function queueJobsForThreads(
  userId: string,
  repository: EnrichmentRepository,
  model: string,
): Promise<void> {
  const [threads, openJobs] = await Promise.all([
    repository.listPendingThreads(userId),
    repository.listOpenJobs(userId),
  ]);

  for (const thread of threads) {
    if (hasOpenEnrichJob(openJobs, thread.id)) continue;
    const targetCaptureIds = pendingCaptureIds(thread);
    if (targetCaptureIds.length === 0) continue;

    const basisEntryIds = thread.entries.map((entry) => entry.id);
    const basisHistory = thread.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      text: entry.text,
    }));
    await repository.getOrCreateJob(userId, {
      id: createJobId(),
      idempotencyKey: `enrich:${thread.id}:r${thread.revision}`,
      threadId: thread.id,
      basisRevision: thread.revision,
      basisEntryIds,
      basisHistory,
      targetCaptureIds,
      model,
      status: "queued",
    });
  }
}

async function runJob(
  userId: string,
  repository: EnrichmentRepository,
  gateway: GatewayClient,
  job: EnrichmentJob,
  threadsById: Map<string, EnrichmentThreadSnapshot>,
  system: string,
): Promise<EnrichmentCaptureResult[]> {
  if (job.status === "failed") {
    return job.targetCaptureIds.map((id) => ({
      id,
      threadId: job.threadId,
      status: "needs_attention" as const,
      reason: job.error ?? "enrichment_failed",
      retryable: true,
    }));
  }

  const running =
    job.status === "running"
      ? job
      : await repository.markJobRunning(userId, job.id);

  const thread = threadsById.get(running.threadId);
  if (!thread) {
    await repository.markJobFailed(userId, running.id, "thread_missing");
    return running.targetCaptureIds.map((id) => ({
      id,
      threadId: running.threadId,
      status: "needs_attention" as const,
      reason: "thread_missing",
      retryable: true,
    }));
  }

  try {
    const requestTitle = thread.enrichmentCount === 0;
    const frozenHistory =
      running.basisHistory.length > 0
        ? running.basisHistory
        : thread.entries
            .filter((entry) => running.basisEntryIds.includes(entry.id))
            .map((entry) => ({
              id: entry.id,
              kind: entry.kind,
              text: entry.text,
            }));
    const prompt = buildEnrichmentPrompt({
      threadTitle: thread.title,
      history: frozenHistory,
      targetCaptureIds: running.targetCaptureIds,
      requestTitle,
    });
    const generation = await gateway.generate({
      model: running.model,
      system,
      prompt,
      requestTitle,
    });
    const completed = await repository.completeJob(userId, running.id, {
      text: generation.text,
      model: generation.model,
      title: generation.title,
    });

    return running.targetCaptureIds.map((id) => ({
      id,
      threadId: running.threadId,
      status: "complete" as const,
      enrichmentId: completed.enrichment.id,
      threadTitle: completed.enrichment.title ?? undefined,
    }));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "enrichment_failed";
    await repository.markJobFailed(userId, running.id, reason);
    return running.targetCaptureIds.map((id) => ({
      id,
      threadId: running.threadId,
      status: "needs_attention" as const,
      reason,
      retryable: true,
    }));
  }
}

export async function processPendingEnrichments(
  userId: string,
  repository: EnrichmentRepository,
  options: {
    gateway?: GatewayClient;
    retryFailed?: boolean;
    environment?: NodeJS.ProcessEnv;
    threadRepository?: ThreadRepository;
  } = {},
): Promise<EnrichmentBatchResponse> {
  const environment = options.environment ?? process.env;
  const { system, model } = enrichmentSystemAndModel(environment);
  const gateway = options.gateway ?? getGatewayClient(environment);

  if (options.retryFailed) {
    await repository.requeueFailed(userId);
  }

  await queueJobsForThreads(userId, repository, model);

  const threads = await repository.listPendingThreads(userId);
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const openJobs = await repository.listOpenJobs(userId);
  const runnable = openJobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );

  const results: EnrichmentCaptureResult[] = [];
  for (const job of runnable) {
    const jobResults = await runJob(
      userId,
      repository,
      gateway,
      job,
      threadsById,
      system,
    );
    for (const result of jobResults) {
      results.push(result);
    }
  }

  for (const job of openJobs) {
    if (job.status !== "failed") continue;
    if (results.some((result) => job.targetCaptureIds.includes(result.id))) {
      continue;
    }
    results.push(
      ...job.targetCaptureIds.map((id) => ({
        id,
        threadId: job.threadId,
        status: "needs_attention" as const,
        reason: job.error ?? "enrichment_failed",
        retryable: true,
      })),
    );
  }

  const jobs = await repository.listOpenJobs(userId);
  return { results, jobs };
}
