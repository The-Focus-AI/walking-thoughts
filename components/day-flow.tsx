"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { AttachmentThumb } from "@/components/media-lightbox";
import { fileThread, unfileThread } from "@/lib/desk/file-thread";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  KIND_LABELS,
  ROUTE_LABELS,
  routeForKind,
  THREAD_ROUTES,
  type LocalAttachment,
  type LocalCapture,
  type LocalThread,
  type ThreadRoute,
  captureWords,
} from "@/lib/local-capture/types";
import type { Project } from "@/lib/sync/types";

/** One of the day's Threads as the flow reads it. */
export type DayFlowView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
};

const KEY_TO_ROUTE: Record<string, ThreadRoute> = {
  s: "spec",
  t: "todo",
  n: "journal",
  p: "timeline",
  x: "drop",
};

const ROUTE_KEY: Record<ThreadRoute, string> = {
  spec: "s",
  todo: "t",
  journal: "n",
  timeline: "p",
  drop: "x",
};

/** What settling each Route does in D1, said on the card before it happens. */
const ROUTE_HANDOFF: Record<ThreadRoute, string> = {
  spec: "records it for an issue in the Project's repo",
  todo: "records it for the task list",
  journal: "files it for the notebook and keeps its research",
  timeline: "records the frame for the same-spot timeline",
  drop: "lets it go — the research is dismissed and its page retracts",
};

/**
 * The receipts say plainly which handoffs are live and which are
 * recorded-only until the destination slices land (docs/desk.md, D1).
 */
const ROUTE_RECEIPT: Record<ThreadRoute, string> = {
  spec: "Recorded — issue drafting in the Project's repo lands with a later slice.",
  todo: "Recorded — the task-list surface lands with a later slice.",
  journal:
    "Research kept — its page stays. Notebook sections land with a later slice.",
  timeline: "Recorded — the same-spot strip lands with a later slice.",
  drop: "Live — the research is dismissed and its Artifact page is retracted.",
};

const STEPS = [
  { n: 1, label: "What came home" },
  { n: 2, label: "Route each one" },
  { n: 3, label: "What happened" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName ?? "";
  return (
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    Boolean(element?.isContentEditable)
  );
}

/** Enter on a focused button or link is that control's press, never ours. */
function isActivationTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName ?? "";
  return tag === "BUTTON" || tag === "A";
}

/** The Enrichment's proposal for a Thread the walker has not routed yet. */
function proposalFor(thread: LocalThread): ThreadRoute {
  return thread.route ?? routeForKind(thread.kind);
}

/**
 * The default door: the Day flow (docs/desk.md). A Day with unrouted Threads
 * opens on an arrival summary; Start routing deals them one at a time —
 * `⏎` accepts the proposed Route, one key redirects, the full report is
 * readable on the card — and settling a card files it right then (route +
 * Reviewed in one write, no commit gate). The closing screen is a receipt
 * with per-line undo, which returns the Thread to the deck.
 */
export function DayFlow({
  views,
  loaded,
  projects,
  onFiled,
  onOpenMedia,
}: {
  views: DayFlowView[];
  /** The store has answered; before that the flow says nothing. */
  loaded: boolean;
  projects: Project[];
  /** The desk reloads its pile after every settle and undo. */
  onFiled: () => void;
  /** A photo on the card opens in place, over the day. */
  onOpenMedia?: (attachment: LocalAttachment) => void;
}) {
  const [started, setStarted] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /**
   * Settled this sitting, before the reload catches up — read through a ref
   * so a fast burst of keys can never settle the same card twice.
   */
  const settledRef = useRef<Set<string>>(new Set());
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Which Route each card settled to, until the store's reload confirms it. */
  const [sessionRoutes, setSessionRoutes] = useState<
    Record<string, ThreadRoute>
  >({});
  /** The Project the walker picked per card, for Spec routes. */
  const [projectChoice, setProjectChoice] = useState<
    Record<string, string | null>
  >({});

  /** Still in the New pile: the deck's source. */
  const unrouted = useMemo(
    () => views.filter((view) => !view.thread.reviewedAt),
    [views],
  );
  const deck = useMemo(
    () => unrouted.filter((view) => !settledIds.has(view.thread.id)),
    [unrouted, settledIds],
  );
  /** Everything the day has routed, for the receipts. */
  const routed = useMemo(
    () =>
      views.filter(
        (view) => view.thread.route || settledIds.has(view.thread.id),
      ),
    [views, settledIds],
  );

  const markSettled = useCallback((threadId: string): boolean => {
    if (settledRef.current.has(threadId)) return false;
    settledRef.current.add(threadId);
    setSettledIds(new Set(settledRef.current));
    return true;
  }, []);

  const markUnsettled = useCallback((threadId: string) => {
    settledRef.current.delete(threadId);
    setSettledIds(new Set(settledRef.current));
  }, []);

  /** Settle one card: the write is route + Reviewed together, no gate. */
  const settle = useCallback(
    async (view: DayFlowView, route: ThreadRoute) => {
      const threadId = view.thread.id;
      if (!markSettled(threadId)) return;
      setSessionRoutes((prev) => ({ ...prev, [threadId]: route }));
      setError(null);
      const projectId =
        route === "spec"
          ? (projectChoice[threadId] ?? view.thread.projectId ?? null)
          : undefined;
      const filing =
        projectId === undefined
          ? { route }
          : {
              route,
              projectId,
              projectName:
                projects.find((project) => project.id === projectId)?.name ??
                null,
            };
      if (!(await fileThread(threadId, filing))) {
        // Nothing was recorded: the card comes straight back to the deck.
        markUnsettled(threadId);
        setError("Routing needs a connection.");
        return;
      }
      onFiled();
    },
    [markSettled, markUnsettled, onFiled, projectChoice, projects],
  );

  /** Undo from the receipts: back to the deck, nothing recorded. */
  const undo = useCallback(
    async (threadId: string) => {
      setError(null);
      if (!(await unfileThread(threadId))) {
        setError("Undo needs a connection.");
        return;
      }
      markUnsettled(threadId);
      setSessionRoutes((prev) => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
      onFiled();
    },
    [markUnsettled, onFiled],
  );

  const step = !started ? 1 : deck.length > 0 ? 2 : 3;

  if (!loaded) return null;
  // Nothing to route and nothing settled this sitting: the day is not a
  // flow moment, and the pane below already says everything.
  if (unrouted.length === 0 && settledIds.size === 0 && !started) return null;

  return (
    <section className="day-flow" data-testid="day-flow" aria-label="Day flow">
      <header className="day-flow-header">
        <nav className="day-flow-steps" aria-label="Flow steps">
          {STEPS.map((item) => (
            <span
              key={item.n}
              className={
                item.n === step
                  ? "day-flow-step active"
                  : item.n < step
                    ? "day-flow-step done"
                    : "day-flow-step"
              }
            >
              <b>{item.n}</b> {item.label}
            </span>
          ))}
        </nav>
        <p className="day-flow-count" data-testid="day-flow-count" role="status">
          <strong>{deck.length}</strong> to route
        </p>
      </header>
      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}
      {step === 1 ? (
        <Arrival unrouted={unrouted} onStart={() => setStarted(true)} />
      ) : step === 2 ? (
        <Deck
          deck={deck}
          // The sitting's own tally: settled cards leave `unrouted` once the
          // reload lands, so the denominator counts them explicitly or the
          // position would slide under the walker mid-deal.
          total={deck.length + settledIds.size}
          cursor={cursor}
          setCursor={setCursor}
          projects={projects}
          projectChoice={projectChoice}
          onPickProject={(threadId, projectId) =>
            setProjectChoice((prev) => ({ ...prev, [threadId]: projectId }))
          }
          onSettle={settle}
          onOpenMedia={onOpenMedia}
        />
      ) : (
        <Receipts routed={routed} sessionRoutes={sessionRoutes} onUndo={undo} />
      )}
    </section>
  );
}

/* --- Step 1 · What came home ---------------------------------------------- */

function Arrival({
  unrouted,
  onStart,
}: {
  unrouted: DayFlowView[];
  onStart: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || isActivationTarget(event.target)) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onStart();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="day-flow-arrival" data-testid="day-flow-arrival">
      <p className="day-flow-sub">
        {unrouted.length} {unrouted.length === 1 ? "Thread" : "Threads"} came
        home with a guess about where {unrouted.length === 1 ? "it" : "each"}{" "}
        should go. Routing makes it happen — accept the guess or redirect it,
        one at a time.
      </p>
      <div className="day-flow-lanes">
        {THREAD_ROUTES.map((route) => {
          const proposed = unrouted.filter(
            (view) => proposalFor(view.thread) === route,
          );
          if (proposed.length === 0) return null;
          return (
            <div
              key={route}
              className={`day-flow-lane day-flow-lane-${route}`}
              data-testid={`day-flow-lane-${route}`}
            >
              <h3>
                {ROUTE_LABELS[route]}
                <span className="day-flow-lane-count">{proposed.length}</span>
              </h3>
              <ul>
                {proposed.map((view) => (
                  <li key={view.thread.id}>
                    {view.thread.title}
                    {view.thread.ask ? (
                      <em className="day-flow-lane-word"> · needs a word</em>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="day-flow-start"
        data-testid="day-flow-start"
        onClick={onStart}
      >
        Start routing <kbd>⏎</kbd>
      </button>
    </div>
  );
}

/* --- Step 2 · Route each one ----------------------------------------------- */

function Deck({
  deck,
  total,
  cursor,
  setCursor,
  projects,
  projectChoice,
  onPickProject,
  onSettle,
  onOpenMedia,
}: {
  deck: DayFlowView[];
  total: number;
  cursor: number;
  setCursor: (updater: (prev: number) => number) => void;
  projects: Project[];
  projectChoice: Record<string, string | null>;
  onPickProject: (threadId: string, projectId: string | null) => void;
  onSettle: (view: DayFlowView, route: ThreadRoute) => Promise<void>;
  onOpenMedia?: (attachment: LocalAttachment) => void;
}) {
  // A skip only moves the cursor, so the card shown is the deck entry at the
  // cursor's position — settles shrink the deck and the next card takes the
  // same slot.
  const view = deck[cursor % deck.length];
  const thread = view.thread;
  const [reportOpen, setReportOpen] = useState(false);

  const proposal = proposalFor(thread);
  const report = view.enrichments[view.enrichments.length - 1] ?? null;
  const words = view.captures
    .map((capture) => captureWords(capture))
    .filter(Boolean);
  const media = view.captures.flatMap((capture) =>
    capture.attachments.filter(
      (attachment) =>
        attachment.kind === "image" || attachment.kind === "video",
    ),
  );

  const settleAnd = useCallback(
    (route: ThreadRoute) => {
      setReportOpen(false);
      void onSettle(view, route);
    },
    [onSettle, view],
  );

  const skip = useCallback(() => {
    setReportOpen(false);
    setCursor((prev) => prev + 1);
  }, [setCursor]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "Enter" && isActivationTarget(event.target)) return;
      const route =
        event.key === "Enter" ? proposal : KEY_TO_ROUTE[event.key];
      if (route) {
        // The deck owns these keys while it is dealing — the desk's own
        // row shortcuts must not also fire on the same press.
        event.preventDefault();
        event.stopPropagation();
        settleAnd(route);
      } else if (event.key === "j") {
        event.preventDefault();
        event.stopPropagation();
        skip();
      } else if (event.key === "r" && report) {
        event.preventDefault();
        event.stopPropagation();
        setReportOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [proposal, report, settleAnd, skip]);

  return (
    <div className="day-flow-deck">
      <p className="day-flow-position" data-testid="day-flow-position">
        Thread {total - deck.length + 1} of {total} ·{" "}
        <span className="day-flow-keys">
          <kbd>⏎</kbd> accept · <kbd>s</kbd> spec · <kbd>t</kbd> to-do ·{" "}
          <kbd>n</kbd> journal · <kbd>p</kbd> timeline · <kbd>x</kbd> drop ·{" "}
          <kbd>r</kbd> report · <kbd>j</kbd> skip
        </span>
      </p>
      <article
        className="day-flow-card"
        data-testid="day-flow-card"
        key={thread.id}
      >
        <div className="day-flow-card-meta">
          <span className="day-flow-card-title">{thread.title}</span>
          {thread.kind ? (
            <span className="thread-row-kind">{KIND_LABELS[thread.kind]}</span>
          ) : null}
        </div>
        {words.length > 0 ? (
          <blockquote className="day-flow-words">
            {words.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </blockquote>
        ) : (
          <p className="day-flow-words day-flow-words-empty">
            No words on this one.
          </p>
        )}
        {media.length > 0 && onOpenMedia ? (
          <div className="thread-row-thumbs" aria-label="Media from this Thread">
            {media.slice(0, 4).map((attachment) => (
              <AttachmentThumb
                key={attachment.id}
                attachment={attachment}
                onOpen={() => onOpenMedia(attachment)}
              />
            ))}
          </div>
        ) : null}
        {thread.ask ? (
          <p className="day-flow-needs-word">
            <strong>Needs a word:</strong> {thread.ask}
          </p>
        ) : null}
        {report ? (
          <div className="day-flow-report">
            <button
              type="button"
              className="day-flow-report-toggle"
              data-testid="day-flow-report-toggle"
              onClick={() => setReportOpen((open) => !open)}
            >
              {reportOpen ? "▾ Hide the report" : "▸ Read the report"}{" "}
              <kbd>r</kbd>
            </button>
            {reportOpen ? (
              <div
                className="day-flow-report-body enrichment-markdown"
                data-testid="day-flow-report"
              >
                <Markdown>{report.text}</Markdown>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="day-flow-no-report">No Enrichment yet.</p>
        )}

        <div className="day-flow-proposal">
          <p>
            The guess: <strong>{ROUTE_LABELS[proposal]}</strong>
            {proposal === "spec" ? (
              <>
                {" → "}
                <select
                  data-testid="day-flow-project"
                  aria-label="Project for this Spec"
                  value={projectChoice[thread.id] ?? thread.projectId ?? ""}
                  onChange={(event) =>
                    onPickProject(thread.id, event.target.value || null)
                  }
                >
                  <option value="">pick a Project…</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <span className="day-flow-handoff">
              {" "}
              — routing it {ROUTE_HANDOFF[proposal]}
            </span>
          </p>
          <div className="day-flow-actions">
            <button
              type="button"
              className="day-flow-accept"
              data-testid="day-flow-accept"
              onClick={() => settleAnd(proposal)}
            >
              Accept ⏎
            </button>
            {THREAD_ROUTES.filter((route) => route !== proposal).map(
              (route) => (
                <button
                  key={route}
                  type="button"
                  data-testid={`day-flow-route-${route}`}
                  onClick={() => settleAnd(route)}
                >
                  {ROUTE_LABELS[route]} <kbd>{ROUTE_KEY[route]}</kbd>
                </button>
              ),
            )}
            <button
              type="button"
              className="day-flow-skip"
              data-testid="day-flow-skip"
              onClick={skip}
            >
              Skip <kbd>j</kbd>
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

/* --- Step 3 · What happened (receipts) -------------------------------------- */

function Receipts({
  routed,
  sessionRoutes,
  onUndo,
}: {
  routed: DayFlowView[];
  sessionRoutes: Record<string, ThreadRoute>;
  onUndo: (threadId: string) => Promise<void>;
}) {
  return (
    <div className="day-flow-receipts" data-testid="day-flow-receipts">
      <p className="day-flow-sub">
        Done — everything went somewhere. Undo pulls a Thread back into the
        deck.
      </p>
      {THREAD_ROUTES.map((route) => {
        const settled = routed.filter(
          (view) =>
            (view.thread.route ?? sessionRoutes[view.thread.id]) === route,
        );
        if (settled.length === 0) return null;
        return (
          <section
            key={route}
            className={`day-flow-receipt day-flow-lane-${route}`}
            data-testid={`day-flow-receipt-${route}`}
          >
            <h3>
              {ROUTE_LABELS[route]}
              <span className="day-flow-lane-count">{settled.length}</span>
            </h3>
            <p className="day-flow-receipt-note">{ROUTE_RECEIPT[route]}</p>
            <ul>
              {settled.map((view) => (
                <li key={view.thread.id}>
                  <span className="day-flow-receipt-title">
                    {view.thread.title}
                    {route === "spec" && view.thread.projectName
                      ? ` · ${view.thread.projectName}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="day-flow-undo"
                    data-testid={`day-flow-undo-${view.thread.id}`}
                    onClick={() => void onUndo(view.thread.id)}
                  >
                    undo
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="day-flow-done">
        That&apos;s the day. Nothing left to press — the walk is filed.
      </p>
    </div>
  );
}
