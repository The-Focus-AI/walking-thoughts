import type { LocalCapture, ThreadDestination } from "./types";

const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000;

export type DestinationSession = {
  get(): ThreadDestination;
  set(destination: ThreadDestination): void;
  touch(): void;
  rememberCommit(capture: LocalCapture): void;
};

type DestinationSessionOptions = {
  now?: () => Date;
  inactivityMs?: number;
};

export function createDestinationSession(
  options: DestinationSessionOptions = {},
): DestinationSession {
  const now = options.now ?? (() => new Date());
  const inactivityMs = options.inactivityMs ?? DEFAULT_INACTIVITY_MS;
  let destination: ThreadDestination = { type: "inbox" };
  let lastActiveAt = now().getTime();

  function expireIfNeeded(): void {
    if (now().getTime() - lastActiveAt >= inactivityMs) {
      destination = { type: "inbox" };
      lastActiveAt = now().getTime();
    }
  }

  return {
    get() {
      expireIfNeeded();
      return destination;
    },
    set(next) {
      destination = next;
      lastActiveAt = now().getTime();
    },
    touch() {
      expireIfNeeded();
      lastActiveAt = now().getTime();
    },
    rememberCommit(capture) {
      if (capture.threadId) {
        destination = { type: "thread", threadId: capture.threadId };
      } else {
        destination = { type: "inbox" };
      }
      lastActiveAt = now().getTime();
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
