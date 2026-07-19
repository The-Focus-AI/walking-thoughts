"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CaptureEntryView,
  EnrichmentEntryView,
} from "@/components/thread-entries";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  calendarDayKey,
  formatDayHeading,
} from "@/lib/local-capture/calendar-day";
import { getDestinationSession } from "@/lib/local-capture/destination";
import { getCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";
import { useRouter } from "next/navigation";

type ThreadArchiveView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
  dayKey: string;
};

export function ThreadsArchive() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadArchiveView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
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
    })();
    return () => {
      active = false;
    };
  }, []);

  const byDay = useMemo(() => {
    const groups = new Map<string, ThreadArchiveView[]>();
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
      <header className="threads-archive-header">
        <div>
          <p className="eyebrow">Archive</p>
          <h1>Threads by day</h1>
          <p>
            Browse every hike Thread with Captures and Walking Thoughts replies
            in order. Continue one on the trail when you want to append.
          </p>
        </div>
        <Link className="topbar-link" href="/">
          Back to capture
        </Link>
      </header>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      {byDay.length === 0 && !error ? (
        <p className="trail-thread-empty">
          No Threads yet. Capture on the home trail view to start today&apos;s
          hike.
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
              const open = expandedId === view.thread.id;
              const timeline = chronologicalThreadEntries(
                view.captures,
                view.enrichments,
              );
              return (
                <li key={view.thread.id} className="threads-day-card">
                  <div className="threads-day-card-header">
                    <button
                      type="button"
                      className="threads-day-toggle"
                      aria-expanded={open}
                      onClick={() =>
                        setExpandedId(open ? null : view.thread.id)
                      }
                    >
                      <span>{view.thread.title}</span>
                      <span className="capture-revision">
                        {view.captures.length} Captures ·{" "}
                        {view.enrichments.length} replies · rev{" "}
                        {view.thread.revision}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="capture-retry"
                      onClick={() => continueOnTrail(view.thread.id)}
                    >
                      Continue on trail
                    </button>
                  </div>
                  {open ? (
                    <ul className="capture-list trail-timeline">
                      {timeline.map((entry) =>
                        entry.kind === "capture" ? (
                          <li key={entry.capture.id}>
                            <CaptureEntryView
                              capture={entry.capture}
                              showSpeaker
                              mediaPreviews
                            />
                          </li>
                        ) : (
                          <li key={entry.enrichment.id}>
                            <EnrichmentEntryView enrichment={entry.enrichment} />
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
