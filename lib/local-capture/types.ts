export type CaptureLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type ThreadDestination =
  | { type: "inbox" }
  | { type: "thread"; threadId: string }
  | { type: "new_thread" };

export type LocalThread = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
};

export type LocalCapture = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  status: "saved_locally";
  threadId: string | null;
  sequence: number;
};

export type PersistenceResult = "persisted" | "not_persisted" | "unsupported";

export type CommitOptions = {
  destination?: ThreadDestination;
};

export type CaptureStore = {
  getDraft(): Promise<string>;
  setDraft(text: string): Promise<void>;
  list(): Promise<LocalCapture[]>;
  listInbox(): Promise<LocalCapture[]>;
  listRecentThreads(): Promise<LocalThread[]>;
  listThread(
    threadId: string,
  ): Promise<{ thread: LocalThread; captures: LocalCapture[] }>;
  commit(
    text: string,
    location: CaptureLocation | null,
    options?: CommitOptions,
  ): Promise<LocalCapture>;
};
