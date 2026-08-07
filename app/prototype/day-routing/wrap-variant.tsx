"use client";

/**
 * PROTOTYPE variant C — Day wrap sheet.
 * The day arrives pre-written: a brief that reads top to bottom like a
 * report, sectioned by destination, every line already routed. Reviewing is
 * reading; the walker vetoes or redirects the lines that are wrong and
 * approves the sheet once. Reading posture instead of sorting posture.
 */

import {
  DAY,
  DESTINATION_LABEL,
  DESTINATIONS,
  THREADS,
  TIMELINE_SPOT,
  projectName,
  projectRepo,
  type ProtoDestination,
} from "./fixture";
import { StateReadout, useRoutingState } from "./shared";

const SECTION_LEAD: Record<ProtoDestination, string> = {
  spec: "To spec out and hand off",
  todo: "To get done",
  journal: "For the notebook",
  timeline: "For the timeline",
  drop: "Let go",
};

export function WrapVariant() {
  const routing = useRoutingState();
  const allConfirmed = THREADS.every(
    (thread) => routing.state[thread.id].status === "confirmed",
  );

  const sections = DESTINATIONS.map((destination) => ({
    destination,
    threads: THREADS.filter(
      (thread) => routing.state[thread.id].destination === destination,
    ),
  })).filter((section) => section.threads.length > 0);

  return (
    <div className="dr-shell dr-wrap">
      <header className="dr-header">
        <div>
          <p className="dr-eyebrow">After the walk · Day wrap</p>
          <h1>{DAY.label}</h1>
          <p className="dr-wrap-sub">
            {DAY.place} · {DAY.walkedMinutes} min · {THREADS.length} Threads.
            The day sorted itself while you walked — read it, fix what
            needs fixing, approve it.
          </p>
        </div>
        <StateReadout state={routing.state} dispatched={routing.dispatched} />
      </header>

      <article className="dr-sheet">
        {sections.map(({ destination, threads }) => (
          <section key={destination} className="dr-sheet-section">
            <h2>
              {SECTION_LEAD[destination]}
              <span className="dr-sheet-count">{threads.length}</span>
            </h2>
            {destination === "timeline" ? (
              <div className="dr-strip">
                {TIMELINE_SPOT.recent.map((frame) => (
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
                const proposed = route.status === "proposed";
                return (
                  <li
                    key={thread.id}
                    className={proposed ? "dr-line proposed" : "dr-line confirmed"}
                  >
                    <div className="dr-line-body">
                      <p className="dr-line-title">
                        {thread.title}
                        {thread.draftWorthy ? (
                          <em className="dr-draft"> · could become a post</em>
                        ) : null}
                      </p>
                      <p className="dr-line-detail">
                        {destination === "spec"
                          ? `${thread.enrichmentSummary} → ${
                              projectName(route.projectId) ?? "no Project"
                            }${
                              projectRepo(route.projectId)
                                ? ` (${projectRepo(route.projectId)})`
                                : ""
                            }`
                          : thread.enrichmentSummary}
                      </p>
                      {thread.needsAWord ? (
                        <p className="dr-needs-word">
                          <strong>It asked:</strong> {thread.needsAWord}
                        </p>
                      ) : null}
                    </div>
                    <div className="dr-line-actions">
                      {proposed ? (
                        <button
                          type="button"
                          className="dr-accept"
                          onClick={() => routing.accept(thread.id)}
                        >
                          ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => routing.reopen(thread.id)}
                        >
                          undo
                        </button>
                      )}
                      <select
                        value=""
                        aria-label="Send somewhere else"
                        onChange={(event) => {
                          if (event.target.value) {
                            routing.routeTo(
                              thread.id,
                              event.target.value as ProtoDestination,
                            );
                          }
                        }}
                      >
                        <option value="">elsewhere…</option>
                        {DESTINATIONS.filter(
                          (candidate) => candidate !== route.destination,
                        ).map((candidate) => (
                          <option key={candidate} value={candidate}>
                            → {DESTINATION_LABEL[candidate]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <footer className="dr-sheet-foot">
          <button
            type="button"
            className="dr-accept dr-accept-all"
            disabled={allConfirmed}
            onClick={() =>
              THREADS.forEach((thread) => {
                if (routing.state[thread.id].status === "proposed") {
                  routing.accept(thread.id);
                }
              })
            }
          >
            Accept the rest as written
          </button>
          <button
            type="button"
            className="dr-dispatch"
            disabled={!allConfirmed || routing.dispatched}
            onClick={routing.dispatch}
          >
            {routing.dispatched ? "Dispatched ✓" : "Approve & dispatch"}
          </button>
        </footer>
      </article>
    </div>
  );
}
