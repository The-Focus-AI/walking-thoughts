import type { MediaKind } from "@/lib/local-capture/types";
import { getPrivateBlobStore } from "@/lib/media/blob-store";
import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import type { ThreadRepository } from "@/lib/sync/types";
import { assertModelSupportsMedia } from "./capabilities";
import { enrichmentSystemAndModel, getGatewayClient } from "./gateway";
import {
  getNearbyPlaceResolver,
  type NearbyPlace,
  type NearbyPlaceResolver,
} from "./place";
import { getWebSearchClient, type WebSearchClient } from "./search";
import { buildEnrichmentPrompt } from "./system-instruction";
import type {
  EnrichmentBatchResponse,
  EnrichmentCaptureResult,
  EnrichmentJob,
  EnrichmentRepository,
  EnrichmentThreadSnapshot,
  FrozenHistoryEntry,
  GatewayClient,
  GatewayMediaPart,
} from "./types";

function createJobId(): string {
  return crypto.randomUUID();
}

function pendingCaptureIds(thread: EnrichmentThreadSnapshot): string[] {
  return thread.entries
    .filter(
      (entry) => entry.kind === "capture" && entry.includedBy === null,
    )
    .map((entry) => entry.id);
}

function hasOpenEnrichJob(jobs: EnrichmentJob[], threadId: string): boolean {
  return jobs.some(
    (job) =>
      job.threadId === threadId &&
      (job.status === "queued" ||
        job.status === "running" ||
        job.status === "failed"),
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
    if (hasOpenEnrichJob(openJobs, thread.id)) continue;
    const targetCaptureIds = pendingCaptureIds(thread);
    if (targetCaptureIds.length === 0) continue;

    const basisHistory = freezeHistory(thread);
    await repository.getOrCreateJob(userId, {
      id: createJobId(),
      idempotencyKey: `enrich:${thread.id}:r${thread.revision}`,
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
  search: WebSearchClient,
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
      return running.targetCaptureIds.map((id) => ({
        id,
        threadId: running.threadId,
        status: "needs_attention" as const,
        reason: capability.reason,
        retryable: true,
      }));
    }

    const placesByCaptureId = await resolvePlaces(
      frozenHistory,
      running.targetCaptureIds,
      placeResolver,
    );
    const requestTitle = thread.enrichmentCount === 0;
    const prompt = buildEnrichmentPrompt({
      threadTitle: thread.title,
      history: frozenHistory,
      targetCaptureIds: running.targetCaptureIds,
      requestTitle,
      placesByCaptureId,
    });
    const generation = await gateway.generate({
      model: running.model,
      system,
      prompt,
      requestTitle,
      media,
      search,
    });
    const completed = await repository.completeJob(userId, running.id, {
      text: generation.text,
      model: generation.model,
      title: generation.title,
      sources: generation.sources,
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
    environment?: Record<string, string | undefined>;
    threadRepository?: ThreadRepository;
    blobStore?: PrivateBlobStore;
    placeResolver?: NearbyPlaceResolver;
    search?: WebSearchClient;
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
  const search = options.search ?? getWebSearchClient(environment);

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
        retryable: true,
      })),
    );
  }

  const jobs = await repository.listOpenJobs(userId);
  return { results, jobs };
}
