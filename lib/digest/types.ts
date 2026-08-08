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

/**
 * One Thread the walker routed to To-do that day, in their own words. The
 * digest's checklist lists these instead of re-deriving tasks from the
 * corpus — the walker already said what goes on the list (docs/desk.md, D2).
 */
export type DayRoutedTodo = {
  threadId: string;
  text: string;
  done: boolean;
};

export type DayDigestRequest = {
  dayKey: string;
  dayHeading: string;
  question: string;
  corpus: DayCorpusEntry[];
  walkerProfile?: string | null;
  /** Conversation so far, oldest first — the digest continues it. */
  history?: DayChatTurn[];
  /** The day's routed to-dos; when present they are the checklist. */
  routedTodos?: DayRoutedTodo[];
};

export type DayDigestResult = {
  text: string;
  model: string;
};
