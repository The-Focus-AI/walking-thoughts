import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { captureWords } from "@/lib/local-capture/types";

/**
 * The notebook (docs/desk.md, D2): `route = journal` Threads read back as
 * entries — the walker's words with the full Enrichment report readable in
 * place. Selection is pure and shape-agnostic so the same logic serves the
 * device's local Threads and the server repositories under test: an entry
 * exists exactly while its Thread is routed to the Journal, so un-routing
 * removes it without touching the Thread's history.
 */
export type NotebookThread = {
  id: string;
  title: string;
  reviewedAt?: string | null;
  route?: string | null;
};

export type NotebookEntry = {
  threadId: string;
  title: string;
  /** When the walker settled the Route — the entry's place in the notebook. */
  routedAt: string | null;
  /** The walker's own words, one line per Capture that had any. */
  words: string[];
  /** The newest Enrichment, readable in place; null when none has landed. */
  report: ThreadEnrichment | null;
  /** Flagged as a post candidate — the tweet/article queue pulls from these. */
  draftWorthy: boolean;
  /** The published Artifact page for this Thread, when it has one. */
  artifactId: string | null;
};

/** The Threads the notebook holds, newest settled first. */
export function journalThreads<T extends NotebookThread>(threads: T[]): T[] {
  return threads
    .filter((thread) => thread.route === "journal")
    .sort((a, b) => {
      const left = a.reviewedAt ?? "";
      const right = b.reviewedAt ?? "";
      return left < right ? 1 : left > right ? -1 : 0;
    });
}

/** One Thread laid out as a notebook entry. */
export function notebookEntry(
  thread: NotebookThread,
  context: {
    captures?: Array<{ text: string }>;
    enrichments?: ThreadEnrichment[];
    artifactId?: string | null;
  } = {},
): NotebookEntry {
  const enrichments = [...(context.enrichments ?? [])].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
  const report = enrichments[enrichments.length - 1] ?? null;
  return {
    threadId: thread.id,
    title: thread.title,
    routedAt: thread.reviewedAt ?? null,
    words: (context.captures ?? [])
      .map((capture) => captureWords(capture))
      .filter((text) => text.length > 0),
    report,
    // Once any Enrichment reads the words as the seed of a post, a later
    // follow-up answer does not unsay it.
    draftWorthy: enrichments.some((enrichment) => enrichment.draftWorthy),
    artifactId: context.artifactId ?? null,
  };
}

/** The post queue: entries whose words already read like a draft. */
export function draftCandidates(entries: NotebookEntry[]): NotebookEntry[] {
  return entries.filter((entry) => entry.draftWorthy);
}
