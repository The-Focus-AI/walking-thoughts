import type { MediaKind } from "@/lib/local-capture/types";
import { getPrivateBlobStore } from "@/lib/media/blob-store";
import { applyMemoryPatch } from "@/lib/memory/patches";
import { EMPTY_PROFILE_HINT, renderWalkerProfile } from "@/lib/memory/profile";
import { getWalkerMemoryRepository } from "@/lib/memory/repository";
import type { WalkerMemoryRepository } from "@/lib/memory/types";
import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import { notifyEnrichmentOutcome } from "@/lib/push/notify";
import { getPushRepository } from "@/lib/push/repository";
import { createWebPushSender } from "@/lib/push/send";
import type { PushRepository, PushSender } from "@/lib/push/types";
import type { Project, ThreadRepository } from "@/lib/sync/types";
import { assertModelSupportsMedia } from "./capabilities";
import {
  isPermanentEnrichmentError,
  MAX_ENRICHMENT_ATTEMPTS,
} from "./failures";
import { enrichmentSystemAndModel, getGatewayClient } from "./gateway";
import {
  getNearbyPlaceResolver,
  type NearbyPlace,
  type NearbyPlaceResolver,
} from "./place";
import {
  getResearchClient,
  researchClientFromWebSearch,
  type ResearchClient,
} from "./research";
import type { WebSearchClient } from "./search";
import { buildEnrichmentPrompt } from "./system-instruction";
import type {
  EnrichmentBatchResponse,
  EnrichmentCaptureResult,
  EnrichmentJob,
  EnrichmentMemoryPatch,
  EnrichmentRepository,
  EnrichmentThreadSnapshot,
  FrozenHistoryEntry,
  GatewayClient,
  GatewayMediaPart,
  MemoryToolClient,
} from "./types";

type PushHooks = {
  repository: PushRepository;
  sender: PushSender | null;
};

async function maybeNotify(
  userId: string,
  push: PushHooks | undefined,
  event: Parameters<typeof notifyEnrichmentOutcome>[1],
): Promise<void> {
  if (!push?.sender) return;
  await notifyEnrichmentOutcome(userId, event, push.repository, push.sender);
}

function createJobId(): string {
  return crypto.randomUUID();
}

export { isPermanentEnrichmentError };

function pendingCaptureIds(thread: EnrichmentThreadSnapshot): string[] {
  return thread.entries
    .filter(
      (entry) => entry.kind === "capture" && entry.includedBy === null,
    )
    .map((entry) => entry.id);
}

/**
 * A job for this Thread that the queue is still waiting on. A permanent
 * failure under a *different* model does not block: swapping
 * AI_GATEWAY_MODEL to one that reads video is exactly how a walker recovers
 * a Capture the old model refused, and its job's model is frozen.
 */
function hasOpenEnrichJob(
  jobs: EnrichmentJob[],
  threadId: string,
  model: string,
): boolean {
  return jobs.some(
    (job) =>
      job.threadId === threadId &&
      (job.status === "queued" ||
        job.status === "running" ||
        (job.status === "failed" && !isStaleModelFailure(job, model))),
  );
}

/** Whether the queue would ever pick this failed job up again. */
function isRetryableJob(job: EnrichmentJob): boolean {
  return (
    !isPermanentEnrichmentError(job.error ?? "") &&
    job.attempts < MAX_ENRICHMENT_ATTEMPTS
  );
}

function isStaleModelFailure(job: EnrichmentJob, model: string): boolean {
  return (
    job.status === "failed" &&
    job.model !== model &&
    isPermanentEnrichmentError(job.error ?? "")
  );
}

function freezeHistory(thread: EnrichmentThreadSnapshot): FrozenHistoryEntry[] {
  return thread.entries.map((entry) => {
    if (entry.kind === "enrichment") {
      return {
        id: entry.id,
        kind: "enrichment" as const,
        text: entry.text,
      };
    }
    return {
      id: entry.id,
      kind: "capture" as const,
      text: entry.text,
      createdAt: entry.createdAt,
      location: entry.location,
      attachments: entry.attachments,
    };
  });
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
    if (hasOpenEnrichJob(openJobs, thread.id, model)) continue;
    const targetCaptureIds = pendingCaptureIds(thread);
    if (targetCaptureIds.length === 0) continue;

    const basisHistory = freezeHistory(thread);
    // Scope the key to the model only when retrying past a permanent failure
    // under another model — every other Thread keeps its stable key so the
    // model changing never re-enriches work that already succeeded.
    const retryingUnderNewModel = openJobs.some(
      (job) => job.threadId === thread.id && isStaleModelFailure(job, model),
    );
    const idempotencyKey = retryingUnderNewModel
      ? `enrich:${thread.id}:r${thread.revision}:${model}`
      : `enrich:${thread.id}:r${thread.revision}`;
    const existing = await repository.getOrCreateJob(userId, {
      id: createJobId(),
      idempotencyKey,
      threadId: thread.id,
      basisRevision: thread.revision,
      basisEntryIds: basisHistory.map((entry) => entry.id),
      basisHistory,
      targetCaptureIds,
      model,
      status: "queued",
    });

    // A prior job may be complete while inclusions/enrichments were lost
    // (memory-only era). Queue a stable orphan recovery job for the same targets.
    if (existing.status === "complete") {
      const orphanKey = `enrich:${thread.id}:orphan:${[...targetCaptureIds].sort().join(",")}`;
      await repository.getOrCreateJob(userId, {
        id: createJobId(),
        idempotencyKey: orphanKey,
        threadId: thread.id,
        basisRevision: thread.revision,
        basisEntryIds: basisHistory.map((entry) => entry.id),
        basisHistory,
        targetCaptureIds,
        model,
        status: "queued",
      });
    }
  }
}

async function loadMediaParts(
  userId: string,
  history: FrozenHistoryEntry[],
  targetCaptureIds: string[],
  blobStore: PrivateBlobStore,
): Promise<{ media: GatewayMediaPart[]; kinds: MediaKind[] }> {
  const targetSet = new Set(targetCaptureIds);
  const media: GatewayMediaPart[] = [];
  const kinds: MediaKind[] = [];
  for (const entry of history) {
    if (entry.kind !== "capture" || !targetSet.has(entry.id)) continue;
    for (const attachment of entry.attachments ?? []) {
      kinds.push(attachment.kind);
      const object = await blobStore.get(userId, attachment.id);
      if (!object) {
        throw new Error(`missing_original_media_${attachment.id}`);
      }
      media.push({
        attachmentId: attachment.id,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        bytes: object.bytes,
      });
    }
  }
  return { media, kinds };
}

async function resolvePlaces(
  history: FrozenHistoryEntry[],
  targetCaptureIds: string[],
  placeResolver: NearbyPlaceResolver,
): Promise<Record<string, NearbyPlace | null>> {
  const places: Record<string, NearbyPlace | null> = {};
  const targetSet = new Set(targetCaptureIds);
  for (const entry of history) {
    if (entry.kind !== "capture" || !targetSet.has(entry.id)) continue;
    if (!entry.location) {
      places[entry.id] = null;
      continue;
    }
    places[entry.id] = await placeResolver.resolve(entry.location);
  }
  return places;
}

async function runJob(
  userId: string,
  repository: EnrichmentRepository,
  gateway: GatewayClient,
  job: EnrichmentJob,
  threadsById: Map<string, EnrichmentThreadSnapshot>,
  system: string,
  blobStore: PrivateBlobStore,
  placeResolver: NearbyPlaceResolver,
  search: ResearchClient | undefined,
  memoryRepository: WalkerMemoryRepository,
  projects: Project[],
  proposals: Project[],
  rejectedProjectNames: string[],
  threadRepository: ThreadRepository | undefined,
  push?: PushHooks,
): Promise<EnrichmentCaptureResult[]> {
  if (job.status === "failed") {
    return job.targetCaptureIds.map((id) => ({
      id,
      threadId: job.threadId,
      status: "needs_attention" as const,
      reason: job.error ?? "enrichment_failed",
      retryable: isRetryableJob(job),
    }));
  }

  const running =
    job.status === "running"
      ? job
      : await repository.markJobRunning(userId, job.id);

  const thread = threadsById.get(running.threadId);
  if (!thread) {
    await repository.markJobFailed(userId, running.id, "thread_missing");
    await maybeNotify(userId, push, {
      kind: "needs_attention",
      jobId: running.id,
      threadId: running.threadId,
      attempt: running.attempts,
      reason: "thread_missing",
    });
    return running.targetCaptureIds.map((id) => ({
      id,
      threadId: running.threadId,
      status: "needs_attention" as const,
      reason: "thread_missing",
      retryable: true,
    }));
  }

  try {
    const frozenHistory =
      running.basisHistory.length > 0
        ? running.basisHistory
        : freezeHistory(thread).filter((entry) =>
            running.basisEntryIds.includes(entry.id),
          );

    const { media, kinds } = await loadMediaParts(
      userId,
      frozenHistory,
      running.targetCaptureIds,
      blobStore,
    );
    const capability = assertModelSupportsMedia(running.model, kinds);
    if (!capability.ok) {
      await repository.markJobFailed(userId, running.id, capability.reason);
      await maybeNotify(userId, push, {
        kind: "needs_attention",
        jobId: running.id,
        threadId: running.threadId,
        attempt: running.attempts,
        reason: capability.reason,
      });
      return running.targetCaptureIds.map((id) => ({
        id,
        threadId: running.threadId,
        status: "needs_attention" as const,
        reason: capability.reason,
        retryable: !isPermanentEnrichmentError(capability.reason),
      }));
    }

    const placesByCaptureId = await resolvePlaces(
      frozenHistory,
      running.targetCaptureIds,
      placeResolver,
    );

    // Reloaded per job so a patch applied by one Enrichment is visible to
    // the next. A Memory outage degrades to an untailored report, never a
    // failed job — the tool stays offered but answers memory_unavailable.
    let walkerProfile: string | null = null;
    try {
      walkerProfile = renderWalkerProfile(
        await memoryRepository.listMemories(userId),
      );
    } catch {
      walkerProfile = null;
    }
    const appliedPatches: EnrichmentMemoryPatch[] = [];
    const memoryTool: MemoryToolClient = {
      async apply(patchInput) {
        try {
          const result = await applyMemoryPatch(
            memoryRepository,
            userId,
            {
              ...patchInput,
              source: "enrichment",
              sourceId: running.threadId,
            },
            {
              now: () => new Date().toISOString(),
              createId: () => crypto.randomUUID(),
            },
          );
          if (!result.ok) return result;
          appliedPatches.push({
            patchId: result.patch.id,
            op: result.patch.op,
            category: result.patch.category,
            content: result.patch.after ?? result.patch.before ?? "",
          });
          return {
            ok: true,
            patchId: result.patch.id,
            memoryId: result.patch.memoryId,
          };
        } catch {
          return { ok: false, error: "memory_unavailable" };
        }
      },
    };

    const requestTitle = thread.enrichmentCount === 0;
    const prompt = buildEnrichmentPrompt({
      threadTitle: thread.title,
      history: frozenHistory,
      targetCaptureIds: running.targetCaptureIds,
      requestTitle,
      placesByCaptureId,
      walkerProfile: walkerProfile ?? EMPTY_PROFILE_HINT,
      projects: projects.map((project) => project.name),
      proposedProjects: proposals.map((proposal) => proposal.name),
      rejectedProjects: rejectedProjectNames,
    });
    const generation = await gateway.generate({
      model: running.model,
      system,
      prompt,
      requestTitle,
      media,
      search,
      memory: memoryTool,
    });
    // PROJECT may name anything already known, confirmed or merely proposed —
    // joining a proposal is how one effort stops fragmenting into four names.
    // An invented name is dropped, as it always has been.
    const known = [...projects, ...proposals];
    const matched = (name: string | null) =>
      name
        ? (known.find(
            (project) => project.name.toLowerCase() === name.toLowerCase(),
          ) ?? null)
        : null;

    let guessedProject = matched(generation.project);
    // PROPOSE coins a new one, but only for a name nothing already covers —
    // a PROPOSE that names something known is just a PROJECT said clumsily.
    if (!guessedProject && generation.propose && threadRepository) {
      // A PROPOSE that names something already known is a PROJECT said
      // clumsily — join it rather than coining a case-variant twin.
      const coined =
        matched(generation.propose) ??
        (await threadRepository
          .proposeProject(userId, generation.propose)
          // A proposal store that is unavailable costs the proposal, never
          // the report: the walker's words are already written.
          .catch(() => null));
      // Re-proposing a name the walker rejected returns that row untouched;
      // filing into it would put the guess straight back in the queue.
      guessedProject = coined?.state === "rejected" ? null : coined;
    }

    const completed = await repository.completeJob(userId, running.id, {
      text: generation.text,
      model: generation.model,
      title: generation.title,
      kind: generation.kind,
      topics: generation.topics,
      ask: generation.ask,
      sources: generation.sources,
      research: generation.research,
      memoryPatches: appliedPatches,
    });

    // File the Thread into the guessed Project — but only while it is still
    // unfiled and unassigned. A walker's own filing is final.
    if (completed.created && guessedProject && threadRepository) {
      const thread = (await threadRepository.listThreads(userId)).find(
        (candidate) => candidate.id === running.threadId,
      );
      if (thread && !thread.reviewedAt && !thread.projectId) {
        await threadRepository.fileThread(userId, running.threadId, {
          projectId: guessedProject.id,
          reviewedAt: null,
        });
      }
    }

    if (completed.created) {
      await maybeNotify(userId, push, {
        kind: "complete",
        jobId: running.id,
        threadId: running.threadId,
        title: completed.enrichment.title ?? undefined,
      });
    }

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
    await maybeNotify(userId, push, {
      kind: "needs_attention",
      jobId: running.id,
      threadId: running.threadId,
      attempt: running.attempts,
      reason,
    });
    return running.targetCaptureIds.map((id) => ({
      id,
      threadId: running.threadId,
      status: "needs_attention" as const,
      reason,
      retryable: !isPermanentEnrichmentError(reason),
    }));
  }
}

export async function processPendingEnrichments(
  userId: string,
  repository: EnrichmentRepository,
  options: {
    gateway?: GatewayClient;
    retryFailed?: boolean;
    environment?: Record<string, string | undefined>;
    threadRepository?: ThreadRepository;
    blobStore?: PrivateBlobStore;
    placeResolver?: NearbyPlaceResolver;
    search?: WebSearchClient | ResearchClient;
    memoryRepository?: WalkerMemoryRepository;
    pushRepository?: PushRepository;
    pushSender?: PushSender | null;
  } = {},
): Promise<EnrichmentBatchResponse> {
  const environment = options.environment ?? process.env;
  const { system, model } = enrichmentSystemAndModel(environment);
  const gateway = options.gateway ?? getGatewayClient(environment);
  const blobStore =
    options.blobStore ??
    getPrivateBlobStore(environment as NodeJS.ProcessEnv);
  const placeResolver =
    options.placeResolver ?? getNearbyPlaceResolver(environment);
  const search = options.search
    ? researchClientFromWebSearch(options.search)
    : (getResearchClient(environment) ?? undefined);
  const pushRepository =
    options.pushRepository ??
    getPushRepository(environment as NodeJS.ProcessEnv);
  const pushSender =
    options.pushSender === undefined
      ? createWebPushSender(environment as NodeJS.ProcessEnv)
      : options.pushSender;
  const push: PushHooks | undefined = pushSender
    ? { repository: pushRepository, sender: pushSender }
    : undefined;

  const memoryRepository =
    options.memoryRepository ??
    getWalkerMemoryRepository(environment as NodeJS.ProcessEnv);
  // The model files into a Project the walker made or a Proposed Project an
  // earlier Enrichment coined; a name it invents outright is still dropped.
  const projects = options.threadRepository
    ? await options.threadRepository.listProjects(userId)
    : [];
  const proposals = options.threadRepository
    ? await options.threadRepository.listProposedProjects(userId)
    : [];
  const rejectedProjectNames = options.threadRepository
    ? await options.threadRepository.listRejectedProjectNames(userId)
    : [];

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
      blobStore,
      placeResolver,
      search,
      memoryRepository,
      projects,
      proposals,
      rejectedProjectNames,
      options.threadRepository,
      push,
    );
    results.push(...jobResults);
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
        retryable: isRetryableJob(job),
      })),
    );
  }

  const jobs = await repository.listOpenJobs(userId);
  return { results, jobs };
}
