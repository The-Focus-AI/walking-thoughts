"use client";

/**
 * PROTOTYPE — the day-routing flow, single design.
 * Three steps: ① What came home → ② Route each one → ③ What happened.
 * Routing a card DOES it (simulated): the to-do lands on the list, the
 * spec becomes a drafted issue, the journal page is filed. Step ③ is a
 * receipt, not a confirmation gate; undo pulls a Thread back.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAY,
  DESTINATION_HANDOFF,
  DESTINATION_LABEL,
  DESTINATIONS,
  PROJECTS,
  THREADS,
  TIMELINE_SPOT,
  projectName,
  projectRepo,
  type ProtoDestination,
  type ProtoThread,
} from "./fixture";
import {
  DestinationChip,
  KindChip,
  StateReadout,
  useRoutingState,
} from "./shared";

const KEY_TO_DESTINATION: Record<string, ProtoDestination> = {
  s: "spec",
  t: "todo",
  n: "journal",
  p: "timeline",
  x: "drop",
};

const STEPS = [
  { n: 1, label: "What came home" },
  { n: 2, label: "Route each one" },
  { n: 3, label: "What happened" },
];

export function RoutingFlow() {
  const routing = useRoutingState();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);

  const toRoute = useMemo(
    () =>
      THREADS.filter(
        (thread) => routing.state[thread.id].status === "proposed",
      ).length,
    [routing.state],
  );

  const step = !started ? 1 : toRoute > 0 ? 2 : 3;

  return (
    <div className="dr-shell dr-flow">
      <header className="dr-header">
        <div>
          <p className="dr-eyebrow">After the walk</p>
          <h1>{DAY.label}</h1>
        </div>
        <nav className="dr-steps" aria-label="Flow steps">
          {STEPS.map((item) => (
            <span
              key={item.n}
              className={
                item.n === step
                  ? "dr-step active"
                  : item.n < step
                    ? "dr-step done"
                    : "dr-step"
              }
            >
              <b>{item.n}</b> {item.label}
            </span>
          ))}
        </nav>
        <StateReadout state={routing.state} />
      </header>

      {step === 1 ? (
        <Arrival onStart={() => setStarted(true)} />
      ) : step === 2 ? (
        <Deck
          routing={routing}
          index={index}
          setIndex={setIndex}
          position={THREADS.length - toRoute + 1}
        />
      ) : (
        <Receipts routing={routing} />
      )}
    </div>
  );
}

/* --- Step 1 · What came home ---------------------------------------------- */

function Arrival({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onStart();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="dr-arrive">
      <p className="dr-arrive-sub">
        {DAY.place} · {DAY.walkedMinutes} min · {THREADS.length} Threads,
        already enriched on the way home. Each one arrives with a guess about
        where it should go. Routing it makes it happen — accept the guess or
        redirect it, one at a time.
      </p>
      <div className="dr-arrive-lanes">
        {DESTINATIONS.map((destination) => {
          const proposed = THREADS.filter(
            (thread) => thread.proposedDestination === destination,
          );
          if (proposed.length === 0) return null;
          return (
            <div
              key={destination}
              className={`dr-arrive-lane dr-lane-${destination}`}
            >
              <h2>
                {DESTINATION_LABEL[destination]}
                <span className="dr-lane-count">{proposed.length}</span>
              </h2>
              <p className="dr-lane-handoff">
                {DESTINATION_HANDOFF[destination]}
              </p>
              <ul>
                {proposed.map((thread) => (
                  <li key={thread.id}>
                    {thread.title}
                    {thread.needsAWord ? (
                      <em className="dr-lane-word"> · needs a word</em>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <button type="button" className="dr-dispatch" onClick={onStart}>
        Start routing <kbd>⏎</kbd>
      </button>
    </div>
  );
}

/* --- Step 2 · Route each one ----------------------------------------------- */

function Deck({
  routing,
  index,
  setIndex,
  position,
}: {
  routing: ReturnType<typeof useRoutingState>;
  index: number;
  setIndex: (updater: (prev: number) => number) => void;
  position: number;
}) {
  // Show the first still-proposed Thread at or after the cursor — an undo
  // or a settle never leaves the deck pointing at a settled card.
  const thread = useMemo(() => {
    for (let step = 0; step < THREADS.length; step += 1) {
      const candidate = THREADS[(index + step) % THREADS.length];
      if (routing.state[candidate.id].status === "proposed") return candidate;
    }
    return THREADS[Math.min(index, THREADS.length - 1)];
  }, [index, routing.state]);
  const route = routing.state[thread.id];
  const [reportOpen, setReportOpen] = useState(false);

  const shownIndex = THREADS.indexOf(thread);
  const advance = useCallback(() => {
    setReportOpen(false);
    setIndex(() => (shownIndex + 1) % THREADS.length);
  }, [setIndex, shownIndex]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        routing.accept(thread.id);
        advance();
      } else if (KEY_TO_DESTINATION[event.key]) {
        event.preventDefault();
        routing.routeTo(thread.id, KEY_TO_DESTINATION[event.key]);
        advance();
      } else if (event.key === "j") {
        advance();
      } else if (event.key === "r" && thread.report) {
        event.preventDefault();
        setReportOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, routing, thread.id, thread.report]);

  return (
    <>
      <p className="dr-deck-position">
        Thread {position} of {THREADS.length} ·{" "}
        <span className="dr-keys">
          <kbd>⏎</kbd> accept the guess · <kbd>s</kbd> spec · <kbd>t</kbd>{" "}
          to-do · <kbd>n</kbd> journal · <kbd>p</kbd> timeline · <kbd>x</kbd>{" "}
          drop · <kbd>r</kbd> read report · <kbd>j</kbd> skip
        </span>
      </p>
      <article className="dr-card" key={thread.id}>
        <div className="dr-card-meta">
          <span>{thread.time}</span>
          <span>{thread.place}</span>
          <KindChip thread={thread} />
          <DestinationChip
            destination={route.destination}
            status={route.status}
          />
        </div>
        {thread.excerpt ? (
          <blockquote className="dr-words">{thread.excerpt}</blockquote>
        ) : (
          <p className="dr-words dr-words-empty">No words on this one.</p>
        )}
        {thread.media.length > 0 ? (
          <div className="dr-media-row">
            {thread.media.map((media) => (
              <figure
                key={media.id}
                className="dr-media"
                style={{ background: media.tone }}
              >
                <figcaption>
                  {media.label}
                  {media.gps
                    ? ` · ${media.gps.lat.toFixed(4)}, ${media.gps.lon.toFixed(4)}`
                    : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        <p className="dr-enrichment">{thread.enrichmentSummary}</p>
        {thread.report ? (
          <div className="dr-report">
            <button
              type="button"
              className="dr-report-toggle"
              onClick={() => setReportOpen((open) => !open)}
            >
              {reportOpen ? "▾ Hide the report" : "▸ Read the report"}{" "}
              <kbd>r</kbd>
            </button>
            {reportOpen ? (
              <div className="dr-report-body">
                {thread.report.split("\n\n").map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {thread.needsAWord ? (
          <p className="dr-needs-word">
            <strong>Needs a word:</strong> {thread.needsAWord}
          </p>
        ) : null}

        <div className="dr-proposal">
          <p>
            The guess: <strong>{DESTINATION_LABEL[route.destination]}</strong>
            {route.destination === "spec" ? (
              <>
                {" → "}
                <select
                  value={route.projectId ?? ""}
                  onChange={(event) =>
                    routing.setProject(thread.id, event.target.value || null)
                  }
                >
                  <option value="">pick a Project…</option>
                  {PROJECTS.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <span className="dr-handoff">
              {" "}
              — routing it {DESTINATION_HANDOFF[route.destination]}
            </span>
          </p>
          <div className="dr-actions">
            <button
              type="button"
              className="dr-accept"
              onClick={() => {
                routing.accept(thread.id);
                advance();
              }}
            >
              Accept ⏎
            </button>
            {DESTINATIONS.filter(
              (destination) => destination !== route.destination,
            ).map((destination) => (
              <button
                key={destination}
                type="button"
                onClick={() => {
                  routing.routeTo(thread.id, destination);
                  advance();
                }}
              >
                {DESTINATION_LABEL[destination]}{" "}
                <kbd>
                  {Object.entries(KEY_TO_DESTINATION).find(
                    ([, value]) => value === destination,
                  )?.[0] ?? ""}
                </kbd>
              </button>
            ))}
            <button type="button" className="dr-skip" onClick={advance}>
              Skip <kbd>j</kbd>
            </button>
          </div>
        </div>
      </article>
    </>
  );
}

/* --- Step 3 · What happened (receipts) -------------------------------------- */

function Receipts({
  routing,
}: {
  routing: ReturnType<typeof useRoutingState>;
}) {
  const byDest = (destination: ProtoDestination) =>
    THREADS.filter(
      (thread) => routing.state[thread.id].destination === destination,
    );

  const specs = byDest("spec");
  const todos = byDest("todo");
  const journal = byDest("journal");
  const timeline = byDest("timeline");
  const dropped = byDest("drop");

  return (
    <div className="dr-arrive dr-receipts">
      <p className="dr-arrive-sub">
        Done — everything went somewhere. This is what happened (simulated
        here; in the real app these are the actual issue, list, and pages).
        Undo pulls a Thread back into the deck.
      </p>

      {specs.length > 0 ? (
        <section className="dr-receipt dr-lane-spec">
          <h2>Issues drafted · handed to a coding agent</h2>
          {specs.map((thread) => {
            const route = routing.state[thread.id];
            return (
              <div key={thread.id} className="dr-issue">
                <p className="dr-issue-repo">
                  {projectRepo(route.projectId) ??
                    `${projectName(route.projectId) ?? "no Project"} (no repo)`}{" "}
                  · issue drafted
                </p>
                <p className="dr-issue-title">{thread.title}</p>
                {thread.report ? (
                  <p className="dr-issue-body">
                    {thread.report.split("\n\n")[0]} …full report as the issue
                    body.
                  </p>
                ) : null}
                <Undo onClick={() => routing.reopen(thread.id)} />
              </div>
            );
          })}
        </section>
      ) : null}

      {todos.length > 0 ? (
        <section className="dr-receipt dr-lane-todo">
          <h2>On your list now</h2>
          <ul className="dr-checklist">
            {todos.map((thread) => (
              <li key={thread.id}>
                <span className="dr-checkbox" aria-hidden="true" />
                {thread.excerpt || thread.title}
                <Undo onClick={() => routing.reopen(thread.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {journal.length > 0 ? (
        <section className="dr-receipt dr-lane-journal">
          <h2>In the notebook</h2>
          {journal.map((thread) => (
            <JournalEntry
              key={thread.id}
              thread={thread}
              onUndo={() => routing.reopen(thread.id)}
            />
          ))}
        </section>
      ) : null}

      {timeline.length > 0 ? (
        <section className="dr-receipt dr-lane-timeline">
          <h2>
            On the timeline · {TIMELINE_SPOT.name}, day {TIMELINE_SPOT.days}
          </h2>
          <div className="dr-strip">
            {TIMELINE_SPOT.recent.slice(0, 4).map((frame) => (
              <div
                key={frame.day}
                className="dr-strip-frame"
                style={{ background: frame.tone }}
              >
                <span>{frame.day}</span>
                <span>{frame.distanceMeters} m</span>
              </div>
            ))}
            <div className="dr-strip-frame today">
              <span>Today</span>
              <span>day {TIMELINE_SPOT.days}</span>
            </div>
          </div>
          {timeline.map((thread) => (
            <p key={thread.id} className="dr-receipt-line">
              {thread.title}
              <Undo onClick={() => routing.reopen(thread.id)} />
            </p>
          ))}
        </section>
      ) : null}

      {dropped.length > 0 ? (
        <section className="dr-receipt dr-lane-drop">
          <h2>Let go</h2>
          {dropped.map((thread) => (
            <p key={thread.id} className="dr-receipt-line dr-receipt-dropped">
              {thread.title}
              <Undo onClick={() => routing.reopen(thread.id)} />
            </p>
          ))}
        </section>
      ) : null}

      <p className="dr-done-line">
        That&apos;s the day. Nothing left to press — close the tab, the walk
        is filed.
      </p>
    </div>
  );
}

function JournalEntry({
  thread,
  onUndo,
}: {
  thread: ProtoThread;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dr-journal-entry">
      <p className="dr-issue-title">
        {thread.title}
        {thread.draftWorthy ? (
          <em className="dr-draft"> · draft candidate</em>
        ) : null}
        <Undo onClick={onUndo} />
      </p>
      {thread.needsAWord ? (
        <p className="dr-needs-word">
          <strong>Still asking:</strong> {thread.needsAWord}
        </p>
      ) : null}
      {thread.report ? (
        <>
          <button
            type="button"
            className="dr-report-toggle"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? "▾ Hide the report" : "▸ Read the report"}
          </button>
          {open ? (
            <div className="dr-report-body">
              {thread.report.split("\n\n").map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="dr-issue-body">{thread.enrichmentSummary}</p>
      )}
    </div>
  );
}

function Undo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dr-undo" onClick={onClick}>
      undo
    </button>
  );
}
