import type { LocalThread, ThreadDestination } from "./types";

export function titleFromText(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? text;
  return firstLine.slice(0, 80) || "Thread";
}

export type ResolvedDestination = {
  threadId: string | null;
  sequence: number;
  thread: LocalThread | null;
};

type ResolveInput = {
  destination: ThreadDestination;
  text: string;
  threads: LocalThread[];
  createId: () => string;
  now: () => string;
};

export function resolveCommitDestination({
  destination,
  text,
  threads,
  createId,
  now,
}: ResolveInput): ResolvedDestination {
  if (destination.type === "new_thread") {
    const thread: LocalThread = {
      id: createId(),
      title: titleFromText(text),
      revision: 1,
      updatedAt: now(),
    };
    return { threadId: thread.id, sequence: 1, thread };
  }

  const existing = threads.find((thread) => thread.id === destination.threadId);
  if (!existing) {
    throw new Error("Thread not found");
  }

  const sequence = existing.revision + 1;
  const thread: LocalThread = {
    ...existing,
    revision: sequence,
    updatedAt: now(),
  };
  return { threadId: thread.id, sequence, thread };
}
