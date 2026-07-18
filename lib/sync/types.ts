import type { CaptureLocation } from "@/lib/local-capture/types";

export type SyncCaptureStatus =
  | "saved_locally"
  | "syncing"
  | "enriching"
  | "complete"
  | "needs_attention";

export type SyncCapturePayload = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  threadId: string | null;
  sequence: number;
  /** Stable idempotency key; defaults to capture id. */
  idempotencyKey: string;
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
  }>;
};

export type ThreadRepository = {
  upsertCaptures(
    userId: string,
    captures: SyncCapturePayload[],
  ): Promise<SyncBatchResponse>;
  listThreads(userId: string): Promise<ServerThread[]>;
  updateThreadTitle?(
    userId: string,
    threadId: string,
    title: string,
  ): Promise<void>;
};
