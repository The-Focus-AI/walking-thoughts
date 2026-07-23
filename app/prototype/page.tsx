import Link from "next/link";
import "./prototype-index.css";

/**
 * PROTOTYPE hub — list every throwaway UI exploration with mobile + desktop links.
 */

const TRAIL_CLEANUP = {
  density: [
    { key: "A", label: "Sticky dock trail", winner: true },
    { key: "B", label: "Composer-first sheet", winner: false },
    { key: "C", label: "Day strip rail", winner: false },
  ],
  sync: [
    { key: "A", label: "Queue chip strip", winner: false },
    { key: "B", label: "Status swimlanes", winner: false },
    { key: "C", label: "Pulse gutter + footer", winner: true },
  ],
  map: [
    { key: "A", label: "Map as home hero", winner: true },
    { key: "B", label: "Peer bottom tabs", winner: false },
    { key: "C", label: "Place strip + thumbnail", winner: false },
  ],
} as const;

const THREAD_REVIEW = {
  review: [
    { key: "A", label: "Field ledger", winner: false },
    { key: "B", label: "Split lanes", winner: false },
    { key: "C", label: "Recap first", winner: true },
  ],
  enrich: [
    { key: "A", label: "Annotation card", winner: false },
    { key: "B", label: "Margin notes", winner: false },
    { key: "C", label: "Research dossier", winner: false },
  ],
} as const;

const DESIGN_DIRECTIONS = [
  { key: "a", label: "Forest Night", winner: true },
  { key: "b", label: "Field Notebook", winner: false },
  { key: "c", label: "Instrument Panel", winner: false },
  { key: "d", label: "Ranger Duotone", winner: false },
] as const;

const VIEWPORTS = [
  { key: "mobile", label: "Mobile" },
  { key: "desktop", label: "Desktop" },
] as const;

function trailHref(
  area: keyof typeof TRAIL_CLEANUP,
  variant: string,
  viewport: string,
) {
  return `/prototype/trail-cleanup?viewport=${viewport}&area=${area}&variant=${variant}`;
}

function threadHref(
  area: keyof typeof THREAD_REVIEW,
  variant: string,
  viewport: string,
) {
  return `/prototype/thread-review?viewport=${viewport}&area=${area}&variant=${variant}`;
}

export default function PrototypeIndexPage() {
  return (
    <main className="proto-index">
      <header className="proto-index-header">
        <p className="proto-index-eyebrow">PROTOTYPE hub</p>
        <h1>Throwaway UI explorations</h1>
        <p>
          Not production. Each variant has <strong>Mobile</strong> and{" "}
          <strong>Desktop</strong> links. Floating switcher flips viewport too
          (← → / area tabs).
        </p>
        <p className="proto-index-verdict" role="status">
          Verdict: Density <strong>A</strong> · Sync <strong>C</strong> · Map{" "}
          <strong>A</strong> (issue #53). Winners highlighted below.
        </p>
        <p className="proto-index-back">
          <Link href="/">← Back to Walking Thoughts</Link>
        </p>
      </header>

      <section
        className="proto-index-card"
        aria-labelledby="design-directions-title"
      >
        <div className="proto-index-card-head">
          <div>
            <h2 id="design-directions-title">Design directions</h2>
            <p>
              Brand + design-system specimen for the root <code>DESIGN.md</code>:
              four contrasting visual directions rendering the same tokens,
              type scale, buttons, form, cards, and trail screen.
            </p>
          </div>
          <div className="proto-index-open-row">
            <Link
              className="proto-index-open"
              href="/prototype/design-directions?viewport=mobile&variant=a"
            >
              Open mobile
            </Link>
            <Link
              className="proto-index-open secondary"
              href="/prototype/design-directions?viewport=desktop&variant=a"
            >
              Open desktop
            </Link>
          </div>
        </div>
        <div className="proto-index-areas">
          <div className="proto-index-area">
            <h3>direction</h3>
            <ul>
              {DESIGN_DIRECTIONS.map((variant) => (
                <li key={variant.key}>
                  <div
                    className={
                      variant.winner
                        ? "proto-index-variant winner"
                        : "proto-index-variant"
                    }
                  >
                    <span className="proto-index-key">{variant.key}</span>
                    <span className="proto-index-variant-label">
                      {variant.label}
                      {variant.winner ? (
                        <em className="proto-index-winner-tag"> winner</em>
                      ) : null}
                    </span>
                    <div className="proto-index-viewport-links">
                      {VIEWPORTS.map((viewport) => (
                        <Link
                          key={viewport.key}
                          href={`/prototype/design-directions?viewport=${viewport.key}&variant=${variant.key}`}
                        >
                          {viewport.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="proto-index-card" aria-labelledby="trail-cleanup-title">
        <div className="proto-index-card-head">
          <div>
            <h2 id="trail-cleanup-title">Trail cleanup</h2>
            <p>
              Density, sync glanceability, and map findability for the home
              trail surface — Pixel-ish phone frame vs wide desktop shell.
            </p>
          </div>
          <div className="proto-index-open-row">
            <Link
              className="proto-index-open"
              href="/prototype/trail-cleanup?viewport=mobile&area=density&variant=A"
            >
              Open mobile
            </Link>
            <Link
              className="proto-index-open secondary"
              href="/prototype/trail-cleanup?viewport=desktop&area=density&variant=A"
            >
              Open desktop
            </Link>
          </div>
        </div>

        <div className="proto-index-areas">
          {(
            Object.entries(TRAIL_CLEANUP) as Array<
              [
                keyof typeof TRAIL_CLEANUP,
                (typeof TRAIL_CLEANUP)[keyof typeof TRAIL_CLEANUP],
              ]
            >
          ).map(([area, variants]) => (
            <div key={area} className="proto-index-area">
              <h3>{area}</h3>
              <ul>
                {variants.map((variant) => (
                  <li key={variant.key}>
                    <div
                      className={
                        variant.winner
                          ? "proto-index-variant winner"
                          : "proto-index-variant"
                      }
                    >
                      <span className="proto-index-key">{variant.key}</span>
                      <span className="proto-index-variant-label">
                        {variant.label}
                        {variant.winner ? (
                          <em className="proto-index-winner-tag"> winner</em>
                        ) : null}
                      </span>
                      <div className="proto-index-viewport-links">
                        {VIEWPORTS.map((viewport) => (
                          <Link
                            key={viewport.key}
                            href={trailHref(area, variant.key, viewport.key)}
                          >
                            {viewport.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="proto-index-card" aria-labelledby="thread-review-title">
        <div className="proto-index-card-head">
          <div>
            <h2 id="thread-review-title">Thread review</h2>
            <p>
              The Thread page as a post-walk review surface: denser layouts
              that lead with what you wrote, plus markdown Enrichments with
              sources, a visible research trace, and a follow-up checklist.
            </p>
            <p className="proto-index-verdict" role="status">
              Verdict: Review <strong>C</strong> (Recap first) · Enrich
              undecided (PR #73). Winner highlighted below.
            </p>
          </div>
          <div className="proto-index-open-row">
            <Link
              className="proto-index-open"
              href="/prototype/thread-review?viewport=mobile&area=review&variant=A"
            >
              Open mobile
            </Link>
            <Link
              className="proto-index-open secondary"
              href="/prototype/thread-review?viewport=desktop&area=review&variant=A"
            >
              Open desktop
            </Link>
          </div>
        </div>

        <div className="proto-index-areas">
          {(
            Object.entries(THREAD_REVIEW) as Array<
              [
                keyof typeof THREAD_REVIEW,
                (typeof THREAD_REVIEW)[keyof typeof THREAD_REVIEW],
              ]
            >
          ).map(([area, variants]) => (
            <div key={area} className="proto-index-area">
              <h3>{area}</h3>
              <ul>
                {variants.map((variant) => (
                  <li key={variant.key}>
                    <div
                      className={
                        variant.winner
                          ? "proto-index-variant winner"
                          : "proto-index-variant"
                      }
                    >
                      <span className="proto-index-key">{variant.key}</span>
                      <span className="proto-index-variant-label">
                        {variant.label}
                        {variant.winner ? (
                          <em className="proto-index-winner-tag"> winner</em>
                        ) : null}
                      </span>
                      <div className="proto-index-viewport-links">
                        {VIEWPORTS.map((viewport) => (
                          <Link
                            key={viewport.key}
                            href={threadHref(area, variant.key, viewport.key)}
                          >
                            {viewport.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
