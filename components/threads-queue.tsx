"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { DailyDigestPanel } from "@/components/daily-digest-panel";
import { SyncRuntime } from "@/components/sync-runtime";
import { SyncStatusPill } from "@/components/sync-status-pill";
import { ThreadChat } from "@/components/thread-chat";
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

function threadStatus(captures: LocalCapture[]): {
  label: string;
  tone: "ready" | "busy" | "attention";
} {
  const rollup = syncRollup(captures.map((capture) => capture.status));
  if (rollup.needs_attention > 0) {
    return { label: "Needs attention", tone: "attention" };
  }
  if (rollup.syncing > 0) {
    return { label: "Syncing", tone: "busy" };
  }
  if (rollup.saved_locally > 0) {
    return { label: "Saved locally", tone: "busy" };
  }
  if (rollup.enriching > 0) {
    return { label: "Enriching", tone: "busy" };
  }
  return { label: "Complete", tone: "ready" };
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

function isDayKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/**
 * The walk view: Threads grouped by day. Each day leads with its photos;
 * each Thread is one dense row — your words, the report's title, and where
 * research stands. Days themselves are selectable: open one to digest that
 * day's Captures and Enrichments. On desktop this is a master-detail
 * workspace; on phones, selection swaps the panes.
 */
export function ThreadsQueue({
  selectedThreadId,
}: {
  selectedThreadId?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const selectedDayKey =
    !selectedThreadId && isDayKey(dayParam) ? dayParam : null;

  const [threads, setThreads] = useState<ThreadListView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<"new" | "all">("new");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const store = getCaptureStore();
      const recent = await store.listRecentThreads();
      const views = await Promise.all(
        recent.map(async (thread) => {
          const view = await store.listThread(thread.id);
          const enrichments = await loadThreadEnrichments(thread.id);
          // Prefer Capture day when the Thread has Captures so day sections
          // match what the day digest will read.
          const firstCapture = view.captures[0];
          const dayKey = firstCapture
            ? calendarDayKey(new Date(firstCapture.createdAt))
            : calendarDayKey(new Date(thread.updatedAt));
          return {
            ...view,
            enrichments,
            dayKey,
          };
        }),
      );
      setThreads(views);
    } catch {
      setError("Could not load Threads");
    }
  }, []);

  useEffect(() => {
    void load();
    const onCycle = () => void load();
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
  }, [load]);

  // The processing queue: New by default; search reaches everything.
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter((view) => {
      if (query) {
        const haystack = [
          view.thread.title,
          ...view.captures.map((capture) => capture.text),
        ]
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
        return true;
      }
      if (queue === "new" && view.thread.reviewedAt) {
        // Keep the open Thread visible while it is being processed.
        return view.thread.id === selectedThreadId;
      }
      return true;
    });
  }, [threads, queue, search, selectedThreadId]);

  const byDay = useMemo(() => {
    const groups = new Map<string, ThreadListView[]>();
    for (const view of visibleThreads) {
      const list = groups.get(view.dayKey) ?? [];
      list.push(view);
      groups.set(view.dayKey, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleThreads]);

  /** After marking reviewed, advance to the next new Thread — inbox zero. */
  const onReviewedChange = useCallback(
    (reviewed: boolean) => {
      void load();
      if (!reviewed) return;
      const next = threads.find(
        (view) =>
          !view.thread.reviewedAt && view.thread.id !== selectedThreadId,
      );
      router.push(next ? `/threads/${next.thread.id}` : "/threads");
    },
    [load, router, threads, selectedThreadId],
  );

  function selectDay(dayKey: string) {
    router.push(`/threads?day=${dayKey}`);
  }

  function clearDay() {
    router.push("/threads");
  }

  const hasSelection = Boolean(selectedThreadId || selectedDayKey);

  return (
    <main
      className={
        hasSelection
          ? "threads-queue threads-workspace has-selection"
          : "threads-queue threads-workspace"
      }
    >
      <SyncRuntime />
      <div className="threads-list-pane">
        <header className="threads-queue-header">
          <div>
            <p className="eyebrow">By day</p>
            <h1>Threads</h1>
            <p>
              Select a day to digest its Captures and Enrichments, or open one
              Thread to read and reply.
            </p>
          </div>
          <div className="threads-queue-side">
            <SyncStatusPill />
            <Link className="interview-entry" href="/interview">
              Interview
            </Link>
          </div>
        </header>

        <div className="threads-queue-bar">
          <div className="threads-queue-chips" role="tablist" aria-label="Queue">
            <button
              type="button"
              role="tab"
              aria-selected={queue === "new" && !search}
              className={
                queue === "new" && !search
                  ? "threads-queue-chip active"
                  : "threads-queue-chip"
              }
              onClick={() => {
                setQueue("new");
                setSearch("");
              }}
            >
              New
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={queue === "all" && !search}
              className={
                queue === "all" && !search
                  ? "threads-queue-chip active"
                  : "threads-queue-chip"
              }
              onClick={() => {
                setQueue("all");
                setSearch("");
              }}
            >
              All
            </button>
          </div>
          <input
            type="search"
            className="threads-search"
            placeholder="Search all Threads…"
            aria-label="Search all Threads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error ? (
          <p className="capture-error" role="alert">
            {error}
          </p>
        ) : null}

        {byDay.length === 0 && !error ? (
          <p className="trail-thread-empty">
            {search
              ? "No Threads match that search."
              : queue === "new" && threads.length > 0
                ? "Nothing waiting. Every Thread is marked Reviewed."
                : "No Threads yet. Add a Capture from the Capture tab — it starts its own Thread."}
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
          const daySelected = selectedDayKey === dayKey;
          const heading = formatDayHeading(dayKey);
          return (
            <section
              key={dayKey}
              className={
                daySelected ? "threads-day threads-day-selected" : "threads-day"
              }
              aria-label={heading}
            >
              <button
                type="button"
                className="threads-day-select"
                aria-pressed={daySelected}
                data-testid={`select-day-${dayKey}`}
                onClick={() => selectDay(dayKey)}
              >
                <span className="threads-day-select-title">{heading}</span>
                <span className="threads-day-select-hint">Digest this day</span>
              </button>
              {dayPhotos.length > 0 ? (
                <div
                  className="threads-day-photos"
                  aria-label="Photos from this day"
                >
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
                  const status = threadStatus(view.captures);
                  const words = view.captures[0]?.text ?? "";
                  const mediaCount = view.captures.reduce(
                    (count, capture) => count + capture.attachments.length,
                    0,
                  );
                  return (
                    <li
                      key={view.thread.id}
                      className={[
                        "thread-row",
                        view.thread.id === selectedThreadId
                          ? "thread-row-selected"
                          : "",
                        status.tone === "attention" && !view.thread.reviewedAt
                          ? "thread-row-attention"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Link
                        className="thread-row-main"
                        href={`/threads/${view.thread.id}`}
                      >
                        <span className="thread-row-title">
                          {view.thread.title}
                        </span>
                        {words && words !== view.thread.title ? (
                          <span className="thread-row-words">{words}</span>
                        ) : null}
                        <span className="thread-row-meta">
                          {view.enrichments.length}{" "}
                          {view.enrichments.length === 1
                            ? "Enrichment"
                            : "Enrichments"}
                          {view.captures.length > 1
                            ? ` · ${view.captures.length} Captures`
                            : ""}
                          {mediaCount > 0 ? ` · ${mediaCount} media` : ""}
                        </span>
                      </Link>
                      <div className="thread-row-side">
                        {view.thread.reviewedAt ? (
                          <span
                            className="thread-row-status thread-status-reviewed"
                            data-testid="thread-reviewed-chip"
                          >
                            Reviewed
                          </span>
                        ) : (
                          <span
                            className={`thread-row-status thread-status-${status.tone}`}
                            data-testid="thread-sync-chip"
                          >
                            {status.label}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="threads-detail-pane">
        {selectedThreadId ? (
          <ThreadChat
            key={selectedThreadId}
            threadId={selectedThreadId}
            onReviewedChange={onReviewedChange}
          />
        ) : selectedDayKey ? (
          <DailyDigestPanel
            key={selectedDayKey}
            dayKey={selectedDayKey}
            onClose={clearDay}
          />
        ) : (
          <div className="threads-detail-empty">
            <p>Select a day to digest it, or a Thread to read its Enrichment.</p>
          </div>
        )}
      </div>

      <AppNav />
    </main>
  );
}
