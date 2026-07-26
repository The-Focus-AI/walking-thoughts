"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { DailyDigestPanel } from "@/components/daily-digest-panel";
import {
  artifactHref,
  artifactsByThread,
  loadArtifacts,
  readCachedArtifacts,
} from "@/lib/artifacts/client";
import type { ArtifactSummary } from "@/lib/artifacts/types";
import { SyncRuntime } from "@/components/sync-runtime";
import { SyncStatusPill } from "@/components/sync-status-pill";
import { ThreadChat } from "@/components/thread-chat";
import { ThreadFiling } from "@/components/thread-filing";
import { summarizeDay } from "@/lib/digest/day-sheet";
import {
  loadThreadEnrichments,
  readCachedThreadEnrichments,
} from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  calendarDayKey,
  formatDayShort,
} from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";
import {
  KIND_LABELS,
  type LocalCapture,
  type LocalThread,
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

function isDayKey(value: string | undefined): value is string {
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

function dayTitle(dayKey: string): string {
  return dayKey === calendarDayKey() ? "Today" : formatDayShort(dayKey);
}

/** One Thread as a dense desk row: what it says, how it is filed, where it is. */
function ThreadRow({
  view,
  selected,
  projects,
  showDay,
  artifact,
  onFiled,
  onProjectCreated,
}: {
  view: ThreadListView;
  selected: boolean;
  projects: Project[];
  showDay?: boolean;
  /** The published page for this Thread, when its report earned one. */
  artifact?: ArtifactSummary;
  onFiled: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const status = threadStatus(view.captures);
  const words = view.captures[0]?.text ?? "";
  const mediaCount = view.captures.reduce(
    (count, capture) => count + capture.attachments.length,
    0,
  );

  return (
    <li
      className={[
        "thread-row",
        selected ? "thread-row-selected" : "",
        view.thread.reviewedAt ? "thread-row-filed" : "",
        status.tone === "attention" && !view.thread.reviewedAt
          ? "thread-row-attention"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link className="thread-row-main" href={`/threads/${view.thread.id}`}>
        <span className="thread-row-title">{view.thread.title}</span>
        {words && words !== view.thread.title ? (
          <span className="thread-row-words">{words}</span>
        ) : null}
        <span className="thread-row-meta">
          {showDay ? `${dayTitle(view.dayKey)} · ` : ""}
          {view.enrichments.length}{" "}
          {view.enrichments.length === 1 ? "Enrichment" : "Enrichments"}
          {view.captures.length > 1 ? ` · ${view.captures.length} Captures` : ""}
          {mediaCount > 0 ? ` · ${mediaCount} media` : ""}
        </span>
      </Link>
      <div className="thread-row-side">
        {artifact ? (
          <a
            className="thread-row-artifact"
            href={artifactHref(artifact.id)}
            target="_blank"
            rel="noreferrer"
            data-testid="thread-artifact-link"
            title={artifact.standfirst ?? "Read the published report"}
          >
            Report
          </a>
        ) : null}
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
          onFiled={onFiled}
          onProjectCreated={onProjectCreated}
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
}

/**
 * The desk: the walk is over, and the unit of work is a day. The list pane
 * holds one row per day — what it holds and what it still wants — and the
 * detail pane opens that day: its sheet, its Threads, and an ongoing chat
 * with the whole day. One Thread at a time opens from there.
 *
 * Lives in the (desk) layout so it stays mounted while the walker moves
 * between days and Threads; the selection comes from the route, not a prop.
 */
export function DeskWorkspace({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ threadId?: string; dayKey?: string }>();
  const selectedThreadId =
    typeof params.threadId === "string" ? params.threadId : undefined;
  const dayParam =
    typeof params.dayKey === "string" ? params.dayKey : undefined;
  const selectedDayKey = isDayKey(dayParam) ? dayParam : null;

  const [threads, setThreads] = useState<ThreadListView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [artifacts, setArtifacts] = useState<Map<string, ArtifactSummary>>(
    () => new Map(),
  );
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
      // Published pages paint from the retained list first, so a Thread that
      // has a report says so before the network answers, and offline.
      setArtifacts(artifactsByThread(readCachedArtifacts()));

      // Only ask the server about Threads whose answer can still change: the
      // one being read, and any still working. A settled Thread's Enrichments
      // are immutable, so refetching the whole corpus every sync cycle bought
      // nothing and cost a request per Thread every few seconds.
      const changeable = (view: ThreadListView): boolean => {
        if (view.thread.id === selectedThreadId) return true;
        if (view.enrichments.length === 0) return true;
        return view.captures.some((capture) => capture.status !== "complete");
      };
      const refreshed = await Promise.all(
        localViews.map(async (view) =>
          changeable(view)
            ? {
                ...view,
                enrichments: await loadThreadEnrichments(view.thread.id),
              }
            : view,
        ),
      );
      if (generation !== loadGeneration.current) return;
      setThreads(refreshed);

      const published = await loadArtifacts();
      if (generation !== loadGeneration.current) return;
      setArtifacts(artifactsByThread(published));
    } catch {
      if (generation !== loadGeneration.current) return;
      setError("Could not load Threads");
      setLoaded(true);
    }
  }, [selectedThreadId]);

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

  const onProjectCreated = useCallback((project: Project) => {
    setProjects((current) =>
      current.some((item) => item.id === project.id)
        ? current
        : [...current, project],
    );
  }, []);

  /** Newest day first; Threads inside a day keep the store's own order. */
  const byDay = useMemo(() => {
    const groups = new Map<string, ThreadListView[]>();
    for (const view of threads) {
      const list = groups.get(view.dayKey) ?? [];
      list.push(view);
      groups.set(view.dayKey, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [threads]);

  /** Search cuts across every day — the one way past the day-by-day frame. */
  const query = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return [];
    return threads.filter((view) => {
      const haystack = [
        view.thread.title,
        ...view.captures.map((capture) => capture.text),
        ...(view.thread.topics ?? []),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [threads, query]);

  const dayThreads = useMemo(
    () =>
      selectedDayKey
        ? threads.filter((view) => view.dayKey === selectedDayKey)
        : [],
    [threads, selectedDayKey],
  );

  /** Unfiled work first: the reason to sit down is what is still open. */
  const orderedDayThreads = useMemo(
    () =>
      [...dayThreads].sort((a, b) => {
        const aFiled = a.thread.reviewedAt ? 1 : 0;
        const bFiled = b.thread.reviewedAt ? 1 : 0;
        return aFiled - bFiled;
      }),
    [dayThreads],
  );

  /** Threads in display order (day by day) for swipe stepping. */
  const orderedThreadIds = useMemo(
    () =>
      byDay.flatMap(([, views]) => views.map((view) => view.thread.id)),
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

  /**
   * Filing a Thread finishes it: move to the next unfiled Thread from the
   * same day, and when the day is clear, back to the day itself.
   */
  const onReviewedChange = useCallback(
    (reviewed: boolean) => {
      void load();
      if (!reviewed) return;
      const current = threads.find(
        (view) => view.thread.id === selectedThreadId,
      );
      const dayKey = current?.dayKey ?? calendarDayKey();
      const next = threads.find(
        (view) =>
          view.dayKey === dayKey &&
          !view.thread.reviewedAt &&
          view.thread.id !== selectedThreadId,
      );
      router.push(next ? `/threads/${next.thread.id}` : `/days/${dayKey}`);
    },
    [load, router, threads, selectedThreadId],
  );

  const hasSelection = Boolean(selectedThreadId || selectedDayKey);

  // Phone panes share the window scroll: remember where the walker was in
  // the day list and put them back there after closing a day or Thread
  // (the list is display:none while a selection is open).
  const listScrollY = useRef(0);
  useEffect(() => {
    if (hasSelection) return;
    const onScroll = () => {
      listScrollY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasSelection]);
  useEffect(() => {
    if (hasSelection) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, listScrollY.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasSelection]);

  return (
    <main
      className={
        hasSelection
          ? "desk-workspace has-selection"
          : "desk-workspace"
      }
    >
      <SyncRuntime />
      <div className="desk-list-pane">
        <header className="desk-header">
          <div>
            <p className="eyebrow">Sitting down afterwards</p>
            <h1>Days</h1>
            <p>
              One day at a time: read what came back, answer what was asked,
              file what is done.
            </p>
          </div>
          <div className="desk-header-side">
            <SyncStatusPill />
            <Link className="interview-entry" href="/interview">
              Interview
            </Link>
          </div>
        </header>

        <input
          type="search"
          className="threads-search"
          placeholder="Search all Threads…"
          aria-label="Search all Threads"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {error ? (
          <p className="capture-error" role="alert">
            {error}
          </p>
        ) : null}

        {query ? (
          searchResults.length > 0 ? (
            <ul className="threads-day-list" aria-label="Search results">
              {searchResults.map((view) => (
                <ThreadRow
                  key={view.thread.id}
                  view={view}
                  showDay
                  selected={view.thread.id === selectedThreadId}
                  projects={projects}
                  artifact={artifacts.get(view.thread.id)}
                  onFiled={() => void load()}
                  onProjectCreated={onProjectCreated}
                />
              ))}
            </ul>
          ) : (
            <p className="trail-thread-empty">No Threads match that search.</p>
          )
        ) : (
          <>
            {loaded && byDay.length === 0 && !error ? (
              <p className="trail-thread-empty">
                No walks yet. Add a Capture from the Capture tab — it starts its
                own Thread, and the day it lands on shows up here.
              </p>
            ) : null}

            <ul className="desk-days" aria-label="Days">
              {byDay.map(([dayKey, views]) => {
                const sheet = summarizeDay({
                  dayKey,
                  threads: views.map((view) => view.thread),
                  captures: views.flatMap((view) => view.captures),
                });
                const waiting = sheet.threadCount - sheet.reviewed;
                const stuck = views.some((view) =>
                  view.captures.some(
                    (capture) => capture.status === "needs_attention",
                  ),
                );
                const state =
                  sheet.needsWord.length > 0
                    ? `${sheet.needsWord.length} need${
                        sheet.needsWord.length === 1 ? "s" : ""
                      } a word`
                    : waiting > 0
                      ? `${waiting} waiting`
                      : "All filed";
                return (
                  <li
                    key={dayKey}
                    className={[
                      "desk-day",
                      selectedDayKey === dayKey ? "desk-day-selected" : "",
                      stuck || sheet.needsWord.length > 0
                        ? "desk-day-attention"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Link
                      className="desk-day-open"
                      href={`/days/${dayKey}`}
                      data-testid={`open-day-${dayKey}`}
                    >
                      <span className="desk-day-title">{dayTitle(dayKey)}</span>
                      <span className="desk-day-tally">
                        {sheet.threadCount}{" "}
                        {sheet.threadCount === 1 ? "Thread" : "Threads"} ·{" "}
                        {sheet.captureCount}{" "}
                        {sheet.captureCount === 1 ? "Capture" : "Captures"}
                        {sheet.photoCount > 0
                          ? ` · ${sheet.photoCount} media`
                          : ""}
                      </span>
                      <span
                        className={
                          waiting > 0 || sheet.needsWord.length > 0
                            ? "desk-day-state desk-day-state-open"
                            : "desk-day-state"
                        }
                      >
                        {state}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div
        className="desk-detail-pane"
        onTouchStart={onDetailTouchStart}
        onTouchEnd={onDetailTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
        {/* Route pages render null; the workspace owns the detail pane. */}
        {children}
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
            onClose={() => router.push("/days")}
          >
            {orderedDayThreads.length > 0 ? (
              <section className="day-threads" aria-label="Threads from this day">
                <ul className="threads-day-list">
                  {orderedDayThreads.map((view) => (
                    <ThreadRow
                      key={view.thread.id}
                      view={view}
                      selected={false}
                      projects={projects}
                      artifact={artifacts.get(view.thread.id)}
                      onFiled={() => void load()}
                      onProjectCreated={onProjectCreated}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </DailyDigestPanel>
        ) : (
          <div className="desk-detail-empty">
            <p>Open a day to read what came back and file what is done.</p>
          </div>
        )}
      </div>

      <AppNav />
    </main>
  );
}
