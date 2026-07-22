import type { CaptureLocation, MediaKind } from "@/lib/local-capture/types";

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

export type ServerThread = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  captures: Array<{
    id: string;
    text: string;
    createdAt: string;
    location: CaptureLocation | null;
    sequence: number;
    attachments: SyncAttachmentMeta[];
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
  updateThreadTitle?(
    userId: string,
    threadId: string,
    title: string,
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
