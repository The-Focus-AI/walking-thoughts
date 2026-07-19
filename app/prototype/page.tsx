import Link from "next/link";
import "./prototype-index.css";

/**
 * PROTOTYPE hub — list every throwaway UI exploration with direct variant links.
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

function trailHref(area: keyof typeof TRAIL_CLEANUP, variant: string) {
  return `/prototype/trail-cleanup?area=${area}&variant=${variant}`;
}

export default function PrototypeIndexPage() {
  return (
    <main className="proto-index">
      <header className="proto-index-header">
        <p className="proto-index-eyebrow">PROTOTYPE hub</p>
        <h1>Throwaway UI explorations</h1>
        <p>
          Not production. Pick a link — each opens a fixture mock with a
          floating switcher (← → / area tabs).
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
              trail surface.
            </p>
          </div>
          <Link
            className="proto-index-open"
            href="/prototype/trail-cleanup?area=density&variant=A"
          >
            Open switcher
          </Link>
        </div>

        <div className="proto-index-areas">
          {(
            Object.entries(TRAIL_CLEANUP) as Array<
              [keyof typeof TRAIL_CLEANUP, (typeof TRAIL_CLEANUP)[keyof typeof TRAIL_CLEANUP]]
            >
          ).map(([area, variants]) => (
            <div key={area} className="proto-index-area">
              <h3>{area}</h3>
              <ul>
                {variants.map((variant) => (
                  <li key={variant.key}>
                    <Link href={trailHref(area, variant.key)}>
                      <span className="proto-index-key">{variant.key}</span>
                      <span>{variant.label}</span>
                    </Link>
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
