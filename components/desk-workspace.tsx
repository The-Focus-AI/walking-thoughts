"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ArtifactLightbox, useDeskViewport } from "@/components/artifact-lightbox";
import {
  AttachmentThumb,
  MediaLightbox,
} from "@/components/media-lightbox";
import { useLinkFallback } from "@/components/use-link-fallback";
import { DailyDigestPanel } from "@/components/daily-digest-panel";
import { DeskRail, LensControl } from "@/components/desk-rail";
import {
  facetCounts,
  facetHref,
  hasFacets,
  readFacets,
  readLens,
  matchesFacets,
  stackByLens,
  toggleFacet,
  type FacetGroup,
  type FacetSelection,
  type FacetThread,
} from "@/lib/desk/facets";
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
  dayKeyForThread,
  formatDayShort,
} from "@/lib/local-capture/calendar-day";
import { getCaptureStore } from "@/lib/local-capture/store";
import {
  KIND_LABELS,
  type LocalAttachment,
  type LocalCapture,
  type LocalThread,
} from "@/lib/local-capture/types";
import { readAvailableLocation } from "@/lib/local-capture/location";
import { getReviewTransport } from "@/lib/sync/review-client";
import type { Project } from "@/lib/sync/types";
import { SYNC_CYCLE_EVENT, runSyncCycle } from "@/lib/sync/cycle";
import { syncRollup } from "@/lib/sync/rollup";

type ThreadListView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
  dayKey: string;
};

/**
 * The phone's chips, written as selections in the desk's filter model. The
 * rail and the chips are two renderings of one thing: a chip sets the same
 * URL param the desktop row would, so a link travels between them.
 */
const CHIPS: Array<{
  key: string;
  label: string;
  group: FacetGroup;
  value: string;
}> = [
  { key: "word", label: "Needs a word", group: "attention", value: "word" },
  {
    key: "attention",
    label: "Needs attention",
    group: "attention",
    value: "stuck",
  },
  { key: "reports", label: "Has a report", group: "reports", value: "full" },
  { key: "media", label: "Has media", group: "media", value: "any" },
];

/** The facts the facets ask about, read off a Thread the desk already holds. */
function toFacetThread(
  view: ThreadListView,
  artifacts: ReadonlyMap<string, ArtifactSummary>,
): FacetThread {
  const mediaKinds = [
    ...new Set(
      view.captures.flatMap((capture) =>
        capture.attachments.map((attachment) => attachment.kind),
      ),
    ),
  ];
  return {
    id: view.thread.id,
    dayKey: view.dayKey,
    kind: view.thread.kind ?? null,
    reviewed: Boolean(view.thread.reviewedAt),
    researchVerdict: view.thread.researchVerdict ?? null,
    needsWord: Boolean(view.thread.ask),
    needsAttention: view.captures.some(
      (capture) => capture.status === "needs_attention",
    ),
    projectId: view.thread.projectId ?? null,
    projectName: view.thread.projectName ?? null,
    mediaKinds,
    hasReport: artifacts.has(view.thread.id),
    hasEnrichment: view.enrichments.length > 0,
  };
}

/**
 * The chip row. Each is a link carrying the shared facet params, so the pill
 * and the day sheet can deep-link straight into a working set, and Back
 * undoes it. A way of working with nothing in it stays off the row.
 */
function FilterChips({
  base,
  selection,
  counts,
  onNavigate,
}: {
  base: string;
  selection: FacetSelection;
  counts: Record<FacetGroup, Record<string, number>>;
  onNavigate: (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => void;
}) {
  return (
    <nav className="desk-filters" aria-label="Filter Threads">
      <Link
        className={
          hasFacets(selection) ? "desk-filter" : "desk-filter desk-filter-active"
        }
        href={facetHref(base, {})}
        aria-current={hasFacets(selection) ? undefined : "true"}
        data-testid="desk-filter-all"
        onClick={(event) => onNavigate(event, facetHref(base, {}))}
      >
        All
      </Link>
      {CHIPS.map((chip) => {
        const selected = selection[chip.group] === chip.value;
        const count = counts[chip.group]?.[chip.value] ?? 0;
        if (!count && !selected) return null;
        const href = facetHref(
          base,
          toggleFacet(selection, chip.group, chip.value),
        );
        return (
          <Link
            key={chip.key}
            className={
              selected ? "desk-filter desk-filter-active" : "desk-filter"
            }
            href={href}
            aria-current={selected ? "true" : undefined}
            data-testid={`desk-filter-${chip.key}`}
            onClick={(event) => onNavigate(event, href)}
          >
            {chip.label}
            {count ? ` · ${count}` : ""}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The Enrichment met a name it could not place and asked. The question and
 * its answer box live on the row itself — answering must not depend on
 * opening the chat.
 */
function AskAnswer({
  threadId,
  ask,
  onAnswered,
}: {
  threadId: string;
  ask: string;
  onAnswered: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const store = getCaptureStore();
      await store.commit(text, readAvailableLocation(), {
        destination: { type: "thread", threadId },
      });
      setSent(true);
      setDraft("");
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        runSyncCycle({ store }).catch(() => undefined);
      }
      onAnswered();
    } catch {
      setError("Could not save the answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thread-ask-panel" data-testid="thread-ask-panel">
      <p className="thread-ask-question">{ask}</p>
      {sent ? (
        <p className="thread-ask-sent" role="status">
          Answer saved — the next Enrichment reads it
        </p>
      ) : (
        <form
          className="thread-ask-form"
          onSubmit={(event) => {
            event.preventDefault();
            void answer();
          }}
        >
          <input
            className="thread-ask-input"
            value={draft}
            placeholder="Answer with a word or two…"
            aria-label={`Answer: ${ask}`}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className="thread-ask-send"
            disabled={busy || !draft.trim()}
          >
            Answer
          </button>
        </form>
      )}
      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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

function dayTitle(dayKey: string): string {
  return dayKey === calendarDayKey() ? "Today" : formatDayShort(dayKey);
}

/** One Thread as a dense desk row: what it says, how it is filed, where it is. */
function ThreadRow({
  view,
  selected,
  projects,
  showDay,
  expandable,
  artifact,
  onOpenReport,
  onOpenMedia,
  onFiled,
  onProjectCreated,
}: {
  view: ThreadListView;
  selected: boolean;
  projects: Project[];
  showDay?: boolean;
  /** At the desk a row opens in place instead of sending the walker away. */
  expandable?: boolean;
  /** The published page for this Thread, when its report earned one. */
  artifact?: ArtifactSummary;
  /** Set at the desk, where the report opens in place instead of a new tab. */
  onOpenReport?: (artifact: ArtifactSummary) => void;
  /** Set at the desk, where a photo or clip opens in place over the day. */
  onOpenMedia?: (attachment: LocalAttachment) => void;
  onFiled: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const onLinkClick = useLinkFallback();
  const [expanded, setExpanded] = useState(false);
  const status = threadStatus(view.captures);
  const words = view.captures[0]?.text ?? "";
  const mediaCount = view.captures.reduce(
    (count, capture) => count + capture.attachments.length,
    0,
  );
  const lookable = view.captures
    .flatMap((capture) => capture.attachments)
    .filter(
      (attachment) =>
        attachment.kind === "image" || attachment.kind === "video",
    );

  return (
    <li
      className={[
        "thread-row",
        selected ? "thread-row-selected" : "",
        view.thread.reviewedAt ? "thread-row-filed" : "",
        // An unread report is the reason to sit down: the row takes the
        // Annotation's own mark — sky left rule over a sky tint — until it
        // is filed, and then reads as an ordinary row that has a page.
        artifact && !view.thread.reviewedAt ? "thread-row-report" : "",
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
        onClick={(event) => onLinkClick(event, `/threads/${view.thread.id}`)}
      >
        <span className="thread-row-title">{view.thread.title}</span>
        {words && words !== view.thread.title ? (
          <span className="thread-row-words">{words}</span>
        ) : null}
        {/* What the report says it is about, so the walker knows whether to
            open it without opening it. */}
        {artifact?.standfirst ? (
          <span
            className="thread-row-standfirst"
            data-testid="thread-standfirst"
          >
            {artifact.standfirst}
          </span>
        ) : null}
        <span className="thread-row-meta">
          {showDay ? `${dayTitle(view.dayKey)} · ` : ""}
          {view.enrichments.length}{" "}
          {view.enrichments.length === 1 ? "Enrichment" : "Enrichments"}
          {view.captures.length > 1 ? ` · ${view.captures.length} Captures` : ""}
          {mediaCount > 0 ? ` · ${mediaCount} media` : ""}
        </span>
      </Link>
      {view.thread.ask ? (
        <AskAnswer
          threadId={view.thread.id}
          ask={view.thread.ask}
          onAnswered={onFiled}
        />
      ) : null}
      {onOpenMedia && lookable.length > 0 ? (
        <div className="thread-row-thumbs" aria-label="Media from this Thread">
          {lookable.slice(0, 4).map((attachment) => (
            <AttachmentThumb
              key={attachment.id}
              attachment={attachment}
              onOpen={() => onOpenMedia(attachment)}
            />
          ))}
        </div>
      ) : null}
      <div className="thread-row-side">
        {artifact ? (
          <a
            className={
              view.thread.reviewedAt
                ? "thread-row-artifact"
                : "thread-row-artifact unread"
            }
            href={artifactHref(artifact.id)}
            target={onOpenReport ? undefined : "_blank"}
            rel="noreferrer"
            data-testid="thread-artifact-link"
            title={artifact.standfirst ?? "Read the published report"}
            onClick={(event) => {
              // At the desk the report opens over the day; on the phone the
              // href stands and the page opens on its own.
              if (!onOpenReport || event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              onOpenReport(artifact);
            }}
          >
            Read report
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
        {expandable ? (
          <button
            type="button"
            className="thread-row-expand"
            data-testid={`expand-thread-${view.thread.id}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Close" : "Open"}
          </button>
        ) : null}
        {expandable && expanded ? null : (
          <ThreadFiling
            thread={view.thread}
            projects={projects}
            onFiled={onFiled}
            onProjectCreated={onProjectCreated}
          />
        )}
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
      {/* Opened in place: the words as they were said, what the Enrichment
          made of them, everything the Thread carries, and the filing — so a
          row can be settled without leaving the queue. */}
      {expandable && expanded ? (
        <div
          className="thread-row-detail"
          data-testid={`thread-detail-${view.thread.id}`}
        >
          <div className="thread-row-detail-words">
            {view.captures.map((capture) => (
              <p key={capture.id}>{capture.text}</p>
            ))}
          </div>
          {view.enrichments.length > 0 ? (
            <p
              className="thread-row-detail-enrichment"
              data-testid="thread-detail-enrichment"
            >
              {view.enrichments[view.enrichments.length - 1].text}
            </p>
          ) : (
            <p className="thread-row-detail-enrichment">
              No Enrichment yet.
            </p>
          )}
          {lookable.length > 0 ? (
            <div
              className="thread-row-thumbs"
              aria-label="Media from this Thread"
            >
              {lookable.map((attachment) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  onOpen={() => onOpenMedia?.(attachment)}
                />
              ))}
            </div>
          ) : null}
          <ThreadFiling
            thread={view.thread}
            projects={projects}
            defaultOpen
            onFiled={onFiled}
            onProjectCreated={onProjectCreated}
          />
        </div>
      ) : null}
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
  const searchParams = useSearchParams();
  /**
   * One filter model for both surfaces, carried in the URL. Links made
   * before the rail existed still say `?f=`; they translate on read and the
   * rail writes the newer params from then on.
   */
  const facets = useMemo(
    () => readFacets(searchParams ?? undefined),
    [searchParams],
  );
  const lens = readLens(searchParams ?? undefined);
  const filtering = hasFacets(facets);

  const [threads, setThreads] = useState<ThreadListView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [artifacts, setArtifacts] = useState<Map<string, ArtifactSummary>>(
    () => new Map(),
  );
  /** The report being read over the day; desk only. */
  const [openReport, setOpenReport] = useState<ArtifactSummary | null>(null);
  const [openMedia, setOpenMedia] = useState<LocalAttachment | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const atTheDesk = useDeskViewport();
  const onLinkClick = useLinkFallback();
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

      // One request for the whole desk, and independent of the per-Thread
      // Enrichment refresh below — which Threads have a report waiting is
      // the first thing the day needs, and must not queue behind a slow or
      // hanging Enrichment fetch.
      void loadArtifacts().then((published) => {
        if (generation !== loadGeneration.current) return;
        setArtifacts(artifactsByThread(published));
      });

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

  /** Which Threads have a published page, for the day sheets to count. */
  const reportThreadIds = useMemo(
    () => new Set(artifacts.keys()),
    [artifacts],
  );

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

  /**
   * The day the walker is inside — opened directly, or the day of the
   * Thread being read. It is what the sidebar shows Threads for.
   */
  const activeDayKey = useMemo(() => {
    if (selectedDayKey) return selectedDayKey;
    if (!selectedThreadId) return null;
    return (
      threads.find((view) => view.thread.id === selectedThreadId)?.dayKey ??
      null
    );
  }, [selectedDayKey, selectedThreadId, threads]);

  const dayThreads = useMemo(
    () =>
      activeDayKey
        ? threads.filter((view) => view.dayKey === activeDayKey)
        : [],
    [threads, activeDayKey],
  );

  /**
   * Unfiled work first — the reason to sit down is what is still open — and
   * within that, the Threads with a report waiting. Those are the ones the
   * day actually left to read; the rest are glanced at and filed.
   */
  const orderedDayThreads = useMemo(
    () =>
      [...dayThreads].sort((a, b) => {
        const aFiled = a.thread.reviewedAt ? 1 : 0;
        const bFiled = b.thread.reviewedAt ? 1 : 0;
        if (aFiled !== bFiled) return aFiled - bFiled;
        const aRead = artifacts.has(a.thread.id) ? 0 : 1;
        const bRead = artifacts.has(b.thread.id) ? 0 : 1;
        return aRead - bRead;
      }),
    [dayThreads, artifacts],
  );

  /**
   * What the facets are asked about. Inside a day the scope is that day —
   * the rail then says what this day holds; outside it, the whole pile.
   */
  const scopeViews = useMemo(
    () =>
      activeDayKey
        ? orderedDayThreads
        : byDay.flatMap(([, views]) => views),
    [activeDayKey, orderedDayThreads, byDay],
  );

  const facetThreads = useMemo(
    () => scopeViews.map((view) => toFacetThread(view, artifacts)),
    [scopeViews, artifacts],
  );

  const counts = useMemo(
    () => facetCounts(facetThreads, facets, projects),
    [facetThreads, facets, projects],
  );

  /** The Threads the facets let through, in the scope's own order. */
  const visibleViews = useMemo(() => {
    if (!filtering) return scopeViews;
    const passing = new Set(
      facetThreads
        .filter((thread) => matchesFacets(thread, facets))
        .map((thread) => thread.id),
    );
    return scopeViews.filter((view) => passing.has(view.thread.id));
  }, [scopeViews, facetThreads, facets, filtering]);

  /** The Lens re-stacks exactly that set; it never changes its membership. */
  const stacks = useMemo(() => {
    const byId = new Map(visibleViews.map((view) => [view.thread.id, view]));
    return stackByLens(
      facetThreads.filter((thread) => byId.has(thread.id)),
      lens,
    ).map((stack) => ({
      key: stack.key,
      title: lens === "days" ? dayTitle(stack.key) : stack.title,
      /** Days stay openable from their heading; other stacks are groupings. */
      href: lens === "days" ? `/days/${stack.key}` : null,
      views: stack.threadIds
        .map((id) => byId.get(id))
        .filter((view): view is ThreadListView => Boolean(view)),
    }));
  }, [visibleViews, facetThreads, lens]);

  /** Where the filter chips live right now, for their hrefs. */
  const basePath = selectedThreadId
    ? `/threads/${selectedThreadId}`
    : selectedDayKey
      ? `/days/${selectedDayKey}`
      : "/days";

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

  /** "N need attention", answered: one explicit retry of everything stuck. */
  async function retryAttention() {
    if (retryBusy) return;
    setRetryBusy(true);
    try {
      await runSyncCycle({ store: getCaptureStore(), retryFailed: true });
      await load();
    } catch {
      // Row chips keep saying what is still stuck.
    } finally {
      setRetryBusy(false);
    }
  }

  const hasSelection = Boolean(selectedThreadId || selectedDayKey);

  /** "N need attention" is answered from wherever it is asked. */
  const retrySync =
    facets.attention === "stuck" ? (
      <button
        type="button"
        className="capture-retry"
        onClick={() => void retryAttention()}
        disabled={retryBusy}
      >
        {retryBusy ? "Retrying…" : "Retry sync"}
      </button>
    ) : null;

  /**
   * The Days Lens with nothing narrowed is the day list itself — the shape
   * of the whole pile. Narrow it, or change the Lens, and the days open
   * into the Threads they hold.
   */
  const dayCards = (
    <ul className="desk-days" aria-label="Days">
      {byDay.map(([dayKey, views]) => {
        const sheet = summarizeDay({
          dayKey,
          threads: views.map((view) => view.thread),
          captures: views.flatMap((view) => view.captures),
          threadsWithReports: reportThreadIds,
        });
        const waiting = sheet.threadCount - sheet.reviewed;
        const stuck = views.some((view) =>
          view.captures.some((capture) => capture.status === "needs_attention"),
        );
        // A day says the most specific true thing about itself: a Thread
        // stuck on a question first, then reports waiting to be read, then
        // work merely unfiled.
        const state =
          sheet.needsWord.length > 0
            ? `${sheet.needsWord.length} need${
                sheet.needsWord.length === 1 ? "s" : ""
              } a word`
            : sheet.toRead.length > 0
              ? `${sheet.toRead.length} report${
                  sheet.toRead.length === 1 ? "" : "s"
                } to read`
              : waiting > 0
                ? `${waiting} waiting`
                : "All filed";
        return (
          <li
            key={dayKey}
            className={[
              "desk-day",
              selectedDayKey === dayKey ? "desk-day-selected" : "",
              stuck || sheet.needsWord.length > 0 ? "desk-day-attention" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Link
              className="desk-day-open"
              href={`/days/${dayKey}`}
              data-testid={`open-day-${dayKey}`}
              onClick={(event) => onLinkClick(event, `/days/${dayKey}`)}
            >
              <span className="desk-day-title">{dayTitle(dayKey)}</span>
              <span className="desk-day-tally">
                {sheet.threadCount}{" "}
                {sheet.threadCount === 1 ? "Thread" : "Threads"} ·{" "}
                {sheet.captureCount}{" "}
                {sheet.captureCount === 1 ? "Capture" : "Captures"}
                {sheet.photoCount > 0 ? ` · ${sheet.photoCount} media` : ""}
              </span>
              <span
                className={[
                  "desk-day-state",
                  waiting > 0 || sheet.needsWord.length > 0
                    ? "desk-day-state-open"
                    : "",
                  // A day with reading waiting says so in the machine's sky,
                  // the same voice as the reports.
                  sheet.needsWord.length === 0 && sheet.toRead.length > 0
                    ? "desk-day-state-reports"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {state}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

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
                  onOpenReport={atTheDesk ? setOpenReport : undefined}
                  onOpenMedia={atTheDesk ? setOpenMedia : undefined}
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

            {/* At the desk the rail is always in reach: it says what the
                pile holds and narrows it, and the Lens re-stacks whatever
                it lets through. Inside a day, both speak for that day. */}
            {atTheDesk ? (
              <div className="desk-browse">
                <DeskRail
                  base={basePath}
                  selection={facets}
                  lens={lens}
                  counts={counts}
                  projects={projects}
                />
                <div className="desk-browse-main">
                  {activeDayKey ? (
                    <nav
                      className="desk-sidebar-day"
                      aria-label="This day's Threads"
                    >
                      <Link
                        className="desk-sidebar-back"
                        href="/days"
                        onClick={(event) => onLinkClick(event, "/days")}
                      >
                        ← Days
                      </Link>
                      <Link
                        className="desk-sidebar-day-title"
                        data-testid="desk-sidebar-day"
                        href={`/days/${activeDayKey}`}
                        onClick={(event) =>
                          onLinkClick(event, `/days/${activeDayKey}`)
                        }
                      >
                        {dayTitle(activeDayKey)}
                      </Link>
                    </nav>
                  ) : null}
                  <LensControl
                    base={basePath}
                    selection={facets}
                    lens={lens}
                  />
                  {retrySync}
                  {!activeDayKey && lens === "days" && !filtering ? (
                    dayCards
                  ) : (
                    <div className="desk-stacks">
                      {stacks.map((stack) => (
                        <section className="desk-stack" key={stack.key}>
                          {/* Inside a day under the Days Lens the sidebar
                              already names it; saying it twice is noise. */}
                          {activeDayKey && lens === "days" ? null : (
                          <h2 className="desk-stack-title">
                            {stack.href ? (
                              <Link
                                href={stack.href}
                                onClick={(event) =>
                                  onLinkClick(event, stack.href!)
                                }
                              >
                                {stack.title}
                              </Link>
                            ) : (
                              stack.title
                            )}
                            <span className="desk-stack-count">
                              {stack.views.length}
                            </span>
                          </h2>
                          )}
                          <ul
                            className="threads-day-list"
                            aria-label={`Threads: ${stack.title}`}
                          >
                            {stack.views.map((view) => (
                              <ThreadRow
                                key={view.thread.id}
                                view={view}
                                expandable
                                selected={
                                  view.thread.id === selectedThreadId
                                }
                                projects={projects}
                                artifact={artifacts.get(view.thread.id)}
                                onOpenReport={setOpenReport}
                                onOpenMedia={setOpenMedia}
                                onFiled={() => void load()}
                                onProjectCreated={onProjectCreated}
                              />
                            ))}
                          </ul>
                        </section>
                      ))}
                      {stacks.length === 0 ? (
                        <p className="trail-thread-empty">
                          Nothing matches that filter right now.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <FilterChips
                  base={basePath}
                  selection={facets}
                  counts={counts}
                  onNavigate={onLinkClick}
                />
                {retrySync}
                {filtering ? (
                  <>
                    <ul
                      className="threads-day-list"
                      aria-label="Filtered Threads"
                    >
                      {visibleViews.map((view) => (
                        <ThreadRow
                          key={view.thread.id}
                          view={view}
                          showDay
                          selected={false}
                          projects={projects}
                          artifact={artifacts.get(view.thread.id)}
                          onFiled={() => void load()}
                          onProjectCreated={onProjectCreated}
                        />
                      ))}
                    </ul>
                    {visibleViews.length === 0 ? (
                      <p className="trail-thread-empty">
                        Nothing matches that filter right now.
                      </p>
                    ) : null}
                  </>
                ) : (
                  dayCards
                )}
              </>
            )}
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
            {/* At the desk the sidebar already lists this day's Threads;
                repeating them under the digest would say it twice. */}
            {dayThreads.length > 0 && !atTheDesk ? (
              <section className="day-threads" aria-label="Threads from this day">
                <FilterChips
                  base={basePath}
                  selection={facets}
                  counts={counts}
                  onNavigate={onLinkClick}
                />
                {retrySync}
                {filtering && visibleViews.length === 0 ? (
                  <p className="trail-thread-empty">
                    Nothing in this day matches that filter.
                  </p>
                ) : null}
                <ul className="threads-day-list">
                  {visibleViews.map((view) => (
                    <ThreadRow
                      key={view.thread.id}
                      view={view}
                      selected={false}
                      projects={projects}
                      artifact={artifacts.get(view.thread.id)}
                      onOpenReport={atTheDesk ? setOpenReport : undefined}
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

      {openReport ? (
        <ArtifactLightbox
          artifact={openReport}
          onClose={() => setOpenReport(null)}
        />
      ) : null}

      {openMedia ? (
        <MediaLightbox
          attachment={openMedia}
          onClose={() => setOpenMedia(null)}
        />
      ) : null}

      <AppNav />
    </main>
  );
}
