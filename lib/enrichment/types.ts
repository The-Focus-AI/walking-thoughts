export type EnrichmentJobStatus = "queued" | "running" | "failed" | "complete";

export type FrozenHistoryEntry = {
  id: string;
  kind: "capture" | "enrichment";
  text: string;
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

export type GatewayGeneration = {
  text: string;
  model: string;
  title: string | null;
};

export type GatewayGenerateInput = {
  model: string;
  system: string;
  prompt: string;
  /** When true, ask the model for a short Thread title. */
  requestTitle: boolean;
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
    }
  | {
      id: string;
      kind: "enrichment";
      text: string;
      model: string;
      basisRevision: number;
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
    },
  ): Promise<{ job: EnrichmentJob; enrichment: ThreadEnrichment; created: boolean }>;
  requeueFailed(userId: string, jobId?: string): Promise<number>;
};
