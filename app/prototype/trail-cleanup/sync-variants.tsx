"use client";

/**
 * PROTOTYPE — sync / Enrichment glanceability variants.
 * Question: how does the user see the processing queue without digging?
 */

import { PROTO_THREAD, statusLabel, syncRollup } from "./fixture";
import { CaptureRow, ModeDock, ProtoStateDump } from "./shared";

export const SYNC_VARIANTS = [
  { key: "A", label: "Queue chip strip" },
  { key: "B", label: "Status swimlanes" },
  { key: "C", label: "Pulse gutter + footer" },
] as const;

function ChipStrip() {
  const rollup = syncRollup(PROTO_THREAD.captures);
  return (
    <div className="sync-chips" role="status">
      <span className="chip local">{rollup.saved_locally} local</span>
      <span className="chip syncing">{rollup.syncing} syncing</span>
      <span className="chip enriching">{rollup.enriching} enriching</span>
      <span className="chip attention">{rollup.needs_attention} need you</span>
      <button type="button" className="proto-ghost">
        Retry
      </button>
    </div>
  );
}

/** A — Compact rollup in the topbar; timeline stays ordinary. */
export function SyncA() {
  return (
    <div className="proto-shell sync-a">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">Today&apos;s hike</span>
        <span className="sync-attention-dot" title="Needs attention">
          !
        </span>
      </header>
      <ChipStrip />
      <main className="proto-pad">
        <ul className="proto-list">
          {PROTO_THREAD.captures.map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
        <ModeDock />
      </main>
      <ProtoStateDump
        area="sync"
        variant="A"
        note="Counts replace 'Ready offline' / policy sentence. Attention is a topbar badge."
      />
    </div>
  );
}

/** B — Horizontal swimlanes by status — queue is the layout. */
export function SyncB() {
  const lanes = [
    "saved_locally",
    "syncing",
    "enriching",
    "needs_attention",
    "complete",
  ] as const;

  return (
    <div className="proto-shell sync-b">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">Processing</span>
        <button type="button" className="proto-ghost">
          Retry failed
        </button>
      </header>

      <div className="sync-lanes" aria-label="Capture status lanes">
        {lanes.map((lane) => {
          const items = PROTO_THREAD.captures.filter((c) => c.status === lane);
          return (
            <section key={lane} className={`sync-lane lane-${lane}`}>
              <h2>
                {statusLabel(lane)}{" "}
                <span className="proto-quiet">{items.length}</span>
              </h2>
              <ul>
                {items.map((capture) => (
                  <li key={capture.id}>
                    <p>{capture.text}</p>
                    <span>#{capture.sequence}</span>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="proto-quiet empty">—</li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="proto-pad">
        <ModeDock />
      </footer>

      <ProtoStateDump
        area="sync"
        variant="B"
        note="Status is the primary axis — Thread chronology is secondary. Extreme but honest about the queue."
      />
    </div>
  );
}

/** C — Fat status gutter on each row + sticky sync footer. */
export function SyncC() {
  const rollup = syncRollup(PROTO_THREAD.captures);
  const pending =
    rollup.saved_locally + rollup.syncing + rollup.enriching + rollup.needs_attention;

  return (
    <div className="proto-shell sync-c">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">{PROTO_THREAD.title}</span>
      </header>

      <ul className="sync-gutter-list">
        {PROTO_THREAD.captures.map((capture) => (
          <li key={capture.id} className={`gutter-${capture.status}`}>
            <span className="gutter-label">{statusLabel(capture.status)}</span>
            <div>
              <p>{capture.text}</p>
              <span className="proto-quiet">#{capture.sequence}</span>
            </div>
          </li>
        ))}
      </ul>

      <footer className="sync-footer" role="status">
        <div>
          <strong>
            {pending === 0
              ? "All caught up"
              : `Working on ${pending} of ${PROTO_THREAD.captures.length}`}
          </strong>
          <p className="proto-quiet">
            {rollup.syncing} syncing · {rollup.enriching} enriching ·{" "}
            {rollup.needs_attention} need attention
          </p>
        </div>
        <button type="button" className="proto-primary">
          Retry
        </button>
      </footer>

      <ProtoStateDump
        area="sync"
        variant="C"
        note="Each row wears its state as a gutter. Sticky footer is the glance layer."
      />
    </div>
  );
}
