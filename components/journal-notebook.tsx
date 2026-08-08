"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { EnrichmentReport } from "@/components/enrichment-report";
import { SyncRuntime } from "@/components/sync-runtime";
import {
  artifactHref,
  artifactsByThread,
  loadArtifacts,
} from "@/lib/artifacts/client";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import {
  draftCandidates,
  journalThreads,
  notebookEntry,
  type NotebookEntry,
} from "@/lib/journal/notebook";
import { getCaptureStore } from "@/lib/local-capture/store";

/**
 * The notebook: where `route = journal` Threads land (docs/desk.md, D2).
 * Each entry is the walker's words with the full Enrichment report readable
 * in place, linked to its Thread and its Artifact page. Draft-worthy entries
 * carry the post-candidate flag and can be listed together — the queue the
 * tweet/article pipeline pulls from. The entry lives exactly as long as the
 * Route does: un-routing at the desk removes it, the Thread keeps its
 * history.
 */
async function loadNotebookEntries(): Promise<NotebookEntry[]> {
  const store = getCaptureStore();
  const [threads, artifacts] = await Promise.all([
    store.listRecentThreads(),
    loadArtifacts(),
  ]);
  const pages = artifactsByThread(artifacts);
  return Promise.all(
    journalThreads(threads).map(async (thread) => {
      const [{ captures }, enrichments] = await Promise.all([
        store.listThread(thread.id),
        loadThreadEnrichments(thread.id),
      ]);
      return notebookEntry(thread, {
        captures,
        enrichments,
        artifactId: pages.get(thread.id)?.id ?? null,
      });
    }),
  );
}

export function JournalNotebook() {
  const searchParams = useSearchParams();
  const draftsOnly = searchParams.get("drafts") === "1";
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    void loadNotebookEntries().then((next) => {
      if (active) setEntries(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const drafts = entries ? draftCandidates(entries) : [];
  const visible = draftsOnly ? drafts : (entries ?? []);

  return (
    <div className="journal notebook">
      <SyncRuntime />
      <header className="journal-topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Notebook</span>
        </Link>
        <div className="journal-status" role="status">
          <Link className="topbar-link" href="/journal">
            Map
          </Link>
          <span data-testid="notebook-count">
            {entries === null
              ? "Opening the notebook…"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · ${drafts.length} draft ${drafts.length === 1 ? "candidate" : "candidates"}`}
          </span>
        </div>
      </header>

      <nav className="notebook-filters" aria-label="Notebook sections">
        <Link
          className={
            draftsOnly ? "notebook-filter" : "notebook-filter notebook-filter-on"
          }
          href="/journal/notebook"
        >
          All entries
        </Link>
        {/* URL-carried like the desk's facets, so the queue is linkable. */}
        <Link
          className={
            draftsOnly ? "notebook-filter notebook-filter-on" : "notebook-filter"
          }
          href="/journal/notebook?drafts=1"
          data-testid="notebook-drafts-toggle"
        >
          Draft candidates
        </Link>
      </nav>

      {entries !== null && visible.length === 0 ? (
        <section className="journal-empty" role="status">
          <h1>
            {draftsOnly
              ? "No draft candidates yet"
              : "Nothing in the notebook yet"}
          </h1>
          <p>
            {draftsOnly
              ? "Entries the Enrichment reads as the seed of a post are flagged and gather here."
              : "Route a Thread to Journal at the desk and it files in here with its report."}
          </p>
        </section>
      ) : null}

      <section className="notebook-entries" data-testid="notebook-entries">
        {visible.map((entry) => (
          <article
            key={entry.threadId}
            className="notebook-entry"
            data-testid={`notebook-entry-${entry.threadId}`}
          >
            <header className="notebook-entry-head">
              <h2>
                <Link
                  href={`/threads/${entry.threadId}`}
                  data-testid="notebook-thread-link"
                >
                  {entry.title}
                </Link>
              </h2>
              {entry.draftWorthy ? (
                <span
                  className="notebook-draft-flag"
                  data-testid="notebook-draft-flag"
                >
                  Draft candidate
                </span>
              ) : null}
              {entry.routedAt ? (
                <time className="notebook-routed" dateTime={entry.routedAt}>
                  {new Date(entry.routedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              ) : null}
            </header>

            {entry.words.length > 0 ? (
              <blockquote
                className="notebook-words"
                aria-label="The walker's words"
              >
                {entry.words.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </blockquote>
            ) : null}

            {entry.report ? (
              <EnrichmentReport enrichment={entry.report} />
            ) : (
              <p className="notebook-no-report" role="note">
                No report yet — the Enrichment lands here when it finishes.
              </p>
            )}

            {entry.artifactId ? (
              <p className="notebook-entry-links">
                <Link
                  href={artifactHref(entry.artifactId)}
                  data-testid="notebook-artifact-link"
                >
                  Artifact page
                </Link>
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <DataHandlingDisclosure />
      <AppNav />
    </div>
  );
}
