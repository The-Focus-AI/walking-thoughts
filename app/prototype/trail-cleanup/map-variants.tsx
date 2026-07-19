"use client";

/**
 * PROTOTYPE — map findability variants for trail home.
 * Question: how does the Offline Region map stop being invisible?
 */

import { PROTO_REGION, PROTO_THREAD } from "./fixture";
import { CaptureRow, FakeMap, ModeDock, ProtoStateDump } from "./shared";

export const MAP_VARIANTS = [
  { key: "A", label: "Map as home hero" },
  { key: "B", label: "Peer bottom tabs" },
  { key: "C", label: "Place strip + thumbnail" },
] as const;

/** A — Map fills the upper half; Capture overlays; map is undeniable. */
export function MapA() {
  return (
    <div className="proto-shell map-a">
      <div className="map-a-hero">
        <FakeMap label="Home Map Journal preview" />
        <div className="map-a-overlay">
          <span className="proto-mark">W</span>
          <div>
            <p className="proto-eyebrow">Offline Region</p>
            <h1>{PROTO_REGION.name}</h1>
            <p className="proto-quiet">
              v{PROTO_REGION.version} · {PROTO_REGION.radiusKm} km · ready
            </p>
          </div>
          <a className="proto-primary linkish" href="/journal">
            Open Map Journal
          </a>
        </div>
      </div>

      <section className="map-a-trail">
        <h2>{PROTO_THREAD.title}</h2>
        <ModeDock />
        <textarea rows={2} placeholder="What did you notice?" readOnly />
        <button type="button" className="proto-primary">
          Capture
        </button>
        <ul className="proto-list compact">
          {PROTO_THREAD.captures.slice(0, 2).map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
      </section>

      <ProtoStateDump
        area="map"
        variant="A"
        note="Map is the first plane. Capture is secondary below — place-first home."
      />
    </div>
  );
}

/** B — Trail | Map | Threads as peer bottom tabs (Android-style). */
export function MapB() {
  return (
    <div className="proto-shell map-b">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">Trail</span>
      </header>

      <main className="proto-pad map-b-main">
        <p className="proto-quiet">Adding to {PROTO_THREAD.title}</p>
        <ModeDock />
        <textarea rows={3} placeholder="What did you notice?" readOnly />
        <button type="button" className="proto-primary">
          Capture
        </button>
        <ul className="proto-list compact">
          {PROTO_THREAD.captures.slice(0, 3).map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
      </main>

      <nav className="map-b-tabs" aria-label="Primary">
        <a className="active" href="#trail">
          Trail
        </a>
        <a href="/journal" className="map-emphasis">
          Map
          <span className="map-b-dot" />
        </a>
        <a href="/threads">Threads</a>
      </nav>

      <ProtoStateDump
        area="map"
        variant="B"
        note="Map is a peer destination in the thumb bar — not a topbar text link."
      />
    </div>
  );
}

/** C — Compact place strip with thumbnail; CTA replaces Threads-by-day. */
export function MapC() {
  return (
    <div className="proto-shell map-c">
      <header className="proto-top compact">
        <span className="proto-mark">W</span>
        <span className="proto-title">Walking Thoughts</span>
        <a href="/threads">Threads</a>
      </header>

      <a className="map-c-strip" href="/journal">
        <div className="map-c-thumb">
          <FakeMap />
        </div>
        <div>
          <p className="proto-eyebrow">Review by place</p>
          <h2>{PROTO_REGION.name}</h2>
          <p className="proto-quiet">
            Offline Region ready · {PROTO_THREAD.captures.length} Captures on map
          </p>
        </div>
        <span className="map-c-chevron">→</span>
      </a>

      <section className="proto-pad">
        <h2>{PROTO_THREAD.title}</h2>
        <ModeDock />
        <textarea rows={2} placeholder="What did you notice?" readOnly />
        <button type="button" className="proto-primary">
          Capture
        </button>
        <ul className="proto-list compact">
          {PROTO_THREAD.captures.map((capture) => (
            <li key={capture.id}>
              <CaptureRow capture={capture} />
            </li>
          ))}
        </ul>
      </section>

      <ProtoStateDump
        area="map"
        variant="C"
        note="Place strip is the Map Journal CTA — thumbnail proves a map exists without owning the viewport."
      />
    </div>
  );
}
