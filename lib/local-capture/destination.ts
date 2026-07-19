import { calendarDayKey } from "./calendar-day";
import type { LocalCapture, ThreadDestination } from "./types";

const STORAGE_KEY = "wt-active-thread-session";

export type DestinationSession = {
  get(): ThreadDestination;
  set(destination: ThreadDestination): void;
  touch(): void;
  rememberCommit(capture: LocalCapture): void;
  /** Start a fresh Thread on the next Capture (same calendar day). */
  startNewThread(): void;
};

type DestinationSessionOptions = {
  now?: () => Date;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
};

type StoredSession = {
  day: string;
  destination: ThreadDestination;
};

function readStored(
  storage: DestinationSessionOptions["storage"],
): StoredSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.day || !parsed?.destination?.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(
  storage: DestinationSessionOptions["storage"],
  value: StoredSession,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota pressure only loses the sticky trail destination.
  }
}

/**
 * Trail destination session: new calendar days start a new Thread; after the
 * first Capture, further Captures append to that Thread until the day rolls
 * or the walker explicitly starts a new Thread.
 */
export function createDestinationSession(
  options: DestinationSessionOptions = {},
): DestinationSession {
  const now = options.now ?? (() => new Date());
  const storage =
    options.storage === undefined
      ? typeof localStorage === "undefined"
        ? null
        : localStorage
      : options.storage;

  const stored = readStored(storage);
  const today = calendarDayKey(now());
  let activeDay = stored?.day === today ? stored.day : today;
  let destination: ThreadDestination =
    stored?.day === today ? stored.destination : { type: "new_thread" };

  function persist(): void {
    writeStored(storage, { day: activeDay, destination });
  }

  function rollDayIfNeeded(): void {
    const day = calendarDayKey(now());
    if (day === activeDay) return;
    activeDay = day;
    destination = { type: "new_thread" };
    persist();
  }

  return {
    get() {
      rollDayIfNeeded();
      return destination;
    },
    set(next) {
      rollDayIfNeeded();
      destination = next;
      persist();
    },
    touch() {
      rollDayIfNeeded();
    },
    rememberCommit(capture) {
      rollDayIfNeeded();
      if (capture.threadId) {
        destination = { type: "thread", threadId: capture.threadId };
      } else {
        destination = { type: "new_thread" };
      }
      persist();
    },
    startNewThread() {
      rollDayIfNeeded();
      destination = { type: "new_thread" };
      persist();
    },
  };
}

type DestinationGlobals = typeof globalThis & {
  __WT_DESTINATION_SESSION__?: DestinationSession;
};

export function getDestinationSession(): DestinationSession {
  const existing = (globalThis as DestinationGlobals).__WT_DESTINATION_SESSION__;
  if (existing) return existing;

  const session = createDestinationSession();
  (globalThis as DestinationGlobals).__WT_DESTINATION_SESSION__ = session;
  return session;
}

/** Test helper: drop the process-wide sticky session. */
export function resetDestinationSession(): void {
  delete (globalThis as DestinationGlobals).__WT_DESTINATION_SESSION__;
}
