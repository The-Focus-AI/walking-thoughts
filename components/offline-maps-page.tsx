"use client";

import Link from "next/link";
import {
  formatRegionMegabytes,
  regionDownloadPercent,
  regionDownloadProgressLabel,
} from "@/lib/offline-region/download-copy";
import { useRegionInstall } from "@/lib/offline-region/use-region-install";

/**
 * Explicit Offline section — download and verify the Offline Region pack
 * without hunting through the home map hero.
 */
export function OfflineMapsPage() {
  const {
    phase,
    region,
    manifest,
    downloading,
    progress,
    error,
    download,
  } = useRegionInstall(null);

  return (
    <main className="offline-maps" data-testid="offline-maps-page">
      <header className="offline-maps-header">
        <div>
          <p className="eyebrow">Maps</p>
          <h1>Trail maps on this phone</h1>
          <p>
            Download one Offline Region before you leave signal. This is separate
            from network online/offline for Captures — the pack powers Map
            Journal in airplane mode; Captures still save locally either way.
          </p>
        </div>
        <nav className="offline-maps-nav" aria-label="App">
          <Link className="topbar-link" href="/">
            Home
          </Link>
          <Link className="topbar-link" href="/journal">
            Map Journal
          </Link>
          <Link className="topbar-link" href="/threads">
            Threads
          </Link>
        </nav>
      </header>

      <section
        className="offline-maps-card"
        aria-label="Offline Region download"
      >
        {phase === "loading" ? (
          <p role="status">Looking for trail maps…</p>
        ) : null}

        {phase === "missing" && manifest ? (
          <>
            <h2>{manifest.name}</h2>
            <p>
              {manifest.radiusKm} km ·{" "}
              {formatRegionMegabytes(manifest.totalBytes)} · region “{region}”
            </p>
            <p className="offline-maps-note">
              Trails, contours, hillshade, and place names stay on this device
              after the download finishes.
            </p>
            {downloading ? (
              <div
                className="trail-map-hero-progress"
                data-testid="offline-region-download-progress"
              >
                <p>
                  {regionDownloadProgressLabel(progress, manifest.totalBytes)}
                </p>
                <div
                  className="trail-map-hero-progress-track"
                  aria-hidden="true"
                >
                  <div
                    className="trail-map-hero-progress-fill"
                    style={{ width: `${regionDownloadPercent(progress)}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="offline-maps-download"
                onClick={() => void download()}
              >
                Download Offline Region
              </button>
            )}
          </>
        ) : null}

        {phase === "missing" && !manifest ? (
          <>
            <h2>No Offline Region published</h2>
            <p>
              This install does not have a published trail pack yet. You can
              still open the{" "}
              <Link href="/journal?region=fixture">fixture Map Journal</Link>.
            </p>
          </>
        ) : null}

        {phase === "ready" && manifest ? (
          <>
            <h2>{manifest.name}</h2>
            <p data-testid="offline-maps-ready">
              Maps ready offline · v{manifest.version} · {manifest.radiusKm} km
              · {formatRegionMegabytes(manifest.totalBytes)}
            </p>
            <p className="offline-maps-note">
              This phone has the Offline Region. Open Map Journal to walk the
              map without signal. If you previously downloaded the small
              Cornwall village fixture, use Re-download to install the full
              home pack.
            </p>
            <div className="offline-maps-actions">
              <Link className="offline-maps-download" href="/journal">
                Open Map Journal
              </Link>
              <button
                type="button"
                className="offline-maps-secondary"
                onClick={() => void download()}
                disabled={downloading}
              >
                {downloading ? "Re-downloading…" : "Re-download pack"}
              </button>
            </div>
          </>
        ) : null}

        {error ? (
          <p className="capture-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="offline-maps-card" aria-label="What stays offline">
        <h2>What this does</h2>
        <ul>
          <li>
            <strong>Offline Region</strong> — topographic trail maps for airplane
            mode
          </li>
          <li>
            <strong>Captures</strong> — always save on device first; sync when
            you are back online
          </li>
          <li>
            <strong>Shell ready</strong> in the topbar — only means app screens
            are cached, not that trail maps are downloaded
          </li>
        </ul>
      </section>
    </main>
  );
}
