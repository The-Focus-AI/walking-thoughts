"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { SyncRuntime } from "@/components/sync-runtime";
import { SyncStatusPill } from "@/components/sync-status-pill";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  calendarDayKey,
  formatDayHeading,
} from "@/lib/local-capture/calendar-day";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  LocalAttachment,
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";
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
    return { label: "Researching", tone: "busy" };
  }
  return { label: "Report ready", tone: "ready" };
}

function DayPhoto({
  attachment,
  threadId,
}: {
  attachment: LocalAttachment;
  threadId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const key = attachment.localObjectKey ?? attachment.thumbnailObjectKey;
    if (!key) {
      // Captured on another device: stream the private server copy.
      if (attachment.remoteObjectKey) {
        setUrl(`/api/media/${attachment.id}`);
      }
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    void createIdbMediaStore()
      .get(key)
      .then((blob) => {
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    attachment.id,
    attachment.localObjectKey,
    attachment.thumbnailObjectKey,
    attachment.remoteObjectKey,
  ]);

  if (!url || failed) return null;
  return (
    <Link href={`/threads/${threadId}`} className="threads-day-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob or private media URL */}
      <img src={url} alt={attachment.fileName} onError={() => setFailed(true)} />
    </Link>
  );
}

/**
 * The walk view: Threads grouped by day. Each day leads with its photos;
 * each Thread is one dense row — your words, the report's title, and where
 * research stands — one tap from the full Thread.
 */
export function ThreadsArchive() {
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

  return (
    <main className="threads-archive">
      <SyncRuntime />
      <header className="threads-archive-header">
        <div>
          <p className="eyebrow">By day</p>
          <h1>Threads</h1>
          <p>
            Every Capture is its own Thread. Tap one to read its report, reply,
            or copy it as markdown.
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
          No Threads yet. Add a Capture from the Capture tab — it starts its
          own Thread.
        </p>
      ) : null}

      {byDay.map(([dayKey, dayThreads]) => {
        const dayPhotos = dayThreads.flatMap((view) =>
          view.captures.flatMap((capture) =>
            capture.attachments
              .filter((attachment) => attachment.kind === "image")
              .map((attachment) => ({
                attachment,
                threadId: view.thread.id,
              })),
          ),
        );
        return (
          <section
            key={dayKey}
            className="threads-day"
            aria-label={formatDayHeading(dayKey)}
          >
            <h2>{formatDayHeading(dayKey)}</h2>
            {dayPhotos.length > 0 ? (
              <div className="threads-day-photos" aria-label="Photos from this day">
                {dayPhotos.map(({ attachment, threadId }) => (
                  <DayPhoto
                    key={attachment.id}
                    attachment={attachment}
                    threadId={threadId}
                  />
                ))}
              </div>
            ) : null}
            <ul className="threads-day-list">
              {dayThreads.map((view) => {
                const chip = threadStatusChip(view.captures);
                const words = view.captures[0]?.text ?? "";
                const mediaCount = view.captures.reduce(
                  (count, capture) => count + capture.attachments.length,
                  0,
                );
                return (
                  <li key={view.thread.id} className="thread-row">
                    <Link
                      className="thread-row-main"
                      href={`/threads/${view.thread.id}`}
                    >
                      <span className="thread-row-title">{view.thread.title}</span>
                      {words && words !== view.thread.title ? (
                        <span className="thread-row-words">{words}</span>
                      ) : null}
                      <span className="thread-row-meta">
                        {view.enrichments.length}{" "}
                        {view.enrichments.length === 1 ? "report" : "reports"}
                        {view.captures.length > 1
                          ? ` · ${view.captures.length} Captures`
                          : ""}
                        {mediaCount > 0
                          ? ` · ${mediaCount} media`
                          : ""}
                      </span>
                    </Link>
                    <div className="thread-row-side">
                      <span
                        className={`thread-chip thread-chip-${chip.tone}`}
                        data-testid="thread-sync-chip"
                      >
                        {chip.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <AppNav />
    </main>
  );
}
