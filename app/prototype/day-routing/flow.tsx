"use client";

/**
 * PROTOTYPE — the day-routing flow, single design (was "variant D").
 * Three steps, mapped on screen: ① What came home → ② Route each one →
 * ③ Where it goes / Dispatch. Settling a Route is what marks a Thread
 * reviewed; Dispatch commits the day.
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
  { n: 3, label: "Dispatch it" },
];

export function RoutingFlow() {
  const routing = useRoutingState();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);

  const unsettled = useMemo(
    () =>
      THREADS.filter(
        (thread) => routing.state[thread.id].status === "proposed",
      ).length,
    [routing.state],
  );

  const step = !started ? 1 : unsettled > 0 ? 2 : 3;

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
        <StateReadout state={routing.state} dispatched={routing.dispatched} />
      </header>

      {step === 1 ? (
        <Arrival onStart={() => setStarted(true)} />
      ) : step === 2 ? (
        <Deck
          routing={routing}
          index={index}
          setIndex={setIndex}
          position={THREADS.length - unsettled + 1}
        />
      ) : (
        <Departure routing={routing} />
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
        where it should go — your job is only to confirm or redirect, one at
        a time.
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
  const thread = THREADS[Math.min(index, THREADS.length - 1)];
  const route = routing.state[thread.id];

  const advance = useCallback(() => {
    setIndex((prev) => {
      for (let step = 1; step <= THREADS.length; step += 1) {
        const next = (prev + step) % THREADS.length;
        if (routing.state[THREADS[next].id].status === "proposed") return next;
      }
      return prev;
    });
  }, [routing.state, setIndex]);

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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, routing, thread.id]);

  // An undo can land the deck on an already-settled index; move along.
  useEffect(() => {
    if (route.status !== "proposed") advance();
  }, [route.status, advance]);

  return (
    <>
      <p className="dr-deck-position">
        Thread {position} of {THREADS.length} ·{" "}
        <span className="dr-keys">
          <kbd>⏎</kbd> accept the guess · <kbd>s</kbd> spec · <kbd>t</kbd>{" "}
          to-do · <kbd>n</kbd> journal · <kbd>p</kbd> timeline · <kbd>x</kbd>{" "}
          drop · <kbd>j</kbd> skip
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
              — {DESTINATION_HANDOFF[route.destination]}
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

/* --- Step 3 · Dispatch it --------------------------------------------------- */

function Departure({
  routing,
}: {
  routing: ReturnType<typeof useRoutingState>;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && !routing.dispatched) {
        event.preventDefault();
        routing.dispatch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [routing]);

  const sections = DESTINATIONS.map((destination) => ({
    destination,
    threads: THREADS.filter(
      (thread) => routing.state[thread.id].destination === destination,
    ),
  })).filter((section) => section.threads.length > 0);

  return (
    <div className="dr-arrive">
      <p className="dr-arrive-sub">
        The pass is done — every Thread has a place to go. Dispatch commits
        it: each handoff below actually happens (simulated here). Undo pulls
        a Thread back into the deck.
      </p>
      <div className="dr-arrive-lanes">
        {sections.map(({ destination, threads }) => (
          <div
            key={destination}
            className={`dr-arrive-lane dr-lane-${destination}`}
          >
            <h2>
              {DESTINATION_LABEL[destination]}
              <span className="dr-lane-count">{threads.length}</span>
            </h2>
            <p className="dr-lane-handoff">
              {DESTINATION_HANDOFF[destination]}
            </p>
            {destination === "timeline" ? (
              <div className="dr-strip">
                {TIMELINE_SPOT.recent.slice(0, 3).map((frame) => (
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
            ) : null}
            <ul>
              {threads.map((thread) => {
                const route = routing.state[thread.id];
                return (
                  <li key={thread.id}>
                    {thread.title}
                    {destination === "spec" ? (
                      <em className="dr-handoff">
                        {" "}
                        → {projectName(route.projectId) ?? "no Project"}
                        {projectRepo(route.projectId)
                          ? ` (${projectRepo(route.projectId)})`
                          : ""}
                      </em>
                    ) : null}
                    <button
                      type="button"
                      className="dr-undo"
                      onClick={() => routing.reopen(thread.id)}
                    >
                      undo
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="dr-dispatch"
        disabled={routing.dispatched}
        onClick={routing.dispatch}
      >
        {routing.dispatched ? "Dispatched ✓ — the day is done" : "Dispatch the day"}
        {!routing.dispatched ? <kbd>⏎</kbd> : null}
      </button>
    </div>
  );
}
