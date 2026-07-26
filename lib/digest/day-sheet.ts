import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import {
  KIND_DESK_ORDER,
  type LocalCapture,
  type LocalThread,
  type ThreadKind,
} from "@/lib/local-capture/types";

export type DaySheetThread = {
  threadId: string;
  title: string;
  ask?: string | null;
};

/**
 * What one day amounts to, read straight from local state: no model call, no
 * network, so it paints instantly and works out of range. The day chat
 * answers questions about the day; this says what the day *is*.
 */
export type DaySheet = {
  threadCount: number;
  captureCount: number;
  photoCount: number;
  /** Kinds present that day, in desk order. */
  kinds: Array<{ kind: ThreadKind; count: number }>;
  /** Threads still waiting on a word from the walker. */
  needsWord: DaySheetThread[];
  /** Threads the day left the walker to do. */
  toDo: DaySheetThread[];
  /**
   * Threads whose report is published and unread — the reason to sit down.
   * A day's other Threads are glanced at; these are the ones with a page
   * waiting. Empty unless the caller says which Threads have one.
   */
  toRead: DaySheetThread[];
  /** Threads no Enrichment has classified yet — usually still enriching. */
  unclassified: number;
  reviewed: number;
};

export function summarizeDay(input: {
  threads: LocalThread[];
  captures: LocalCapture[];
  dayKey: string;
  /**
   * Threads with a published Artifact. Passed in rather than read here so
   * the sheet stays a pure function of local state — the desk knows which
   * Threads have a page, this only counts them.
   */
  threadsWithReports?: ReadonlySet<string>;
}): DaySheet {
  const dayCaptures = input.captures.filter(
    (capture) => calendarDayKey(new Date(capture.createdAt)) === input.dayKey,
  );
  const threadIds = new Set(
    dayCaptures
      .map((capture) => capture.threadId)
      .filter((id): id is string => Boolean(id)),
  );
  const threads = input.threads.filter((thread) => threadIds.has(thread.id));

  const counts = new Map<ThreadKind, number>();
  for (const thread of threads) {
    if (!thread.kind) continue;
    counts.set(thread.kind, (counts.get(thread.kind) ?? 0) + 1);
  }

  const describe = (thread: LocalThread): DaySheetThread => ({
    threadId: thread.id,
    title: thread.title,
    ask: thread.ask ?? null,
  });

  return {
    threadCount: threads.length,
    captureCount: dayCaptures.length,
    photoCount: dayCaptures.reduce(
      (count, capture) => count + capture.attachments.length,
      0,
    ),
    kinds: KIND_DESK_ORDER.filter((kind) => counts.has(kind)).map((kind) => ({
      kind,
      count: counts.get(kind)!,
    })),
    needsWord: threads.filter((thread) => thread.ask).map(describe),
    toDo: threads.filter((thread) => thread.kind === "task").map(describe),
    toRead: threads
      .filter(
        (thread) =>
          !thread.reviewedAt && input.threadsWithReports?.has(thread.id),
      )
      .map(describe),
    unclassified: threads.filter((thread) => !thread.kind).length,
    reviewed: threads.filter((thread) => thread.reviewedAt).length,
  };
}
