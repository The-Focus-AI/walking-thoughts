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

export type DayDigestRequest = {
  dayKey: string;
  dayHeading: string;
  question: string;
  corpus: DayCorpusEntry[];
  walkerProfile?: string | null;
};

export type DayDigestResult = {
  text: string;
  model: string;
};
