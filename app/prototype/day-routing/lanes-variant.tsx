"use client";

/**
 * PROTOTYPE variant B — Sorting lanes.
 * The whole day at once, laid out as destination lanes. The Enrichment has
 * already pre-sorted every Thread into a lane with a "?"; the walker moves
 * the wrong ones, confirms lane by lane, and dispatches the day in one go.
 */

import {
  DESTINATION_HANDOFF,
  DESTINATION_LABEL,
  DESTINATIONS,
  THREADS,
  TIMELINE_SPOT,
  projectName,
  type ProtoDestination,
} from "./fixture";
import { KindChip, StateReadout, useRoutingState } from "./shared";

export function LanesVariant() {
  const routing = useRoutingState();

  const lanes = DESTINATIONS.map((destination) => ({
    destination,
    threads: THREADS.filter(
      (thread) => routing.state[thread.id].destination === destination,
    ),
  }));

  const allConfirmed = THREADS.every(
    (thread) => routing.state[thread.id].status === "confirmed",
  );

  return (
    <div className="dr-shell dr-lanes">
      <header className="dr-header">
        <div>
          <p className="dr-eyebrow">After the walk · Sorting lanes</p>
          <h1>Where does today go?</h1>
        </div>
        <StateReadout state={routing.state} dispatched={routing.dispatched} />
      </header>

      <div className="dr-lane-row">
        {lanes.map(({ destination, threads }) => (
          <section key={destination} className={`dr-lane dr-lane-${destination}`}>
            <header className="dr-lane-head">
              <h2>{DESTINATION_LABEL[destination]}</h2>
              <span className="dr-lane-count">{threads.length}</span>
            </header>
            <p className="dr-lane-handoff">{DESTINATION_HANDOFF[destination]}</p>
            {destination === "timeline" ? (
              <p className="dr-lane-spot">
                {TIMELINE_SPOT.name}: day {TIMELINE_SPOT.days}, all frames
                within {TIMELINE_SPOT.radiusMeters} m
              </p>
            ) : null}
            <ul>
              {threads.map((thread) => {
                const route = routing.state[thread.id];
                const proposed = route.status === "proposed";
                return (
                  <li
                    key={thread.id}
                    className={
                      proposed ? "dr-lane-card proposed" : "dr-lane-card confirmed"
                    }
                  >
                    <div className="dr-lane-card-top">
                      <KindChip thread={thread} />
                      <span className="dr-lane-time">{thread.time}</span>
                    </div>
                    <p className="dr-lane-title">{thread.title}</p>
                    {route.destination === "spec" ? (
                      <p className="dr-lane-project">
                        {projectName(route.projectId) ?? "no Project yet"}
                      </p>
                    ) : null}
                    {thread.needsAWord ? (
                      <p className="dr-lane-word">needs a word</p>
                    ) : null}
                    <div className="dr-lane-card-actions">
                      {proposed ? (
                        <button
                          type="button"
                          className="dr-accept"
                          onClick={() => routing.accept(thread.id)}
                        >
                          ✓ keep here
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => routing.reopen(thread.id)}
                        >
                          undo
                        </button>
                      )}
                      <MoveMenu
                        current={route.destination}
                        onMove={(next) => routing.routeTo(thread.id, next)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="dr-lanes-foot">
        <button
          type="button"
          className="dr-dispatch"
          disabled={!allConfirmed || routing.dispatched}
          onClick={routing.dispatch}
        >
          {routing.dispatched
            ? "Dispatched ✓"
            : allConfirmed
              ? "Dispatch the day"
              : "Settle every card to dispatch"}
        </button>
      </footer>
    </div>
  );
}

function MoveMenu({
  current,
  onMove,
}: {
  current: ProtoDestination;
  onMove: (destination: ProtoDestination) => void;
}) {
  return (
    <select
      value=""
      aria-label="Move to another lane"
      onChange={(event) => {
        if (event.target.value) onMove(event.target.value as ProtoDestination);
      }}
    >
      <option value="">move…</option>
      {DESTINATIONS.filter((destination) => destination !== current).map(
        (destination) => (
          <option key={destination} value={destination}>
            → {DESTINATION_LABEL[destination]}
          </option>
        ),
      )}
    </select>
  );
}
