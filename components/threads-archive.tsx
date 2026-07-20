"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { SyncRuntime } from "@/components/sync-runtime";
import { SyncStatusPill } from "@/components/sync-status-pill";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  calendarDayKey,
  formatDayHeading,
} from "@/lib/local-capture/calendar-day";
import { getDestinationSession } from "@/lib/local-capture/destination";
import { getCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
import { SYNC_CYCLE_EVENT } from "@/lib/sync/cycle";
import { syncRollup } from "@/lib/sync/rollup";

type ThreadListView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
  dayKey: string;
};

function threadStatusChip(captures: LocalCapture[]): {
  label: string;
  tone: "ready" | "busy" | "attention";
} {
  const rollup = syncRollup(captures.map((capture) => capture.status));
  if (rollup.needs_attention > 0) {
    return { label: "Needs attention", tone: "attention" };
  }
  if (rollup.saved_locally > 0 || rollup.syncing > 0) {
    return { label: "Waiting to sync", tone: "busy" };
  }
  if (rollup.enriching > 0) {
    return { label: "Enriching", tone: "busy" };
  }
  return { label: "Synced", tone: "ready" };
}

/**
 * Threads home: every Thread is one tap away from its full conversation, and
 * each row doubles as a sync dashboard entry.
 */
export function ThreadsArchive() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadListView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const store = getCaptureStore();
        const recent = await store.listRecentThreads();
        const views = await Promise.all(
          recent.map(async (thread) => {
            const view = await store.listThread(thread.id);
            const enrichments = await loadThreadEnrichments(thread.id);
            return {
              ...view,
              enrichments,
              dayKey: calendarDayKey(new Date(thread.updatedAt)),
            };
          }),
        );
        if (active) setThreads(views);
      } catch {
        if (active) setError("Could not load Threads");
      }
    }

    void load();
    const onCycle = () => void load();
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      active = false;
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
  }, []);

  const byDay = useMemo(() => {
    const groups = new Map<string, ThreadListView[]>();
    for (const view of threads) {
      const list = groups.get(view.dayKey) ?? [];
      list.push(view);
      groups.set(view.dayKey, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [threads]);

  function continueOnTrail(threadId: string) {
    getDestinationSession().set({ type: "thread", threadId });
    router.push("/");
  }

  return (
    <main className="threads-archive">
      <SyncRuntime />
      <header className="threads-archive-header">
        <div>
          <p className="eyebrow">By day</p>
          <h1>Threads</h1>
          <p>
            Tap a Thread to read it and reply. Continue on trail points your
            next Capture at that Thread.
          </p>
        </div>
        <SyncStatusPill />
      </header>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      {byDay.length === 0 && !error ? (
        <p className="trail-thread-empty">
          No Threads yet. Add a Capture from the Capture tab to start
          today&apos;s hike.
        </p>
      ) : null}

      {byDay.map(([dayKey, dayThreads]) => (
        <section
          key={dayKey}
          className="threads-day"
          aria-label={formatDayHeading(dayKey)}
        >
          <h2>{formatDayHeading(dayKey)}</h2>
          <ul className="threads-day-list">
            {dayThreads.map((view) => {
              const chip = threadStatusChip(view.captures);
              return (
                <li key={view.thread.id} className="thread-row">
                  <Link
                    className="thread-row-main"
                    href={`/threads/${view.thread.id}`}
                  >
                    <span className="thread-row-title">{view.thread.title}</span>
                    <span className="thread-row-meta">
                      {view.captures.length}{" "}
                      {view.captures.length === 1 ? "Capture" : "Captures"} ·{" "}
                      {view.enrichments.length}{" "}
                      {view.enrichments.length === 1 ? "reply" : "replies"}
                    </span>
                  </Link>
                  <div className="thread-row-side">
                    <span
                      className={`thread-chip thread-chip-${chip.tone}`}
                      data-testid="thread-sync-chip"
                    >
                      {chip.label}
                    </span>
                    <button
                      type="button"
                      className="capture-retry"
                      onClick={() => continueOnTrail(view.thread.id)}
                    >
                      Continue on trail
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AppNav />
    </main>
  );
}
