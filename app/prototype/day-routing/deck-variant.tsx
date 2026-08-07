"use client";

/**
 * PROTOTYPE variant A — Dispatch deck.
 * One Thread at a time, full attention. The Enrichment's proposed route is
 * pre-armed: Enter accepts it, one key redirects it, and the deck advances
 * itself. The pass ends on a dispatch summary, not an empty list.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DESTINATION_HANDOFF,
  DESTINATION_LABEL,
  DESTINATIONS,
  PROJECTS,
  THREADS,
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

export function DeckVariant() {
  const routing = useRoutingState();
  const [index, setIndex] = useState(0);

  const unsettledIds = useMemo(
    () =>
      THREADS.filter((thread) => routing.state[thread.id].status === "proposed").map(
        (thread) => thread.id,
      ),
    [routing.state],
  );
  const done = unsettledIds.length === 0;
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
  }, [routing.state]);

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
      if (done) return;
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
  }, [advance, done, routing, thread.id]);

  const settled = THREADS.length - unsettledIds.length;

  return (
    <div className="dr-shell dr-deck">
      <header className="dr-header">
        <div>
          <p className="dr-eyebrow">After the walk · Dispatch deck</p>
          <h1>
            {settled} of {THREADS.length} routed
          </h1>
        </div>
        <StateReadout state={routing.state} dispatched={routing.dispatched} />
      </header>

      {done ? (
        <DispatchSummary routing={routing} />
      ) : (
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
      )}
    </div>
  );
}

function DispatchSummary({
  routing,
}: {
  routing: ReturnType<typeof useRoutingState>;
}) {
  return (
    <section className="dr-summary">
      <h2>Everything has a place to go.</h2>
      <ul>
        {THREADS.map((thread) => {
          const route = routing.state[thread.id];
          return (
            <li key={thread.id}>
              <DestinationChip
                destination={route.destination}
                status={route.status}
              />
              <span className="dr-summary-title">{thread.title}</span>
              {route.destination === "spec" ? (
                <span className="dr-handoff">
                  → {projectName(route.projectId) ?? "no Project"}
                  {projectRepo(route.projectId)
                    ? ` (${projectRepo(route.projectId)})`
                    : ""}
                </span>
              ) : (
                <span className="dr-handoff">
                  → {DESTINATION_HANDOFF[route.destination]}
                </span>
              )}
              <button type="button" onClick={() => routing.reopen(thread.id)}>
                undo
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="dr-dispatch"
        disabled={routing.dispatched}
        onClick={routing.dispatch}
      >
        {routing.dispatched ? "Dispatched ✓" : "Dispatch the day"}
      </button>
    </section>
  );
}
