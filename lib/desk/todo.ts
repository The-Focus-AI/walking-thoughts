import { dayKeyForThread } from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
import { getReviewTransport } from "@/lib/sync/review-client";

/**
 * One item on the To-do list: a `route = "todo"` Thread, shown in the
 * walker's own words — the first Capture's text, not the Enrichment's title.
 */
export type TodoItem = {
  threadId: string;
  /** The walker's words: what the first Capture said on the trail. */
  text: string;
  /** The day the Thread was walked (matches the day digest's grouping). */
  dayKey: string;
  /** When the walker checked it off; null = still open. */
  todoDoneAt: string | null;
};

/**
 * The To-do destination's pile: every Thread the walker routed to To-do,
 * open items first, newest walk first within each half. Un-routing a Thread
 * (route cleared or redirected) removes it here by construction — the list
 * is fed by the route, not by a copy.
 */
export function collectTodos(
  threads: LocalThread[],
  captures: LocalCapture[],
): TodoItem[] {
  const byThread = new Map<string, LocalCapture[]>();
  for (const capture of captures) {
    if (!capture.threadId) continue;
    const list = byThread.get(capture.threadId) ?? [];
    list.push(capture);
    byThread.set(capture.threadId, list);
  }

  return threads
    .filter((thread) => thread.route === "todo")
    .map((thread) => {
      const owned = (byThread.get(thread.id) ?? []).sort(
        (a, b) => a.sequence - b.sequence,
      );
      return {
        threadId: thread.id,
        text: owned[0]?.text || thread.title,
        dayKey: dayKeyForThread(thread, owned),
        todoDoneAt: thread.todoDoneAt ?? null,
      };
    })
    .sort((a, b) => {
      if (Boolean(a.todoDoneAt) !== Boolean(b.todoDoneAt)) {
        return a.todoDoneAt ? 1 : -1;
      }
      return a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0;
    });
}

/**
 * Check a to-do off (or back on) and settle the local copy from the server's
 * answer — the same shape as filing, but on the destination seam: the write
 * never touches reviewedAt or route. Returns false when the check-off could
 * not reach the server; the caller says so in its own voice.
 */
export async function setTodoDone(
  threadId: string,
  done: boolean,
): Promise<boolean> {
  const result = await getReviewTransport().setTodoDone?.(threadId, done);
  if (!result) return false;
  await getCaptureStore().setThreadTodoDone(
    threadId,
    result.todoDoneAt ?? null,
  );
  return true;
}
