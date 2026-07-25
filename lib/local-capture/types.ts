export type CaptureLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

/**
 * Where a Capture commits (ADR 0011): its own new Thread by default, or an
 * existing Thread when deliberately replying from that Thread's page.
 */
export type ThreadDestination =
  | { type: "thread"; threadId: string }
  | { type: "new_thread" };

/**
 * What a Thread is, decided by the model as it writes the Enrichment. A
 * walker does not capture one kind of thing, and each kind wants a different
 * report and a different destination at the desk.
 */
export const THREAD_KINDS = [
  "question",
  "idea",
  "task",
  "observation",
  "place",
  "media",
  "noise",
] as const;

export type ThreadKind = (typeof THREAD_KINDS)[number];

/**
 * Desk order, not the declaration order: what the walker acts on comes
 * before what they read, and noise sits last. Shared by every surface that
 * lists kinds so they never disagree.
 */
export const KIND_DESK_ORDER: ThreadKind[] = [
  "task",
  "idea",
  "question",
  "observation",
  "place",
  "media",
  "noise",
];

/** Kind names the walker reads, not the slugs the model writes. */
export const KIND_LABELS: Record<ThreadKind, string> = {
  task: "To do",
  idea: "Idea",
  question: "Question",
  observation: "Observation",
  place: "Place",
  media: "Media",
  noise: "Noise",
};

/**
 * Narrow a stored or transmitted value to a kind. Anything the current
 * vocabulary does not name reads as unclassified rather than reaching the UI.
 */
export function asThreadKind(value: unknown): ThreadKind | null {
  return typeof value === "string" &&
    (THREAD_KINDS as readonly string[]).includes(value)
    ? (value as ThreadKind)
    : null;
}

export type LocalThread = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  /** Set once processed at the desk; absent/null = new (in the review queue). */
  reviewedAt?: string | null;
  /** The newest Enrichment's verdict; null until one classifies the Thread. */
  kind?: ThreadKind | null;
  /** Topic slugs that group this Thread with others on the same subject. */
  topics?: string[];
  /**
   * The open question from the newest Enrichment — the model met a name or
   * intent it could not place and asked rather than guessing.
   */
  ask?: string | null;
  /** The Project this Thread is filed into; a guess until it is Reviewed. */
  projectId?: string | null;
  projectName?: string | null;
};

export type CaptureSyncStatus =
  | "saved_locally"
  | "syncing"
  | "enriching"
  | "complete"
  | "needs_attention";

export type MediaKind = "image" | "audio" | "video";

export type LocalAttachment = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  byteLength: number;
  /** Null after the user explicitly removes the local original. */
  localObjectKey: string | null;
  /** Small retained preview so Threads stay understandable offline. */
  thumbnailObjectKey?: string | null;
  remoteObjectKey?: string | null;
  syncStatus: CaptureSyncStatus;
};

export type AttachmentInput = {
  id?: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  bytes: ArrayBuffer | Uint8Array | Blob;
};

export type LocalCapture = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  status: CaptureSyncStatus;
  threadId: string | null;
  sequence: number;
  attachments: LocalAttachment[];
  syncReason?: string | null;
  syncRetryable?: boolean;
};

export type PersistenceResult = "persisted" | "not_persisted" | "unsupported";

export type CommitOptions = {
  destination?: ThreadDestination;
  attachments?: AttachmentInput[];
};

export type SyncBatchApplication = {
  results: Array<{
    id: string;
    threadId: string;
    sequence: number;
    status: "complete";
  }>;
  failures: Array<{
    id: string;
    status: "needs_attention";
    reason: string;
    retryable: boolean;
  }>;
};

export type EnrichmentBatchApplication = {
  results: Array<{
    id: string;
    threadId: string;
    status: "complete" | "enriching" | "needs_attention";
    reason?: string;
    retryable?: boolean;
    threadTitle?: string;
  }>;
};

export type LocalTrashKind = "capture" | "thread";

export type LocalTrashRecord = {
  kind: LocalTrashKind;
  targetId: string;
  trashedAt: string;
  expiresAt: string;
  attachmentIds: string[];
  syncStatus: CaptureSyncStatus;
  /** Local outbox action waiting to sync; null when settled with server. */
  pendingAction: "trash" | "restore" | null;
  idempotencyKey: string;
};

export type TrashSyncApplication = {
  results: Array<{
    idempotencyKey: string;
    status: "complete";
    record: {
      kind: LocalTrashKind;
      targetId: string;
      trashedAt: string;
      expiresAt: string;
      attachmentIds: string[];
    } | null;
  }>;
  failures: Array<{
    idempotencyKey: string;
    status: "needs_attention";
    reason: string;
    retryable: boolean;
  }>;
};

export type CaptureStore = {
  getDraft(): Promise<string>;
  setDraft(text: string): Promise<void>;
  list(): Promise<LocalCapture[]>;
  listRecentThreads(): Promise<LocalThread[]>;
  listThread(
    threadId: string,
  ): Promise<{ thread: LocalThread; captures: LocalCapture[] }>;
  commit(
    text: string,
    location: CaptureLocation | null,
    options?: CommitOptions,
  ): Promise<LocalCapture>;
  /**
   * Apply a server Thread split locally: each listed Capture moves into its
   * own Thread (sequence 1, status back to enriching so the redo is visible)
   * and the emptied source Thread row is dropped.
   */
  applyThreadSplit(split: {
    moves: Array<{
      captureId: string;
      threadId: string;
      title: string;
      createdAt: string;
    }>;
    trashedThreadId: string | null;
  }): Promise<void>;
  /** Record the server's review decision on the local Thread row. */
  setThreadReviewed(
    threadId: string,
    reviewedAt: string | null,
  ): Promise<void>;
  /** Record what the walker settled while filing a Thread at the desk. */
  applyThreadFiling(filing: {
    threadId: string;
    reviewedAt: string | null;
    kind?: ThreadKind | null;
    projectId?: string | null;
    projectName?: string | null;
  }): Promise<void>;
  markSyncing(ids: string[]): Promise<void>;
  restoreSavedLocally(ids: string[]): Promise<void>;
  applySyncBatch(batch: SyncBatchApplication): Promise<void>;
  applyEnrichmentBatch(batch: EnrichmentBatchApplication): Promise<void>;
  updateAttachment(
    captureId: string,
    attachmentId: string,
    patch: Partial<LocalAttachment>,
  ): Promise<void>;
  trashCapture(captureId: string, trashedAt?: string): Promise<LocalTrashRecord>;
  trashThread(threadId: string, trashedAt?: string): Promise<LocalTrashRecord>;
  restoreFromTrash(
    kind: LocalTrashKind,
    targetId: string,
    now?: string,
  ): Promise<LocalTrashRecord | null>;
  listTrash(): Promise<LocalTrashRecord[]>;
  listPendingTrashMutations(): Promise<LocalTrashRecord[]>;
  markTrashSyncing(idempotencyKeys: string[]): Promise<void>;
  restoreTrashSavedLocally(idempotencyKeys: string[]): Promise<void>;
  applyTrashSyncBatch(batch: TrashSyncApplication): Promise<void>;
  applyRemoteTrash(records: Array<{
    kind: LocalTrashKind;
    targetId: string;
    trashedAt: string;
    expiresAt: string;
    attachmentIds: string[];
  }>): Promise<void>;
  /**
   * Import server Threads/Captures missing locally. Remote Captures arrive as
   * Complete so they do not re-enter the outbound outbox.
   */
  applyRemoteThreads(
    threads: Array<{
      id: string;
      title: string;
      revision: number;
      updatedAt: string;
      reviewedAt?: string | null;
      kind?: ThreadKind | null;
      topics?: string[];
      ask?: string | null;
      projectId?: string | null;
      projectName?: string | null;
      captures: Array<{
        id: string;
        text: string;
        createdAt: string;
        location: CaptureLocation | null;
        sequence: number;
        attachments: Array<{
          id: string;
          kind: MediaKind;
          mimeType: string;
          fileName: string;
        }>;
      }>;
    }>,
  ): Promise<{ importedCaptureIds: string[] }>;
};
