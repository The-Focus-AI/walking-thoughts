"use client";

/**
 * PROTOTYPE — density / space variants for trail home.
 * Question: how do we stop the trail surface from drowning Capture in chrome?
 */

import { PROTO_THREAD } from "./fixture";
import { CaptureRow, ModeDock, ProtoStateDump } from "./shared";

export const DENSITY_VARIANTS = [
  { key: "A", label: "Sticky dock trail" },
  { key: "B", label: "Composer-first sheet" },
  { key: "C", label: "Day strip rail" },
] as const;

/** A — No hero. Timeline fills. Capture dock sticky at bottom. */
export function DensityA() {
  return (
    <div className="proto-shell density-a">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">Today&apos;s hike</span>
        <nav>
          <a href="/journal">Map</a>
          <a href="/threads">Threads</a>
        </nav>
      </header>

      <main className="density-a-main">
        <p className="proto-quiet">Revision {PROTO_THREAD.revision} · adding here</p>
        <ul className="proto-list">
          {PROTO_THREAD.captures.map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
        <ProtoStateDump
          area="density"
          variant="A"
          note="Hero gone. Timeline is the page. Dock owns the thumb zone."
        />
      </main>

      <footer className="density-a-dock">
        <ModeDock />
        <textarea rows={2} placeholder="What did you notice?" readOnly />
        <button type="button" className="proto-primary">
          Capture
        </button>
      </footer>
    </div>
  );
}

/** B — Capture is the only above-fold job; thread lives in a pull-up sheet. */
export function DensityB() {
  return (
    <div className="proto-shell density-b">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-pill">On the trail</span>
        <a href="/journal">Map</a>
      </header>

      <section className="density-b-composer">
        <h1>Capture</h1>
        <ModeDock />
        <textarea rows={4} placeholder="What did you notice?" readOnly />
        <button type="button" className="proto-primary">
          Capture
        </button>
        <p className="proto-quiet">GPS available · Offline-capable</p>
      </section>

      <section className="density-b-sheet" aria-label="Today's Thread sheet">
        <div className="density-b-handle" />
        <h2>{PROTO_THREAD.title}</h2>
        <p className="proto-quiet">
          {PROTO_THREAD.captures.length} Captures · pull up for the stream
        </p>
        <ul className="proto-list compact">
          {PROTO_THREAD.captures.slice(-2).map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
      </section>

      <ProtoStateDump
        area="density"
        variant="B"
        note="Composer owns first viewport. Thread is a sheet peek, not a scroll tax."
      />
    </div>
  );
}

/** C — Horizontal day strip + thin rail; zero marketing type. */
export function DensityC() {
  const days = ["Fri", "Sat", "Sun", "Today"];
  return (
    <div className="proto-shell density-c">
      <header className="density-c-strip" aria-label="Days">
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            className={index === days.length - 1 ? "active" : undefined}
          >
            {day}
          </button>
        ))}
        <a className="density-c-map" href="/journal">
          Map
        </a>
      </header>

      <div className="density-c-body">
        <aside className="density-c-rail">
          <p className="proto-eyebrow">Thread</p>
          <h1>{PROTO_THREAD.title}</h1>
          <button type="button" className="proto-ghost">
            New Thread
          </button>
          <button type="button" className="proto-ghost">
            All Threads
          </button>
        </aside>

        <section className="density-c-stream">
          <ul className="proto-list">
            {PROTO_THREAD.captures.map((capture) => (
              <li key={capture.id}>
                <CaptureRow capture={capture} />
              </li>
            ))}
          </ul>
          <div className="density-c-inline">
            <ModeDock />
            <div className="density-c-row">
              <input placeholder="Add to this Thread…" readOnly />
              <button type="button" className="proto-primary">
                Capture
              </button>
            </div>
          </div>
        </section>
      </div>

      <ProtoStateDump
        area="density"
        variant="C"
        note="Calendar strip replaces hero. Capture is inline at the stream foot — desktop-first density."
      />
    </div>
  );
}
