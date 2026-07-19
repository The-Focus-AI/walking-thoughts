import Link from "next/link";
import "./prototype-index.css";

/**
 * PROTOTYPE hub — list every throwaway UI exploration with mobile + desktop links.
 */

const TRAIL_CLEANUP = {
  density: [
    { key: "A", label: "Sticky dock trail" },
    { key: "B", label: "Composer-first sheet" },
    { key: "C", label: "Day strip rail" },
  ],
  sync: [
    { key: "A", label: "Queue chip strip" },
    { key: "B", label: "Status swimlanes" },
    { key: "C", label: "Pulse gutter + footer" },
  ],
  map: [
    { key: "A", label: "Map as home hero" },
    { key: "B", label: "Peer bottom tabs" },
    { key: "C", label: "Place strip + thumbnail" },
  ],
} as const;

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

export default function PrototypeIndexPage() {
  return (
    <main className="proto-index">
      <header className="proto-index-header">
        <p className="proto-index-eyebrow">PROTOTYPE hub</p>
        <h1>Throwaway UI explorations</h1>
        <p>
          Not production. Each variant has <strong>Mobile</strong> and{" "}
          <strong>Desktop</strong> links — open both when judging. Floating
          switcher can flip viewport too (← → / area tabs).
        </p>
        <p className="proto-index-back">
          <Link href="/">← Back to Walking Thoughts</Link>
        </p>
      </header>

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
                    <div className="proto-index-variant">
                      <span className="proto-index-key">{variant.key}</span>
                      <span className="proto-index-variant-label">
                        {variant.label}
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
    </main>
  );
}
