import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import type {
  CaptureSyncStatus,
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";

/**
 * What is waiting at the desk, read from local state only. The trail surface
 * prints the count and nothing else — the Threads themselves live on Days
 * (see docs/ux/capture-and-days.md), so this is the whole bridge between the
 * two screens.
 */
export type DeskSummary = {
  /** Threads whose Enrichment has landed and that are not Reviewed yet. */
  ready: number;
  /** Threads asking the walker a question. */
  needsWord: number;
  /** Threads with a Capture that could not sync. */
  attention: number;
};

export function summarizeDesk(input: {
  threads: LocalThread[];
  captures: LocalCapture[];
}): DeskSummary {
  const byThread = new Map<string, LocalCapture[]>();
  for (const capture of input.captures) {
    if (!capture.threadId) continue;
    const list = byThread.get(capture.threadId) ?? [];
    list.push(capture);
    byThread.set(capture.threadId, list);
  }

  let ready = 0;
  let needsWord = 0;
  let attention = 0;

  for (const thread of input.threads) {
    const captures = byThread.get(thread.id) ?? [];
    if (captures.some((capture) => capture.status === "needs_attention")) {
      attention += 1;
      continue;
    }
    if (thread.reviewedAt) continue;
    if (thread.ask) {
      needsWord += 1;
      continue;
    }
    // Complete is the end of the Enrichment run: there is a report to read.
    if (captures.length > 0 && captures.every((c) => c.status === "complete")) {
      ready += 1;
    }
  }

  return { ready, needsWord, attention };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The one line the trail screen prints about the desk — the most pressing
 * thing first, or null when nothing is waiting. Factual, never urgent
 * (DESIGN.md): a count and a noun, no badge, no exclamation.
 */
export function deskWaitingLabel(summary: DeskSummary): string | null {
  if (summary.attention > 0) {
    return `${plural(summary.attention, "Thread", "Threads")} need${
      summary.attention === 1 ? "s" : ""
    } attention`;
  }
  if (summary.needsWord > 0) {
    return `${plural(summary.needsWord, "Thread", "Threads")} need${
      summary.needsWord === 1 ? "s" : ""
    } a word`;
  }
  if (summary.ready > 0) {
    return `${plural(summary.ready, "report", "reports")} ready`;
  }
  return null;
}

/** Flow order, so the tally reads the way a Capture actually travels. */
const TALLY_ORDER: Array<[CaptureSyncStatus, string]> = [
  ["saved_locally", "Saved locally"],
  ["syncing", "Syncing"],
  ["enriching", "Enriching"],
  ["complete", "Complete"],
  ["needs_attention", "Needs attention"],
];

/**
 * The day's tally for the scale-bar footer — the walker's whole view of where
 * today's Captures stand, in the canonical status labels. It replaces the
 * Today log on the trail: a count, not a list.
 */
export function todayTally(captures: LocalCapture[], now = new Date()): string {
  const today = calendarDayKey(now);
  const mine = captures.filter(
    (capture) => calendarDayKey(new Date(capture.createdAt)) === today,
  );
  if (mine.length === 0) return "No Captures today";
  const parts = [`${plural(mine.length, "Capture", "Captures")} today`];
  for (const [status, label] of TALLY_ORDER) {
    const count = mine.filter((capture) => capture.status === status).length;
    if (count > 0) parts.push(`${count} ${label}`);
  }
  return parts.join(" · ");
}
