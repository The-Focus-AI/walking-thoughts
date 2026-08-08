import type {
  CaptureLocation,
  MediaKind,
  SpecHandoff,
  ThreadKind,
  ThreadRoute,
} from "@/lib/local-capture/types";

export type { SpecHandoff } from "@/lib/local-capture/types";

export type SyncCaptureStatus =
  | "saved_locally"
  | "syncing"
  | "enriching"
  | "complete"
  | "needs_attention";

export type SyncAttachmentMeta = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
};

export type SyncCapturePayload = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  threadId: string | null;
  sequence: number;
  /** Stable idempotency key; defaults to capture id. */
  idempotencyKey: string;
  attachments?: SyncAttachmentMeta[];
  /** What a spoken Capture said, once an Enrichment transcribed it. */
  transcript?: string | null;
};

export type SyncCaptureResult = {
  id: string;
  threadId: string;
  sequence: number;
  status: "complete";
};

export type SyncFailure = {
  id: string;
  status: "needs_attention";
  reason: string;
  retryable: boolean;
};

export type SyncBatchResponse = {
  results: SyncCaptureResult[];
  failures: SyncFailure[];
};

/**
 * `proposed` is a Proposed Project — a name an Enrichment floated for an
 * effort it keeps seeing. It becomes `confirmed` only when the walker names
 * it in the Interview, and `rejected` so the Interview stops asking.
 */
export type ProjectState = "proposed" | "confirmed" | "rejected";

/** A named bucket the walker files Threads into: an effort, a client, a build. */
export type Project = {
  id: string;
  name: string;
  state: ProjectState;
  createdAt: string;
  /**
   * The `owner/repo` a spec Thread routed here drafts its issue into
   * (docs/desk.md, D3). Optional: a Project without one records spec
   * routings but makes no external write.
   */
  repository?: string | null;
};

/** A Proposed Project with the Threads that have accrued to it. */
export type ProjectProposal = Project & {
  threadCount: number;
  threads: Array<{ id: string; title: string }>;
};

export type ServerThread = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  /** Set when the walker processed this Thread at the desk; null = new. */
  reviewedAt?: string | null;
  /**
   * What this Thread is, as of its most recent Enrichment — question, idea,
   * task, observation, place, media, or noise. Null until one classifies it.
   */
  kind?: ThreadKind | null;
  /** Topic slugs that group this Thread with others on the same subject. */
  topics?: string[];
  /** The open question from the newest Enrichment; null when it had none. */
  ask?: string | null;
  /**
   * The Project this Thread is filed into. A guess from the Enrichment until
   * the walker files the Thread; their filing is final.
   */
  projectId?: string | null;
  /** Carried alongside the id so a filed Thread reads correctly offline. */
  projectName?: string | null;
  /** The walker's Research Verdict from Filing; null/absent = unset. */
  researchVerdict?: "kept" | "dismissed" | null;
  /** Where the walker routed this Thread (ADR 0017); null = not settled. */
  route?: ThreadRoute | null;
  /**
   * When the walker checked this off on the To-do list. Destination-surface
   * state, not Filing — it rides beside the route without touching it.
   */
  todoDoneAt?: string | null;
  /** What spec routing did outside the system (ADR 0018); null = nothing. */
  specHandoff?: SpecHandoff | null;
  captures: Array<{
    id: string;
    text: string;
    createdAt: string;
    location: CaptureLocation | null;
    sequence: number;
    attachments: SyncAttachmentMeta[];
    /** What a spoken Capture said, once an Enrichment transcribed it. */
    transcript?: string | null;
  }>;
};

export type TrashKind = "capture" | "thread";

export type TrashRecord = {
  kind: TrashKind;
  targetId: string;
  trashedAt: string;
  expiresAt: string;
  attachmentIds: string[];
};

export type TrashMutation = {
  action: "trash" | "restore";
  kind: TrashKind;
  targetId: string;
  /** Required for trash; ignored for restore. */
  trashedAt?: string;
  attachmentIds?: string[];
  idempotencyKey: string;
  /** Optional clock for restore-before-deadline checks (tests / workers). */
  now?: string;
};

export type TrashMutationResult = {
  idempotencyKey: string;
  status: "complete";
  /** Present while trashed; null after restore. */
  record: TrashRecord | null;
};

export type TrashMutationFailure = {
  idempotencyKey: string;
  status: "needs_attention";
  reason: string;
  retryable: boolean;
};

export type TrashBatchResponse = {
  results: TrashMutationResult[];
  failures: TrashMutationFailure[];
};

export type PurgeTarget = {
  kind: TrashKind;
  targetId: string;
  attachmentIds: string[];
};

export type PurgeExpiredResult = {
  purged: PurgeTarget[];
  duplicate: boolean;
};

export type ThreadSplitMove = {
  captureId: string;
  threadId: string;
  title: string;
  createdAt: string;
};

export type ThreadSplitResult = {
  moves: ThreadSplitMove[];
  /** The emptied source Thread, moved to Trash (30-day recovery). */
  trashedThreadId: string | null;
};

export type ThreadRepository = {
  upsertCaptures(
    userId: string,
    captures: SyncCapturePayload[],
  ): Promise<SyncBatchResponse>;
  listThreads(userId: string): Promise<ServerThread[]>;
  /**
   * Break a multi-Capture Thread apart (ADR 0011 repair): every Capture
   * moves into its own Thread (id = capture id, sequence 1) and the emptied
   * source Thread is trashed with no attachment claims. Idempotent.
   */
  splitThread(
    userId: string,
    threadId: string,
    now?: string,
  ): Promise<ThreadSplitResult>;
  /**
   * Check a routed to-do off (or back on, with null) from the To-do list.
   * The walker's action on the destination surface: it never touches
   * reviewedAt or route, so the Thread stays settled exactly as filed.
   */
  setThreadTodoDone(
    userId: string,
    threadId: string,
    todoDoneAt: string | null,
  ): Promise<{ threadId: string; todoDoneAt: string | null } | null>;
  /**
   * Record what spoken Captures said, once an Enrichment transcribed them
   * (ADR 0015). The transcript lands on the Capture itself so every surface
   * that shows the walker's own words — the digest, search, the To-do list,
   * the Day flow card — reads a recording the same way it reads typing.
   * Idempotent: re-transcribing overwrites with the same text.
   */
  recordCaptureTranscripts(
    userId: string,
    transcripts: Array<{ captureId: string; text: string }>,
  ): Promise<void>;
  /** Mark a Thread processed at the desk (null clears back to new). */
  setThreadReviewed(
    userId: string,
    threadId: string,
    reviewedAt: string | null,
  ): Promise<{ threadId: string; reviewedAt: string | null }>;
  /**
   * File a Thread at the desk: confirm what it is, put it in a Project, or
   * simply mark it read. Any of those settles the Thread and clears it from
   * the New queue. Omitted fields keep their current value.
   */
  fileThread(
    userId: string,
    threadId: string,
    filing: {
      kind?: string | null;
      projectId?: string | null;
      reviewedAt: string | null;
      /** Omitted keeps the current verdict; null clears it. */
      researchVerdict?: "kept" | "dismissed" | null;
      /** Omitted keeps the current route; null clears it. */
      route?: ThreadRoute | null;
    },
  ): Promise<ServerThread | null>;
  /**
   * The Thread's Research Verdict, read cheaply for the Artifact page's
   * retraction gate: a dismissed Thread's page stops resolving (ADR 0016).
   */
  getThreadResearchVerdict(
    userId: string,
    threadId: string,
  ): Promise<"kept" | "dismissed" | null>;
  /**
   * Overwrite the Thread's spec handoff record (ADR 0018). One record per
   * Thread — `drafted` is the idempotency guard the settle logic reads.
   */
  recordSpecHandoff(
    userId: string,
    threadId: string,
    handoff: SpecHandoff | null,
  ): Promise<void>;
  /**
   * The walker's Projects — `confirmed` only. Desk surfaces call this one;
   * a Proposed Project must never read as a decision the walker made.
   */
  listProjects(userId: string): Promise<Project[]>;
  /**
   * Idempotent by name — filing the same new Project twice makes one. A
   * repository passed on an existing name sets it (the seam by which a
   * Project gains its repo); omitted leaves whatever it already has.
   */
  createProject(
    userId: string,
    name: string,
    options?: { repository?: string | null },
  ): Promise<Project>;
  /** Proposed Projects with the Threads that have accrued to them. */
  listProposedProjects(userId: string): Promise<ProjectProposal[]>;
  /** Names the walker has already rejected, so the model stops proposing them. */
  listRejectedProjectNames(userId: string): Promise<string[]>;
  /**
   * Coin a Proposed Project. Idempotent by name, and never resurrects a name
   * the walker already confirmed or rejected — that row is returned as-is.
   */
  proposeProject(userId: string, name: string): Promise<Project>;
  /**
   * The walker's verdict in the Interview. Confirming may rename; rejecting
   * releases the unreviewed Threads that had accrued to it, so a wrong guess
   * leaves no residue in the queue. Threads the walker already filed keep it.
   */
  settleProject(
    userId: string,
    projectId: string,
    verdict: { state: "confirmed"; name?: string } | { state: "rejected" },
  ): Promise<Project | null>;
  updateThreadTitle?(
    userId: string,
    threadId: string,
    title: string,
  ): Promise<void>;
  /** Record what the latest Enrichment judged this Thread to be. */
  updateThreadClassification?(
    userId: string,
    threadId: string,
    classification: {
      kind: string | null;
      topics: string[];
      ask: string | null;
    },
  ): Promise<void>;
  applyTrashMutations(
    userId: string,
    mutations: TrashMutation[],
  ): Promise<TrashBatchResponse>;
  listTrash(userId: string): Promise<TrashRecord[]>;
  purgeExpired(
    userId: string,
    now: string,
    operationId: string,
  ): Promise<PurgeExpiredResult>;
};
