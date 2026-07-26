import type {
  CaptureLocation,
  MediaKind,
  ThreadKind,
} from "@/lib/local-capture/types";
import type { ResearchClient, ResearchStep } from "./research";
import type { WebSearchClient, WebSearchResult } from "./search";

export type EnrichmentJobStatus = "queued" | "running" | "failed" | "complete";

/**
 * The kind drives the register of the report and, downstream, where the
 * Thread belongs: tasks in a checklist, ideas on a board, places on the map.
 * Declared with the other Thread types so both sides share one list.
 */
export { THREAD_KINDS, type ThreadKind } from "@/lib/local-capture/types";

export type EnrichmentSource = {
  title: string;
  url: string;
  retrievedAt: string;
};

export type FrozenHistoryEntry = {
  id: string;
  kind: "capture" | "enrichment";
  text: string;
  createdAt?: string;
  location?: CaptureLocation | null;
  attachments?: Array<{
    id: string;
    kind: MediaKind;
    mimeType: string;
    fileName: string;
  }>;
};

export type EnrichmentJob = {
  id: string;
  idempotencyKey: string;
  threadId: string;
  basisRevision: number;
  basisEntryIds: string[];
  /** Complete Thread history text frozen when the job was queued. */
  basisHistory: FrozenHistoryEntry[];
  targetCaptureIds: string[];
  model: string;
  status: EnrichmentJobStatus;
  attempts: number;
  error?: string;
};

/**
 * What an audio attachment actually said, produced by a speech-to-text model
 * before the Enrichment ran. Retained with the Enrichment so the walker reads
 * their own words back, and which model heard them.
 */
export type EnrichmentTranscript = {
  attachmentId: string;
  captureId: string;
  fileName: string;
  text: string;
  model: string;
};

/** One walker-profile change the model made while writing this Enrichment. */
export type EnrichmentMemoryPatch = {
  patchId: string;
  op: "add" | "update" | "remove";
  category: string;
  content: string;
};

export type ThreadEnrichment = {
  id: string;
  threadId: string;
  text: string;
  model: string;
  basisRevision: number;
  basisEntryIds: string[];
  targetCaptureIds: string[];
  createdAt: string;
  title?: string | null;
  /** The kind this Thread was judged to be when this report was written. */
  kind?: ThreadKind | null;
  /** Topic slugs that group this Thread with others on the same subject. */
  topics?: string[];
  /** One question the walker must answer before this Thread can go further. */
  ask?: string | null;
  sources: EnrichmentSource[];
  /** Tool calls (searches, page reads) the model made while researching. */
  research?: ResearchStep[];
  /** Walker-profile changes this Enrichment made via memory_patch. */
  memoryPatches?: EnrichmentMemoryPatch[];
  /** Speech-to-text for the audio Captures this Enrichment was written from. */
  transcripts?: EnrichmentTranscript[];
};

export type EnrichmentCaptureResult = {
  id: string;
  status: "complete" | "enriching" | "needs_attention";
  reason?: string;
  retryable?: boolean;
  threadId: string;
  enrichmentId?: string;
  threadTitle?: string;
};

export type EnrichmentBatchResponse = {
  results: EnrichmentCaptureResult[];
  jobs: EnrichmentJob[];
};

export type GatewayMediaPart = {
  attachmentId: string;
  /** The Capture this attachment hangs off, for per-Capture transcripts. */
  captureId?: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  bytes: Uint8Array;
};

export type GatewayGeneration = {
  text: string;
  model: string;
  title: string | null;
  kind: ThreadKind | null;
  topics: string[];
  ask: string | null;
  /** A Project name the model matched from the walker's own list. */
  project: string | null;
  /** A name for an effort absent from that list; becomes a Proposed Project. */
  propose: string | null;
  sources: EnrichmentSource[];
  research: ResearchStep[];
};

/** Seam the memory_patch tool calls through; apply lands in the patch log. */
export type MemoryToolClient = {
  apply(input: {
    op: "add" | "update" | "remove";
    memoryId?: string;
    category?: string;
    content?: string;
  }): Promise<
    | { ok: true; patchId: string; memoryId: string }
    | { ok: false; error: string }
  >;
};

export type GatewayGenerateInput = {
  model: string;
  system: string;
  prompt: string;
  /** When true, ask the model for a short Thread title. */
  requestTitle: boolean;
  media: GatewayMediaPart[];
  /**
   * Output budget. Left unset the provider default applies (4,096 for
   * Anthropic), which is short for anything that spends tokens on markup.
   */
  maxOutputTokens?: number;
  /** Research tools (web_search, read_page) offered to the model. */
  search?: ResearchClient;
  /** memory_patch tool offered to the model to revise the walker profile. */
  memory?: MemoryToolClient;
};

export type GatewayClient = {
  generate(input: GatewayGenerateInput): Promise<GatewayGeneration>;
};

export type EnrichmentHistoryEntry =
  | {
      id: string;
      kind: "capture";
      text: string;
      sequence: number;
      includedBy: string | null;
      createdAt: string;
      location: CaptureLocation | null;
      attachments: Array<{
        id: string;
        kind: MediaKind;
        mimeType: string;
        fileName: string;
      }>;
    }
  | {
      id: string;
      kind: "enrichment";
      text: string;
      model: string;
      basisRevision: number;
      sources: EnrichmentSource[];
    };

export type EnrichmentThreadSnapshot = {
  id: string;
  title: string;
  revision: number;
  enrichmentCount: number;
  entries: EnrichmentHistoryEntry[];
};

export type EnrichmentRepository = {
  listPendingThreads(userId: string): Promise<EnrichmentThreadSnapshot[]>;
  listThreadEnrichments(
    userId: string,
    threadId: string,
  ): Promise<ThreadEnrichment[]>;
  getOrCreateJob(
    userId: string,
    job: Omit<EnrichmentJob, "status" | "attempts" | "error"> & {
      status?: EnrichmentJobStatus;
    },
  ): Promise<EnrichmentJob>;
  listOpenJobs(userId: string): Promise<EnrichmentJob[]>;
  markJobRunning(userId: string, jobId: string): Promise<EnrichmentJob>;
  markJobFailed(
    userId: string,
    jobId: string,
    error: string,
  ): Promise<EnrichmentJob>;
  completeJob(
    userId: string,
    jobId: string,
    enrichment: {
      text: string;
      model: string;
      title: string | null;
      kind?: ThreadKind | null;
      topics?: string[];
      ask?: string | null;
      sources: EnrichmentSource[];
      research?: ResearchStep[];
      memoryPatches?: EnrichmentMemoryPatch[];
      transcripts?: EnrichmentTranscript[];
    },
  ): Promise<{ job: EnrichmentJob; enrichment: ThreadEnrichment; created: boolean }>;
  requeueFailed(userId: string, jobId?: string): Promise<number>;
  /**
   * Forget which Enrichment included these Captures so the queue researches
   * them again — used after a Thread split moves them into fresh Threads.
   */
  resetInclusions(userId: string, captureIds: string[]): Promise<number>;
};

export type { ResearchClient, ResearchStep, WebSearchClient, WebSearchResult };
