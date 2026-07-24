import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import type { DayCorpusEntry } from "./types";

/**
 * Keep Captures whose createdAt falls on `dayKey`, and Enrichments whose
 * owning Capture (or own createdAt) falls on that day. Order is preserved.
 */
export function collectDayCorpus(
  entries: DayCorpusEntry[],
  dayKey: string,
): DayCorpusEntry[] {
  return entries.filter((entry) => {
    const stamp =
      entry.kind === "enrichment" && entry.captureCreatedAt
        ? entry.captureCreatedAt
        : entry.createdAt;
    return calendarDayKey(new Date(stamp)) === dayKey;
  });
}
