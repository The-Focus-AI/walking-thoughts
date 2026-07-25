import type { DayChatTurn } from "./types";

/**
 * Locally retained day-chat transcripts, one per civil day, so the chat is
 * an ongoing conversation the walker can leave and come back to — not a
 * one-off ask. Same localStorage posture as the Enrichment cache: private
 * to this browser, best-effort, never required for correctness.
 */

export type DayChatMessage = DayChatTurn & {
  createdAt: string;
  /** Model that produced a digest reply; absent on walker turns. */
  model?: string;
};

const KEY_PREFIX = "wt-day-chat:";

/** Oldest messages fall off past this — the API only reads the tail anyway. */
const MAX_MESSAGES = 60;

function storageKey(dayKey: string): string {
  return `${KEY_PREFIX}${dayKey}`;
}

export function readDayChat(dayKey: string): DayChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(dayKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DayChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (message) =>
        message &&
        (message.role === "walker" || message.role === "digest") &&
        typeof message.text === "string",
    );
  } catch {
    return [];
  }
}

export function writeDayChat(
  dayKey: string,
  messages: DayChatMessage[],
): void {
  try {
    localStorage.setItem(
      storageKey(dayKey),
      JSON.stringify(messages.slice(-MAX_MESSAGES)),
    );
  } catch {
    // Quota or privacy mode: the in-memory chat still works this session.
  }
}

export function clearDayChat(dayKey: string): void {
  try {
    localStorage.removeItem(storageKey(dayKey));
  } catch {
    // Ignore — nothing durable to remove.
  }
}
