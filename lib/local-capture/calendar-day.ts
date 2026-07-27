import type { LocalCapture, LocalThread } from "./types";

/** Local calendar day key (YYYY-MM-DD) for trail session boundaries. */
export function calendarDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDayHeading(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The day a Thread belongs to, matching the day digest's grouping. */
export function dayKeyForThread(
  thread: LocalThread,
  captures: LocalCapture[],
): string {
  // Prefer Capture day so day sections match what the day digest will read.
  const firstCapture = captures[0];
  return firstCapture
    ? calendarDayKey(new Date(firstCapture.createdAt))
    : calendarDayKey(new Date(thread.updatedAt));
}

/** Compact chip label for day pickers, e.g. "Fri, Jul 24". */
export function formatDayShort(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
