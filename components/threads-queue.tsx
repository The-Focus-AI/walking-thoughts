"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { DailyDigestPanel } from "@/components/daily-digest-panel";
import { SyncRuntime } from "@/components/sync-runtime";
import { SyncStatusPill } from "@/components/sync-status-pill";
import { ThreadChat } from "@/components/thread-chat";
import { ThreadFiling } from "@/components/thread-filing";
import {
  loadThreadEnrichments,
  readCachedThreadEnrichments,
} from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  calendarDayKey,
  formatDayHeading,
  formatDayShort,
} from "@/lib/local-capture/calendar-day";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import { getCaptureStore } from "@/lib/local-capture/store";
import {
  KIND_DESK_ORDER,
  KIND_LABELS,
  type LocalAttachment,
  type LocalCapture,
  type LocalThread,
  type ThreadKind,
} from "@/lib/local-capture/types";
import { getReviewTransport } from "@/lib/sync/review-client";
import type { Project } from "@/lib/sync/types";
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

function dayKeyForThread(
  thread: LocalThread,
  captures: LocalCapture[],
): string {
  // Prefer Capture day so day sections match what the day digest will read.
  const firstCapture = captures[0];
  return firstCapture
    ? calendarDayKey(new Date(firstCapture.createdAt))
    : calendarDayKey(new Date(thread.updatedAt));
}

/**
 * The walk view: Threads grouped by day. Each day leads with its photos;
 * each Thread is one dense row. Days themselves are selectable: open one to
 * digest that day's Captures and Enrichments. On desktop this is a
 * master-detail workspace; on phones, selection swaps the panes. Horizontal
 * swipes step between Threads when one is open.
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<"new" | "all">("new");
  const [search, setSearch] = useState("");
  /** Day-strip pick: null = newest day, "all" = the whole archive. */
  const [focusDay, setFocusDay] = useState<string | null>(null);
  /** Kind-strip pick: null = every kind, "ask" = only Threads with a question. */
  const [focusKind, setFocusKind] = useState<ThreadKind | "ask" | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  /** Project-strip pick: null = every Project. */
  const [focusProject, setFocusProject] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const store = getCaptureStore();
      const recent = await store.listRecentThreads();
      // Local-first: paint from IndexedDB plus the retained Enrichment
      // cache before touching the network, so the list is stable offline
      // instead of flashing the zero-Thread state while per-Thread
      // Enrichment fetches hang or fail.
      const localViews = await Promise.all(
        recent.map(async (thread) => {
          const view = await store.listThread(thread.id);
          return {
            ...view,
            enrichments: readCachedThreadEnrichments(thread.id),
            dayKey: dayKeyForThread(thread, view.captures),
          };
        }),
      );
      if (generation !== loadGeneration.current) return;
      setThreads(localViews);
      setLoaded(true);
      const refreshed = await Promise.all(
        localViews.map(async (view) => ({
          ...view,
          enrichments: await loadThreadEnrichments(view.thread.id),
        })),
      );
      if (generation !== loadGeneration.current) return;
      setThreads(refreshed);
    } catch {
      if (generation !== loadGeneration.current) return;
      setError("Could not load Threads");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getReviewTransport()
      .listProjects?.()
      .then((list) => {
        if (active && list) setProjects(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
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
  const queueThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter((view) => {
      if (query) {
        const haystack = [
          view.thread.title,
          ...view.captures.map((capture) => capture.text),
          ...(view.thread.topics ?? []),
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

  /** Counts for the kind strip, before the kind filter narrows the list. */
  const kindCounts = useMemo(() => {
    const counts = new Map<ThreadKind, number>();
    for (const view of queueThreads) {
      const kind = view.thread.kind;
      if (!kind) continue;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return KIND_DESK_ORDER.filter((kind) => counts.has(kind)).map(
      (kind) => [kind, counts.get(kind)!] as const,
    );
  }, [queueThreads]);

  const askCount = useMemo(
    () => queueThreads.filter((view) => Boolean(view.thread.ask)).length,
    [queueThreads],
  );

  const activeKind =
    focusKind === "ask"
      ? askCount > 0
        ? "ask"
        : null
      : focusKind && kindCounts.some(([kind]) => kind === focusKind)
        ? focusKind
        : null;

  /** Projects with Threads in view, named from the Threads themselves so the
      strip still reads offline. */
  const projectCounts = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const view of queueThreads) {
      const id = view.thread.projectId;
      if (!id) continue;
      const name =
        view.thread.projectName ??
        projects.find((project) => project.id === id)?.name ??
        "Project";
      const entry = counts.get(id) ?? { name, count: 0 };
      counts.set(id, { name: entry.name, count: entry.count + 1 });
    }
    return [...counts.entries()].sort((a, b) =>
      a[1].name < b[1].name ? -1 : 1,
    );
  }, [queueThreads, projects]);

  const activeProject =
    focusProject && projectCounts.some(([id]) => id === focusProject)
      ? focusProject
      : null;

  const visibleThreads = useMemo(() => {
    const byProject = activeProject
      ? queueThreads.filter((view) => view.thread.projectId === activeProject)
      : queueThreads;
    if (activeKind === "ask") {
      return byProject.filter((view) => Boolean(view.thread.ask));
    }
    return activeKind
      ? byProject.filter((view) => view.thread.kind === activeKind)
      : byProject;
  }, [queueThreads, activeKind, activeProject]);

  const byDay = useMemo(() => {
    const groups = new Map<string, ThreadListView[]>();
    for (const view of visibleThreads) {
      const list = groups.get(view.dayKey) ?? [];
      list.push(view);
      groups.set(view.dayKey, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleThreads]);

  /**
   * The day strip keeps the page small: one day of Threads at a time.
   * Search reaches everything; a stale pick falls back to the newest day.
   */
  const dayKeys = useMemo(() => byDay.map(([dayKey]) => dayKey), [byDay]);
  const activeDay = search.trim()
    ? "all"
    : focusDay === "all"
      ? "all"
      : focusDay && dayKeys.includes(focusDay)
        ? focusDay
        : (dayKeys[0] ?? "all");
  const visibleByDay =
    activeDay === "all"
      ? byDay
      : byDay.filter(([dayKey]) => dayKey === activeDay);

  /** Threads in display order (day by day) for swipe stepping. */
  const orderedThreadIds = useMemo(
    () =>
      byDay.flatMap(([, dayThreads]) =>
        dayThreads.map((view) => view.thread.id),
      ),
    [byDay],
  );

  const openAdjacentThread = useCallback(
    (step: 1 | -1) => {
      if (!selectedThreadId) return;
      const index = orderedThreadIds.indexOf(selectedThreadId);
      if (index === -1) return;
      const nextId = orderedThreadIds[index + step];
      if (nextId) router.push(`/threads/${nextId}`);
    },
    [orderedThreadIds, router, selectedThreadId],
  );

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const onDetailTouchStart = useCallback((event: React.TouchEvent) => {
    swipeStart.current =
      event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
  }, []);

  const onDetailTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // Only a deliberate horizontal swipe — never a vertical scroll of
      // the log that happens to drift sideways.
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // Swipe left → next (older) Thread; swipe right → previous (newer).
      openAdjacentThread(dx < 0 ? 1 : -1);
    },
    [openAdjacentThread],
  );

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
              Pick a day to browse it, chat across its Threads, or open one
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

        {kindCounts.length > 0 || askCount > 0 ? (
          <div className="threads-kind-strip" role="tablist" aria-label="Kinds">
            <button
              type="button"
              role="tab"
              aria-selected={activeKind === null}
              data-testid="kind-chip-all"
              className={
                activeKind === null
                  ? "threads-kind-chip active"
                  : "threads-kind-chip"
              }
              onClick={() => setFocusKind(null)}
            >
              All kinds
            </button>
            {askCount > 0 ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeKind === "ask"}
                data-testid="kind-chip-ask"
                className={
                  activeKind === "ask"
                    ? "threads-kind-chip threads-kind-chip-ask active"
                    : "threads-kind-chip threads-kind-chip-ask"
                }
                onClick={() =>
                  setFocusKind(activeKind === "ask" ? null : "ask")
                }
              >
                <span>Needs a word</span>
                <span className="threads-kind-chip-count">{askCount}</span>
              </button>
            ) : null}
            {kindCounts.map(([kind, count]) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={activeKind === kind}
                data-testid={`kind-chip-${kind}`}
                className={
                  activeKind === kind
                    ? "threads-kind-chip active"
                    : "threads-kind-chip"
                }
                onClick={() => setFocusKind(activeKind === kind ? null : kind)}
              >
                <span>{KIND_LABELS[kind]}</span>
                <span className="threads-kind-chip-count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {projectCounts.length > 0 ? (
          <div
            className="threads-kind-strip"
            role="tablist"
            aria-label="Projects"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeProject === null}
              data-testid="project-chip-all"
              className={
                activeProject === null
                  ? "threads-project-chip active"
                  : "threads-project-chip"
              }
              onClick={() => setFocusProject(null)}
            >
              All projects
            </button>
            {projectCounts.map(([id, { name, count }]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeProject === id}
                data-testid={`project-chip-${id}`}
                className={
                  activeProject === id
                    ? "threads-project-chip active"
                    : "threads-project-chip"
                }
                onClick={() =>
                  setFocusProject(activeProject === id ? null : id)
                }
              >
                <span>{name}</span>
                <span className="threads-kind-chip-count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {dayKeys.length > 0 && !search.trim() ? (
          <div className="threads-day-strip" role="tablist" aria-label="Days">
            {dayKeys.map((dayKey) => {
              const count = byDay.find(([key]) => key === dayKey)?.[1].length;
              const isActive = activeDay === dayKey;
              return (
                <button
                  key={dayKey}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`day-chip-${dayKey}`}
                  className={
                    isActive ? "threads-day-chip active" : "threads-day-chip"
                  }
                  onClick={() => setFocusDay(dayKey)}
                >
                  <span>
                    {dayKey === calendarDayKey()
                      ? "Today"
                      : formatDayShort(dayKey)}
                  </span>
                  <span className="threads-day-chip-count">{count}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={activeDay === "all"}
              data-testid="day-chip-all"
              className={
                activeDay === "all"
                  ? "threads-day-chip active"
                  : "threads-day-chip"
              }
              onClick={() => setFocusDay("all")}
            >
              All days
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="capture-error" role="alert">
            {error}
          </p>
        ) : null}

        {loaded && byDay.length === 0 && !error ? (
          <p className="trail-thread-empty">
            {search
              ? "No Threads match that search."
              : queue === "new" && threads.length > 0
                ? "Everything is filed. Sitting down afterwards is done."
                : "No Threads yet. Add a Capture from the Capture tab — it starts its own Thread."}
          </p>
        ) : null}

        {visibleByDay.map(([dayKey, dayThreads]) => {
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
                <span className="threads-day-select-hint">
                  Chat about this day
                </span>
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
                        {view.thread.projectName ? (
                          <span
                            className={
                              view.thread.reviewedAt
                                ? "thread-row-project"
                                : "thread-row-project guessed"
                            }
                            data-testid="thread-project-chip"
                          >
                            {view.thread.projectName}
                            {view.thread.reviewedAt ? "" : "?"}
                          </span>
                        ) : null}
                        <ThreadFiling
                          thread={view.thread}
                          projects={projects}
                          onFiled={() => void load()}
                          onProjectCreated={(project) =>
                            setProjects((current) =>
                              current.some((item) => item.id === project.id)
                                ? current
                                : [...current, project],
                            )
                          }
                        />
                        {view.thread.ask ? (
                          <span
                            className="thread-row-ask"
                            data-testid="thread-ask-chip"
                            title={view.thread.ask}
                          >
                            Needs a word
                          </span>
                        ) : null}
                        {view.thread.kind ? (
                          <span
                            className="thread-row-kind"
                            data-testid={`thread-kind-${view.thread.kind}`}
                          >
                            {KIND_LABELS[view.thread.kind]}
                          </span>
                        ) : null}
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

      <div
        className="threads-detail-pane"
        onTouchStart={onDetailTouchStart}
        onTouchEnd={onDetailTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
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
