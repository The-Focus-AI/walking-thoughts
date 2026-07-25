/** One Capture or Enrichment row in a day's cross-Thread corpus. */

export type DayCorpusEntry = {
  kind: "capture" | "enrichment";
  id: string;
  threadId: string;
  threadTitle: string;
  text: string;
  createdAt: string;
  /**
   * For Enrichments: the Capture day that owns this report. Day filtering
   * uses this so a late Enrichment still joins the walk it answered.
   */
  captureCreatedAt?: string;
};

/** One prior exchange in an ongoing day chat. */
export type DayChatTurn = {
  role: "walker" | "digest";
  text: string;
};

export type DayDigestRequest = {
  dayKey: string;
  dayHeading: string;
  question: string;
  corpus: DayCorpusEntry[];
  walkerProfile?: string | null;
  /** Conversation so far, oldest first — the digest continues it. */
  history?: DayChatTurn[];
};

export type DayDigestResult = {
  text: string;
  model: string;
};
