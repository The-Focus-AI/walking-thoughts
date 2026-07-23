"use client";

/**
 * PROTOTYPE — brand / design-system directions for DESIGN.md.
 *
 * Question: which visual direction should Walking Thoughts commit to?
 * Four contrasting directions render the SAME specimen content:
 * token sheet, type scale, color roles, buttons in all states, the Capture
 * form, a Thread card, the tab bar, and a representative trail screen.
 *
 * Run: pnpm dev → /prototype/design-directions?viewport=mobile&variant=a
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { DIRECTIONS, cssVarsFor, directionFor, type Direction } from "./directions";
import "./prototype-design.css";

const VIEWPORTS = [
  { key: "mobile", label: "Mobile" },
  { key: "desktop", label: "Desktop" },
] as const;

const OPTIONS = DIRECTIONS.map((d) => ({ key: d.key, label: d.name }));

/* ---------------------------------------------------------------- fixture */

const CAPTURES = [
  {
    time: "07:42",
    status: "complete",
    statusLabel: "Complete",
    text: "Stone wall running straight up the ridge — who farmed this high?",
  },
  {
    time: "08:05",
    status: "enriching",
    statusLabel: "Enriching",
    text: "Cluster of orange mushrooms at the base of a dead oak. Chanterelles?",
    photo: "Photo · IMG_0412 · 2.1 MB",
  },
  {
    time: "08:31",
    status: "syncing",
    statusLabel: "Syncing",
    text: "Voice note — creek crossing is washed out, bushwhacked north around it.",
    audio: "Audio · 0:41",
  },
  {
    time: "09:02",
    status: "local",
    statusLabel: "Saved locally",
    text: "Red-tailed hawk pair circling the burn scar. Second sighting this month.",
  },
  {
    time: "09:15",
    status: "needs_attention",
    statusLabel: "Needs attention",
    text: "Panorama from the summit ledge.",
    photo: "Photo · IMG_0418 · upload stalled",
  },
] as const;

const ENRICHMENT = {
  title: "Likely golden chanterelle (Cantharellus)",
  model: "gateway/claude-fable-5",
  time: "08:09",
  body: [
    "False gills — blunt, forking ridges running down the stem — point to " +
      "Cantharellus rather than a true-gilled lookalike.",
    "Check before eating: jack-o'-lantern (Omphalotus illudens) grows in " +
      "similar clusters on dead oak and has true, knife-edge gills. Spore " +
      "print white-to-yellow for chanterelle, cream for jack-o'-lantern.",
  ],
  sources: ["mushroomexpert.com", "namyco.org"],
};

/* ------------------------------------------------------------- specimen */

function TokenSheet({ d }: { d: Direction }) {
  const swatches: Array<[string, string]> = [
    ["background", d.colors.background],
    ["surface", d.colors.surface],
    ["raised", d.colors.raised],
    ["text", d.colors.text],
    ["muted", d.colors.muted],
    ["line", d.colors.line],
    ["action", d.colors.action],
    ["identity", d.colors.identity],
    ["attention", d.colors.attention],
    ["machine", d.colors.machine],
    ["record", d.colors.record],
  ];
  return (
    <section className="dd-section dd-tokens" aria-label="Design tokens">
      <h3 className="dd-section-title">Tokens</h3>
      <ul className="dd-swatches">
        {swatches.map(([name, value]) => (
          <li key={name}>
            <span className="dd-swatch" style={{ background: value }} />
            <span className="dd-swatch-name">{name}</span>
            <code>{value}</code>
          </li>
        ))}
      </ul>
      <dl className="dd-token-meta">
        <dt>display</dt>
        <dd>
          <code>{d.typography.display}</code> · {d.typography.displayWeight} ·{" "}
          {d.typography.displayTransform} · {d.typography.displayTracking}
        </dd>
        <dt>body</dt>
        <dd>
          <code>{d.typography.body}</code>
        </dd>
        <dt>mono</dt>
        <dd>
          <code>{d.typography.mono}</code>
        </dd>
        <dt>rounded</dt>
        <dd>
          card {d.rounded.card} · control {d.rounded.control} · chip{" "}
          {d.rounded.chip} · border {d.borderWidth}
        </dd>
        <dt>spacing</dt>
        <dd>
          base {d.spacing.base} · scale {d.spacing.scale.join(" / ")}
        </dd>
      </dl>
    </section>
  );
}

function TypeScale() {
  return (
    <section className="dd-section" aria-label="Type scale">
      <h3 className="dd-section-title">Type scale</h3>
      <p className="dd-display">Walking Thoughts</p>
      <p className="dd-h1">Ridgeline stone walls</p>
      <p className="dd-h2">Today on the trail</p>
      <p className="dd-body">
        Captures commit locally first and never wait for a signal. When you are
        back in range, each Thread quietly picks up its Enrichments.
      </p>
      <p className="dd-small">
        Wednesday, July 22 · Undermountain Trail · Taconic Range pack
      </p>
      <p className="dd-mono">gateway/claude-fable-5 · 41.9707, −73.4295</p>
    </section>
  );
}

function ColorRoles() {
  return (
    <section className="dd-section" aria-label="Color roles">
      <h3 className="dd-section-title">Color roles in use</h3>
      <ul className="dd-roles">
        <li>
          <span className="dd-role dd-role-identity">You / Complete</span>
          moss speaks for the walker and settled work
        </li>
        <li>
          <span className="dd-role dd-role-action">Action / Working</span>
          the primary act and work in flight
        </li>
        <li>
          <span className="dd-role dd-role-attention">Needs attention</span>
          stalled sync, stuck upload — never a red alarm
        </li>
        <li>
          <span className="dd-role dd-role-machine">Enrichment</span>
          the machine&rsquo;s voice stays visually distinct
        </li>
        <li>
          <span className="dd-role dd-role-record">Recording</span>
          live-capture red, reserved for the mic and camera
        </li>
      </ul>
    </section>
  );
}

function Buttons() {
  return (
    <section className="dd-section" aria-label="Buttons">
      <h3 className="dd-section-title">Buttons</h3>
      <div className="dd-button-row">
        <button type="button" className="dd-btn dd-btn-primary">
          Commit Capture
        </button>
        <button type="button" className="dd-btn dd-btn-secondary">
          Retry sync
        </button>
        <button type="button" className="dd-btn dd-btn-quiet">
          Split Thread
        </button>
        <button type="button" className="dd-btn dd-btn-record">
          ■ Stop recording
        </button>
        <button type="button" className="dd-btn dd-btn-primary" disabled>
          Commit Capture
        </button>
      </div>
      <p className="dd-small">
        States: hover brightens, focus shows a 2px identity ring, disabled
        drops to 55% opacity and keeps its label.
      </p>
    </section>
  );
}

function CaptureForm() {
  return (
    <section className="dd-section" aria-label="Capture form">
      <h3 className="dd-section-title">Capture form</h3>
      <form className="dd-form" onSubmit={(event) => event.preventDefault()}>
        <label className="dd-label" htmlFor="dd-destination">
          Thread destination
        </label>
        <select id="dd-destination" className="dd-control" defaultValue="new">
          <option value="new">New Thread (default)</option>
          <option value="continue">Continue: Ridgeline stone walls</option>
        </select>
        <label className="dd-label" htmlFor="dd-words">
          Capture
        </label>
        <textarea
          id="dd-words"
          className="dd-control"
          rows={3}
          placeholder="What do you notice?"
        />
        <div className="dd-form-actions">
          <button type="button" className="dd-btn dd-btn-secondary">
            Photo
          </button>
          <button type="button" className="dd-btn dd-btn-secondary">
            Audio
          </button>
          <button type="submit" className="dd-btn dd-btn-primary">
            Commit Capture
          </button>
        </div>
        <p className="dd-small">Commits locally — sync can wait for signal.</p>
      </form>
    </section>
  );
}

function ThreadCard() {
  return (
    <section className="dd-section" aria-label="Thread card">
      <h3 className="dd-section-title">Thread card</h3>
      <article className="dd-thread-card">
        <div className="dd-thread-card-main">
          <p className="dd-thread-card-title">Ridgeline stone walls</p>
          <p className="dd-small">
            07:42 · 1 Capture · 1 Enrichment · Undermountain Trail
          </p>
        </div>
        <span className="dd-chip dd-chip-ready">Complete</span>
      </article>
      <article className="dd-thread-card">
        <div className="dd-thread-card-main">
          <p className="dd-thread-card-title">Untitled — summit panorama</p>
          <p className="dd-small">09:15 · 1 Capture · photo upload stalled</p>
        </div>
        <span className="dd-chip dd-chip-attention">Needs attention</span>
      </article>
    </section>
  );
}

function TrailScreen({ d }: { d: Direction }) {
  return (
    <section className="dd-section dd-trail" aria-label="Trail screen">
      <h3 className="dd-section-title">Product screen — today on the trail</h3>
      <div className="dd-screen">
        <header className="dd-screen-head">
          <div>
            <p className="dd-eyebrow">Undermountain Trail</p>
            <p className="dd-screen-title">Wednesday, July 22</p>
          </div>
          <span className="dd-sync-pill">
            <span className="dd-sync-dot" aria-hidden="true" />2 syncing
          </span>
        </header>

        <div className="dd-map" role="img" aria-label="Offline Region map">
          <span className="dd-map-contours" aria-hidden="true" />
          <span className="dd-map-label">Taconic Range · Offline Region ready</span>
        </div>

        <ol className="dd-entries">
          {CAPTURES.map((capture) => (
            <li
              key={capture.time}
              className={`dd-entry dd-entry-${capture.status}`}
            >
              <span className="dd-entry-gutter">
                <span className="dd-entry-time">{capture.time}</span>
                <span className="dd-entry-status">{capture.statusLabel}</span>
              </span>
              <div className="dd-entry-body">
                <p>{capture.text}</p>
                {"photo" in capture && capture.photo ? (
                  <span className="dd-media-stub">{capture.photo}</span>
                ) : null}
                {"audio" in capture && capture.audio ? (
                  <span className="dd-media-stub">{capture.audio}</span>
                ) : null}
                {capture.status === "needs_attention" ? (
                  <button type="button" className="dd-btn dd-btn-secondary dd-btn-sm">
                    Retry sync
                  </button>
                ) : null}
                {capture.status === "enriching" ? (
                  <div className="dd-enrichment" aria-label="Enrichment">
                    <p className="dd-enrichment-head">
                      Enrichment · {ENRICHMENT.time} ·{" "}
                      <code>{ENRICHMENT.model}</code>
                    </p>
                    <p className="dd-enrichment-title">{ENRICHMENT.title}</p>
                    {ENRICHMENT.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                    ))}
                    <p className="dd-enrichment-sources">
                      {ENRICHMENT.sources.map((source, index) => (
                        <span key={source} className="dd-chip dd-chip-source">
                          [{index + 1}] {source}
                        </span>
                      ))}
                    </p>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="dd-dock">
          <textarea
            className="dd-control"
            rows={1}
            placeholder="What do you notice?"
            aria-label="New Capture"
          />
          <button type="button" className="dd-btn dd-btn-primary">
            Commit
          </button>
        </div>

        <nav className="dd-tabbar" aria-label="Primary">
          <span className="dd-tab dd-tab-active">Trail</span>
          <span className="dd-tab">Threads</span>
          <span className="dd-tab">Map</span>
        </nav>
      </div>
      <p className="dd-small">
        Direction {d.key} — {d.tagline}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- page */

function DesignDirectionsPrototype() {
  const searchParams = useSearchParams();
  const direction = directionFor(searchParams.get("variant"));
  const viewport =
    searchParams.get("viewport") === "desktop" ? "desktop" : "mobile";

  return (
    <div
      className={`proto-viewport-stage dd-stage viewport-${viewport}`}
      data-viewport={viewport}
    >
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>
          {viewport === "mobile" ? "Pixel · 390×844" : "Desktop · 1280×900"}
        </span>
        <span>
          {direction.key} — {direction.name}
        </span>
      </div>
      <div className="proto-viewport-frame">
        <main
          className="dd-root"
          data-direction={direction.key}
          style={cssVarsFor(direction) as React.CSSProperties}
        >
          <header className="dd-head">
            <p className="dd-eyebrow">Direction {direction.key}</p>
            <h2 className="dd-name">{direction.name}</h2>
            <p className="dd-tagline">{direction.tagline}</p>
            <p className="dd-contests">{direction.contests}</p>
          </header>
          <div className="dd-columns">
            <div className="dd-col">
              <TokenSheet d={direction} />
              <TypeScale />
              <ColorRoles />
              <Buttons />
              <CaptureForm />
              <ThreadCard />
            </div>
            <div className="dd-col">
              <TrailScreen d={direction} />
            </div>
          </div>
        </main>
      </div>
      <PrototypeSwitcher
        viewportParam="viewport"
        viewports={[...VIEWPORTS]}
        param="variant"
        options={OPTIONS}
      />
    </div>
  );
}

export default function DesignDirectionsPage() {
  return (
    <Suspense fallback={<p className="dd-loading">Loading prototype…</p>}>
      <DesignDirectionsPrototype />
    </Suspense>
  );
}
