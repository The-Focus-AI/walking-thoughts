"use client";

/**
 * PROTOTYPE variant D (round 2) — Bookended deck.
 * Round 1 verdict: A's one-at-a-time deck is the pass; B's lanes read well
 * but gave nothing to do; C's prose sheet didn't parse. D keeps the deck as
 * the only working surface and demotes B's overview to the bookends: an
 * arrival picture of what the day proposes, the deck, then a departure
 * picture of where everything went, with Dispatch.
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

export function BookendVariant() {
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

  const phase = !started ? "arrive" : unsettled > 0 ? "deck" : "depart";

  return (
    <div className="dr-shell dr-bookend">
      <header className="dr-header">
        <div>
          <p className="dr-eyebrow">
            After the walk · Bookended deck ·{" "}
            {phase === "arrive"
              ? "what came home"
              : phase === "deck"
                ? `${THREADS.length - unsettled + 1} of ${THREADS.length}`
                : "where it went"}
          </p>
          <h1>{DAY.label}</h1>
        </div>
        <StateReadout state={routing.state} dispatched={routing.dispatched} />
      </header>

      {phase === "arrive" ? (
        <ArrivalOverview onStart={() => setStarted(true)} />
      ) : phase === "deck" ? (
        <Deck routing={routing} index={index} setIndex={setIndex} />
      ) : (
        <DepartureOverview routing={routing} />
      )}
    </div>
  );
}

/* --- Bookend 1: what the day proposes ------------------------------------ */

function ArrivalOverview({ onStart }: { onStart: () => void }) {
  return (
    <div className="dr-arrive">
      <p className="dr-arrive-sub">
        {DAY.place} · {DAY.walkedMinutes} min · {THREADS.length} Threads, all
        enriched. Here is what the day thinks it is — settle it one Thread at
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
        Start routing →
      </button>
    </div>
  );
}

/* --- The deck (A's interaction, unchanged) -------------------------------- */

function Deck({
  routing,
  index,
  setIndex,
}: {
  routing: ReturnType<typeof useRoutingState>;
  index: number;
  setIndex: (updater: (prev: number) => number) => void;
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

  // If the current card is already settled (an undo landed us back in the
  // deck on a settled index), move to the next open one.
  useEffect(() => {
    if (route.status !== "proposed") advance();
  }, [route.status, advance]);

  return (
    <article className="dr-card" key={thread.id}>
      <div className="dr-card-meta">
        <span>{thread.time}</span>
        <span>{thread.place}</span>
        <KindChip thread={thread} />
        <DestinationChip destination={route.destination} status={route.status} />
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
          Proposed: <strong>{DESTINATION_LABEL[route.destination]}</strong>
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
  );
}

/* --- Bookend 2: where everything went ------------------------------------- */

function DepartureOverview({
  routing,
}: {
  routing: ReturnType<typeof useRoutingState>;
}) {
  const sections = DESTINATIONS.map((destination) => ({
    destination,
    threads: THREADS.filter(
      (thread) => routing.state[thread.id].destination === destination,
    ),
  })).filter((section) => section.threads.length > 0);

  return (
    <div className="dr-arrive">
      <p className="dr-arrive-sub">
        The pass is done. This is where the day goes when you dispatch it.
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
              <p className="dr-lane-spot">
                {TIMELINE_SPOT.name}: day {TIMELINE_SPOT.days}
              </p>
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
        {routing.dispatched ? "Dispatched ✓" : "Dispatch the day"}
      </button>
    </div>
  );
}
